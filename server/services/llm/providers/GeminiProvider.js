import { GoogleGenAI } from '@google/genai';
import { BaseLLMProvider } from '../BaseLLMProvider.js';
import { PromptBuilder } from '../PromptBuilder.js';

export class GeminiProvider extends BaseLLMProvider {
  constructor(config, performanceMonitor = null) {
    super(config, performanceMonitor);
    this.client = new GoogleGenAI({ apiKey: this.config.apiKey });

    // 1M token context; set generous input with buffer
    this.promptBuilder = new PromptBuilder({
      provider: 'gemini',
      model: this.config.model || 'gemini-2.5-flash',
      systemPromptTokens: 800,
      safetyMargin: 0.95, // allow more input, big context
      totalHeadroom: 0.98, // near-full total for Gemini
      targetUtilization: 0.9
    });
  }

  validateConfig() {
    super.validateConfig();
    if (!this.config.apiKey || typeof this.config.apiKey !== 'string') {
      throw new Error('Valid GEMINI_API_KEY is required');
    }
  }

  async validateConnection() {
    try {
      const model = this.config.model || 'gemini-2.5-flash';
      const response = await this.client.models.generateContent({
        model,
        contents: 'ping'
      });
      return !!response?.text;
    } catch (e) {
      console.error('Gemini connection validation failed:', e.message);
      return false;
    }
  }

  async generateInsights(teamData, context) {
    let requestId = null;
    try {
      const sanitizedData = this.sanitizeData(teamData);
      // Minimal pacing; Gemini SDK handles quotas differently

      let prompt = this.promptBuilder.generateRetroPrompt(sanitizedData, context);
      prompt = this.promptBuilder.clampPromptToBudget(prompt);

      const estimatedInputTokens = this.estimateTokenCount(prompt.system + prompt.user);
      requestId = this.startPerformanceTracking(estimatedInputTokens);

      const model = this.config.model || 'gemini-2.5-flash';
      console.log(`Gemini call start: model=${model}, estInputTokens=${estimatedInputTokens}, maxDataTokens=${prompt?.metadata?.maxDataTokens}, estPromptTokens=${prompt?.metadata?.estimatedTokens}`);
      const baseText = `${prompt.system}\n\n${prompt.user}`;
      const response = await this._makeRequestWithRetry(model, baseText);

      let outputText = null; let path = 'none';
      if (response?.text) { outputText = response.text; path = 'response.text'; }
      else if (response?.response?.text) { outputText = response.response.text; path = 'response.response.text'; }
      else if (response?.candidates?.[0]?.content?.parts?.[0]?.text) { outputText = response.candidates[0].content.parts[0].text; path = 'candidates[0].content.parts[0].text'; }
      console.log(`Gemini raw output: path=${path}, length=${outputText ? outputText.length : 0}, snippet="${(outputText || '').slice(0, 200)}"`);
      if (!outputText) throw new Error('Empty response from Gemini');

      const cleanedOutput = this._stripCodeFences(outputText);
      if (cleanedOutput !== outputText) {
        console.log('Gemini output had code fences, stripped before parsing');
      }
      let parsed = this._parseResponse({ text: cleanedOutput }, prompt);
      console.log('Gemini parsed counts (initial):', {
        wentWell: parsed.wentWell?.length || 0,
        didntGoWell: parsed.didntGoWell?.length || 0,
        actionItems: parsed.actionItems?.length || 0
      });

      // If model under-filled any section, ask once more with a stricter instruction (only if the input is small enough to avoid quota issues)
      const needRetry =
        parsed.wentWell.length < 5 ||
        parsed.didntGoWell.length < 5 ||
        parsed.actionItems.length < 5;
      const allowStrictRetry = estimatedInputTokens < 300000; // avoid quota on huge prompts

      if (needRetry && allowStrictRetry) {
        console.log('Gemini under-filled sections, requesting stricter retry...');
        const reinforce = `${prompt.system}\n\n${prompt.user}\n\nIMPORTANT: Return ONLY valid JSON with exactly 5 items for each of wentWell, didntGoWell, and actionItems. If data is limited, infer plausible insights consistent with provided patterns.`;
        const retryResp = await this._makeRequestWithRetry(model, reinforce);
        let retryText = null; let retryPath = 'none';
        if (retryResp?.text) { retryText = retryResp.text; retryPath = 'response.text'; }
        else if (retryResp?.response?.text) { retryText = retryResp.response.text; retryPath = 'response.response.text'; }
        else if (retryResp?.candidates?.[0]?.content?.parts?.[0]?.text) { retryText = retryResp.candidates[0].content.parts[0].text; retryPath = 'candidates[0].content.parts[0].text'; }
        console.log(`Gemini retry raw output: path=${retryPath}, length=${retryText ? retryText.length : 0}, snippet="${(retryText || '').slice(0, 200)}"`);
        if (retryText) {
          const cleanedRetry = this._stripCodeFences(retryText);
          if (cleanedRetry !== retryText) {
            console.log('Gemini retry output had code fences, stripped before parsing');
          }
          parsed = this._parseResponse({ text: cleanedRetry }, prompt);
          console.log('Gemini parsed counts (after retry):', {
            wentWell: parsed.wentWell?.length || 0,
            didntGoWell: parsed.didntGoWell?.length || 0,
            actionItems: parsed.actionItems?.length || 0
          });
        }
      } else if (needRetry) {
        console.log('Skipping strict retry due to high input token estimate; applying padding instead.');
      }

      const beforePad = {
        wentWell: parsed.wentWell?.length || 0,
        didntGoWell: parsed.didntGoWell?.length || 0,
        actionItems: parsed.actionItems?.length || 0
      };
      parsed = this._ensureFivePerSection(parsed);
      const afterPad = {
        wentWell: parsed.wentWell?.length || 0,
        didntGoWell: parsed.didntGoWell?.length || 0,
        actionItems: parsed.actionItems?.length || 0
      };
      if (beforePad.wentWell !== afterPad.wentWell || beforePad.didntGoWell !== afterPad.didntGoWell || beforePad.actionItems !== afterPad.actionItems) {
        console.log('Gemini padding applied to ensure 5/5/5:', { beforePad, afterPad });
      }

      this.completePerformanceTracking(requestId, 0, 'success');
      return parsed;
    } catch (error) {
      if (requestId) this.completePerformanceTracking(requestId, 0, 'error');
      console.error('Gemini insight generation failed:', error.message);
      throw new Error(`Failed to generate insights: ${error.message}`);
    }
  }

  // Summarize a chunk (per source) into a compact JSON paragraph
  async generateChunkSummary(chunkData, context) {
    const model = this.config.model || 'gemini-2.5-flash';
    const text = this._buildChunkSummaryPrompt(chunkData, context);
    const resp = await this._makeRequestWithRetry(model, text);
    const out = resp?.text || resp?.response?.text || resp?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleaned = this._stripCodeFences(out);
    // Return a small object used by aggregator
    return { summary: cleaned.slice(0, 4000), source: context?.source, part: context?.part };
  }

  _buildChunkSummaryPrompt(chunkData, context) {
    const header = `You are summarizing a small data chunk for a larger retrospective analysis. Return a concise JSON with shape { "summary": string }.
Rules:
- Use 3-5 sentences capturing the most salient patterns and metrics.
- Avoid PII; generalize identities.
- Focus on team-level insights.
- Return ONLY JSON.`;
    const body = JSON.stringify(chunkData, null, 2);
    return `${header}\n\nChunk Context: ${context?.source || 'unknown'} ${context?.part || ''}\n\nData:\n${body}\n\nReturn JSON now:`;
  }

  async _makeRequestWithRetry(initialModel, text) {
    const maxRetries = this.config.retryAttempts || 3;
    let lastError;
    let currentModel = initialModel;
    let switchedToFlash = false;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const resp = await this.client.models.generateContent({
          model: currentModel,
          contents: [{ role: 'user', parts: [{ text }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.2,
            topP: 0.8,
            maxOutputTokens: 20000
          }
        });
        return resp;
      } catch (error) {
        lastError = error;
        const isRetryable = this._isRetryableError(error);
        // On first retryable failure, fall back from pro to flash for better availability
        if (isRetryable && !switchedToFlash && typeof currentModel === 'string' && currentModel.includes('pro')) {
          currentModel = 'gemini-2.5-flash';
          switchedToFlash = true;
          console.warn(`Gemini overloaded, switching model to ${currentModel}`);
          continue;
        }
        if (!isRetryable || attempt === maxRetries) {
          throw error;
        }
        const delay = this._calculateRetryDelay(attempt, error);
        console.warn(`Gemini request failed, retrying in ${delay}ms (attempt ${attempt}/${maxRetries}) with model ${currentModel}:`, error?.message || String(error));
        await this._sleep(delay);
      }
    }
    throw lastError;
  }

  _isRetryableError(error) {
    const code = error?.error?.code || error?.code;
    const status = (error?.error?.status || error?.status || '').toString().toUpperCase();
    const msg = (error?.message || '').toLowerCase();
    return code === 503 || status === 'UNAVAILABLE' || msg.includes('overloaded') || code === 429 || status === 'RESOURCE_EXHAUSTED';
  }

  _calculateRetryDelay(attempt, error) {
    const base = this.config.retryDelay || 1000;
    const exp = base * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.1 * exp;
    // Respect server-provided retry info if present
    const retryInfo = this._extractRetryMs(error);
    if (retryInfo) return retryInfo;
    return Math.min(exp + jitter, 15000);
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _extractRetryMs(error) {
    try {
      const details = error?.error?.details || [];
      for (const d of details) {
        if (typeof d?.retryDelay === 'string' && d.retryDelay.endsWith('s')) {
          const secs = parseFloat(d.retryDelay.replace('s',''));
          if (!Number.isNaN(secs)) return Math.floor(secs * 1000);
        }
        if (d?.['@type']?.includes('RetryInfo') && typeof d?.retryDelay === 'string') {
          const secs = parseFloat(d.retryDelay.replace('s',''));
          if (!Number.isNaN(secs)) return Math.floor(secs * 1000);
        }
      }
    } catch (_) {}
    return null;
  }

  _ensureFivePerSection(parsed) {
    const pad = (arr, fallbackTitlePrefix) => {
      const out = Array.isArray(arr) ? [...arr] : [];
      while (out.length < 5) {
        out.push({
          title: `${fallbackTitlePrefix} ${out.length + 1}`,
          details: 'Generated to satisfy minimum count; refine during the retro.',
          source: 'ai',
          confidence: 0.5,
          category: 'process'
        });
      }
      return out.slice(0, 5);
    };
    return {
      wentWell: pad(parsed.wentWell, 'Team positive pattern'),
      didntGoWell: pad(parsed.didntGoWell, 'Issue identified'),
      actionItems: pad(parsed.actionItems, 'Action to consider'),
      analysisMetadata: parsed.analysisMetadata
    };
  }

  _parseResponse(response, prompt = null) {
    const content = response?.text;
    if (!content) throw new Error('Empty Gemini response');
    try {
      const parsed = JSON.parse(content);
      if (!parsed.wentWell || !parsed.didntGoWell || !parsed.actionItems) {
        throw new Error('Response missing required sections');
      }
      const addMeta = (arr) => (arr || []).map(x => ({
        ...x,
        source: 'ai',
        llmProvider: 'gemini',
        model: this.config.model || 'gemini-2.5-flash',
        confidence: x.confidence || 0.7,
        reasoning: x.reasoning || 'AI-generated insight'
      }));
      return {
        wentWell: addMeta(parsed.wentWell),
        didntGoWell: addMeta(parsed.didntGoWell),
        actionItems: addMeta(parsed.actionItems),
        metadata: {
          provider: 'gemini',
          model: this.config.model || 'gemini-2.5-flash',
          promptTokens: prompt?.metadata?.estimatedTokens,
          generatedAt: new Date().toISOString()
        }
      };
    } catch (err) {
      // Fallback partial extraction
      return {
        wentWell: [{ title: 'AI Analysis Available', details: content.slice(0, 500), source: 'ai', llmProvider: 'gemini' }],
        didntGoWell: [],
        actionItems: [],
        metadata: { provider: 'gemini', model: this.config.model || 'gemini-2.5-flash', parseError: true }
      };
    }
  }

  _stripCodeFences(text) {
    if (!text) return text;
    let trimmed = text.trim();
    if (trimmed.startsWith('```')) {
      trimmed = trimmed.replace(/^```json\s*/i, '').replace(/^```\s*/i, '');
    }
    if (trimmed.endsWith('```')) {
      trimmed = trimmed.replace(/```\s*$/i, '');
    }
    return trimmed.trim();
  }
}

export default GeminiProvider;


