import OpenAI from 'openai';
import { BaseLLMProvider } from './BaseLLMProvider.js';
import { PromptBuilder } from './PromptBuilder.js';

/**
 * OpenAI LLM Provider
 * Implements OpenAI-specific LLM provider with GPT-4 and GPT-3.5-turbo support
 */
export class OpenAIProvider extends BaseLLMProvider {
  constructor(config, performanceMonitor = null) {
    super(config, performanceMonitor);
    this.client = new OpenAI({
      apiKey: this.config.apiKey,
      timeout: this.config.timeout || 30000
    });
    this.rateLimitDelay = 0;
    this.lastRequestTime = 0;
    
    // Initialize prompt builder with dynamic model-based token limits
    this.promptBuilder = new PromptBuilder({
      provider: 'openai',
      model: this.config.model || 'gpt-4o',
      systemPromptTokens: 800
    });
  }

  /**
   * Validates OpenAI-specific configuration
   * @throws {Error} If configuration is invalid
   */
  validateConfig() {
    super.validateConfig();
    
    if (!this.config.apiKey || !this.config.apiKey.startsWith('sk-')) {
      throw new Error('Valid OpenAI API key is required (must start with sk-)');
    }

    const supportedModels = [
      'gpt-4',
      'gpt-4-turbo',
      'gpt-4-turbo-preview',
      'gpt-4o',
      'gpt-3.5-turbo',
      'gpt-3.5-turbo-16k',
      'o1-preview',
      'o1-mini',
      'gpt-5',
      'gpt-5-mini',
      'gpt-5-nano'
    ];

    if (this.config.model && !supportedModels.includes(this.config.model)) {
      throw new Error(`Unsupported OpenAI model: ${this.config.model}. Supported models: ${supportedModels.join(', ')}`);
    }
  }

  /**
   * Tests connectivity to OpenAI API
   * @returns {Promise<boolean>} True if connection is successful
   */
  async validateConnection() {
    try {
      const model = this.config.model || 'gpt-3.5-turbo';
      const isGPT5Model = model.startsWith('gpt-5');
      
      if (isGPT5Model) {
        // GPT-5 uses the Responses API for validation
        const response = await this.client.responses.create({
          model: model,
          input: 'test',
          reasoning: { effort: 'low' },
          text: { verbosity: 'low' }
        });
        
        return response && response.output_text;
      } else {
        // Legacy models use Chat Completions API
        const response = await this.client.chat.completions.create({
          model: model,
          messages: [{ role: 'user', content: 'test' }],
          max_tokens: 1,
          temperature: 0
        });
        
        return response && response.choices && response.choices.length > 0;
      }
    } catch (error) {
      console.error('OpenAI connection validation failed:', error.message);
      return false;
    }
  }

  /**
   * Generates insights from team data using OpenAI
   * @param {Object} teamData - Combined data from GitHub, Linear, and Slack
   * @param {Object} context - Additional context like date range, team size
   * @returns {Promise<Object>} Structured insights object
   */
  async generateInsights(teamData, context) {
    let requestId = null;
    
    try {
      // Sanitize data before sending to OpenAI
      const sanitizedData = this.sanitizeData(teamData);
      
      // Apply rate limiting
      await this._applyRateLimit();
      
      // Generate optimized prompt using PromptBuilder
      let prompt = this.promptBuilder.generateRetroPrompt(sanitizedData, context);
      // Hard clamp to ensure we never exceed model limits despite estimator variance
      prompt = this.promptBuilder.clampPromptToBudget(prompt);
      
      // Start performance tracking
      const estimatedInputTokens = this.estimateTokenCount(prompt.system + prompt.user);
      requestId = this.startPerformanceTracking(estimatedInputTokens);
      console.log('OpenAI generateInsights start', {
        model: this.config.model || 'gpt-3.5-turbo',
        provider: 'openai',
        approxInputTokens: estimatedInputTokens
      });
      
      // Make request with retry logic
      const response = await this._makeRequestWithRetry(prompt);
      console.log('OpenAI response received', {
        hasOutputText: !!response?.output_text,
        outputLen: Array.isArray(response?.output) ? response.output.length : undefined,
        hasChoices: Array.isArray(response?.choices),
        choicesLen: Array.isArray(response?.choices) ? response.choices.length : undefined,
        status: response?.status
      });
      
      // Complete performance tracking with success
      const outputTokens = response.usage?.completion_tokens || 0;
      this.completePerformanceTracking(requestId, outputTokens, 'success');
      
      // Parse and validate response
      const parsed = this._parseResponse(response, prompt);
      return parsed;
      
    } catch (error) {
      // Complete performance tracking with error
      if (requestId) {
        this.completePerformanceTracking(requestId, 0, 'error');
      }
      
      console.error('OpenAI insight generation failed:', error.message);
      throw new Error(`Failed to generate insights: ${error.message}`);
    }
  }



  /**
   * Makes OpenAI API request with retry logic
   * @private
   */
  async _makeRequestWithRetry(prompt) {
    const maxRetries = this.config.retryAttempts || 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const model = this.config.model || 'gpt-3.5-turbo';
        const isGPT5Model = model.startsWith('gpt-5');
        const isO1Model = model.startsWith('o1-');
        
        let response;
        
        if (isGPT5Model) {
          // GPT-5 uses the new Responses API with comprehensive schema
          const requestConfig = {
            model: model,
            input: `${prompt.system}\n\n${prompt.user}`,
            instructions: 'Generate comprehensive retrospective insights in JSON format. Include the most high-quality insights supported by the data, prioritizing relevance and actionability.',
            reasoning: { effort: this.config.reasoningEffort || 'medium' },
            text: {
              verbosity: this.config.verbosity || 'high',
              format: {
                type: 'json_schema',
                name: 'ComprehensiveRetroInsights',
                strict: true,
                schema: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['wentWell', 'didntGoWell', 'actionItems'],
                  properties: {
                    wentWell: {
                      type: 'array',
                      minItems: 10,
                      items: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['title', 'details', 'source', 'confidence', 'category', 'reasoning'],
                        properties: {
                          title: { type: 'string' },
                          details: { type: 'string' },
                          source: { type: 'string', enum: ['ai'] },
                          confidence: { type: 'number', minimum: 0, maximum: 1 },
                          category: { type: 'string', enum: ['technical', 'process', 'team-dynamics', 'communication'] },
                          reasoning: { type: 'string' }
                        }
                      }
                    },
                    didntGoWell: {
                      type: 'array',
                      minItems: 10,
                      items: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['title', 'details', 'source', 'confidence', 'category', 'reasoning'],
                        properties: {
                          title: { type: 'string' },
                          details: { type: 'string' },
                          source: { type: 'string', enum: ['ai'] },
                          confidence: { type: 'number', minimum: 0, maximum: 1 },
                          category: { type: 'string', enum: ['technical', 'process', 'team-dynamics', 'communication'] },
                          reasoning: { type: 'string' }
                        }
                      }
                    },
                    actionItems: {
                      type: 'array',
                      minItems: 1,
                      maxItems: 4,
                      items: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['title', 'details', 'source', 'priority', 'category', 'reasoning'],
                        properties: {
                          title: { type: 'string' },
                          details: { type: 'string' },
                          source: { type: 'string', enum: ['ai'] },
                          priority: { type: 'string', enum: ['high', 'medium', 'low'] },
                          category: { type: 'string', enum: ['technical', 'process', 'team-dynamics', 'communication'] },
                          reasoning: { type: 'string' }
                        }
                      }
                    }
                  }
                }
              }
            },
            // Increase output tokens significantly for comprehensive insights
            max_output_tokens: Math.min(16000, this.config.maxTokens || 16000)
          };
          
          response = await this.client.responses.create(requestConfig);
          // If reasoning-only output (no message text), reissue without any optional knobs
          const maybeText = this._extractResponseText(response);
          if (!maybeText) {
            console.warn('OpenAI GPT-5 returned reasoning-only; reissuing request without extras...');
            const fallbackConfig = {
              model: model,
              input: `${prompt.system}\n\n${prompt.user}`,
              instructions: 'Generate comprehensive retrospective insights in JSON format. Include detailed insights with full context, evidence, and reasoning. No artificial limits on number of insights.',
              reasoning: { effort: this.config.reasoningEffort || 'low' },
              text: {
                verbosity: 'low',
                format: {
                  type: 'json_schema',
                  name: 'RetroTitles',
                  strict: true,
                  schema: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['wentWell', 'didntGoWell', 'actionItems'],
                    properties: {
                      wentWell: {
                        type: 'array',
                        minItems: 10,
                        items: {
                          type: 'object',
                          additionalProperties: false,
                          required: ['title', 'details', 'source', 'confidence', 'category', 'reasoning'],
                          properties: {
                            title: { type: 'string' },
                            details: { type: 'string' },
                            source: { type: 'string' },
                            confidence: { type: 'number' },
                            category: { type: 'string' },
                            reasoning: { type: 'string' }
                          }
                        }
                      },
                      didntGoWell: {
                        type: 'array',
                        minItems: 10,
                        items: {
                          type: 'object',
                          additionalProperties: false,
                          required: ['title', 'details', 'source', 'confidence', 'category', 'reasoning'],
                          properties: {
                            title: { type: 'string' },
                            details: { type: 'string' },
                            source: { type: 'string' },
                            confidence: { type: 'number' },
                            category: { type: 'string' },
                            reasoning: { type: 'string' }
                          }
                        }
                      },
                      actionItems: {
                        type: 'array',
                        minItems: 1,
                        maxItems: 4,
                        items: {
                          type: 'object',
                          additionalProperties: false,
                          required: ['title', 'details', 'source', 'priority', 'category', 'reasoning'],
                          properties: {
                            title: { type: 'string' },
                            details: { type: 'string' },
                            source: { type: 'string' },
                            priority: { type: 'string' },
                            category: { type: 'string' },
                            reasoning: { type: 'string' }
                          }
                        }
                      }
                    }
                  }
                }
              },
              max_output_tokens: Math.min(16000, this.config.maxTokens || 16000)
            };
            response = await this.client.responses.create(fallbackConfig);
            // One more fallback: if still no text, route to Chat Completions on gpt-4o for final aggregation
            const maybeText2 = this._extractResponseText(response);
            if (!maybeText2) {
              console.warn('OpenAI GPT-5 still reasoning-only; falling back to gpt-4o chat for final JSON...');
              const chatFallback = await this.client.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                  { role: 'system', content: 'You are a helpful assistant that returns comprehensive retrospective insights in JSON format with keys: wentWell, didntGoWell, actionItems. Generate detailed insights with full context and evidence.' },
                  { role: 'user', content: `${prompt.system}\n\n${prompt.user}` }
                ],
                temperature: 0.2,
                response_format: {
                  type: 'json_schema',
                  json_schema: {
                    name: 'ComprehensiveRetroInsights',
                    strict: true,
                    schema: {
                      type: 'object',
                      additionalProperties: false,
                      required: ['wentWell', 'didntGoWell', 'actionItems'],
                      properties: {
                        wentWell: {
                          type: 'array',
                          minItems: 10,
                          items: {
                            type: 'object',
                            additionalProperties: false,
                            required: ['title', 'details', 'source', 'confidence', 'category', 'reasoning'],
                            properties: {
                              title: { type: 'string' },
                              details: { type: 'string' },
                              source: { type: 'string' },
                              confidence: { type: 'number' },
                              category: { type: 'string' },
                              reasoning: { type: 'string' }
                            }
                          }
                        },
                        didntGoWell: {
                          type: 'array',
                          minItems: 10,
                          items: {
                            type: 'object',
                            additionalProperties: false,
                            required: ['title', 'details', 'source', 'confidence', 'category', 'reasoning'],
                            properties: {
                              title: { type: 'string' },
                              details: { type: 'string' },
                              source: { type: 'string' },
                              confidence: { type: 'number' },
                              category: { type: 'string' },
                              reasoning: { type: 'string' }
                            }
                          }
                        },
                        actionItems: {
                          type: 'array',
                          minItems: 1,
                          maxItems: 4,
                          items: {
                            type: 'object',
                            additionalProperties: false,
                            required: ['title', 'details', 'source', 'priority', 'category', 'reasoning'],
                            properties: {
                              title: { type: 'string' },
                              details: { type: 'string' },
                              source: { type: 'string' },
                              priority: { type: 'string' },
                              category: { type: 'string' },
                              reasoning: { type: 'string' }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              });
              return chatFallback;
            }
          }
        } else {
          // Legacy models use Chat Completions API
          const requestConfig = {
            model: model,
            messages: isO1Model 
              ? [{ role: 'user', content: `${prompt.system}\n\n${prompt.user}` }]
              : [
                  { role: 'system', content: prompt.system },
                  { role: 'user', content: prompt.user }
                ],
            max_tokens: this.config.maxTokens || (isO1Model ? 32768 : 4000)
          };
          
          // Add parameters that o1 models don't support
          if (!isO1Model) {
            requestConfig.temperature = this.config.temperature || 0.7;
            requestConfig.response_format = { type: 'json_object' };
          }
          
          response = await this.client.chat.completions.create(requestConfig);
        }

        return response;
      } catch (error) {
        lastError = error;
        
        if (this._isRateLimitError(error)) {
          const delay = this._calculateRetryDelay(attempt, error);
          console.warn(`OpenAI rate limit hit, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
          await this._sleep(delay);
          continue;
        }
        
        if (this._isRetryableError(error) && attempt < maxRetries) {
          const delay = this._calculateRetryDelay(attempt);
          console.warn(`OpenAI request failed, retrying in ${delay}ms (attempt ${attempt}/${maxRetries}):`, error.message);
          await this._sleep(delay);
          continue;
        }
        
        // Non-retryable error or max retries reached
        throw error;
      }
    }

    throw lastError;
  }

  /**
   * Parses and validates OpenAI response
   * @private
   */
  _parseResponse(response, prompt = null) {
    let content;
    const model = this.config.model || 'gpt-3.5-turbo';
    const isGPT5Model = model.startsWith('gpt-5');
    
    if (isGPT5Model) {
      // GPT-5 Responses API format
      if (!response) {
        console.error('OpenAI empty response object');
        content = '';
      } else {
        const meta = {
          id: response?.id,
          status: response?.status,
          hasOutputText: !!response?.output_text,
          outputTypes: Array.isArray(response?.output) ? response.output.map(o => o?.type) : [],
          hasMessageChoice: Array.isArray(response?.choices)
        };
        console.log('OpenAI Responses metadata', meta);
        content = this._extractResponseText(response);
      }
    } else {
      // Legacy Chat Completions API format
      if (!response || !response.choices || response.choices.length === 0) {
        throw new Error('Invalid response from OpenAI');
      }
      content = response.choices[0].message?.content;
    }
    
    if (!content) {
      console.error('OpenAI empty/unknown response shape:', JSON.stringify(response).slice(0, 500));
      if (!content) {
        return this._extractPartialInsights(JSON.stringify(response || {}).slice(0, 1000));
      }
    }

    try {
      // Strip code fences if present
      let cleaned = content.trim();
      if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '');
      if (cleaned.endsWith('```')) cleaned = cleaned.replace(/```\s*$/i, '');
      // If still not valid JSON, try to extract the largest JSON block
      let parsed;
      try {
        parsed = JSON.parse(cleaned);
      } catch (_) {
        const first = cleaned.indexOf('{');
        const last = cleaned.lastIndexOf('}');
        if (first !== -1 && last !== -1 && last > first) {
          const candidate = cleaned.slice(first, last + 1);
          parsed = JSON.parse(candidate);
        } else {
          throw new Error('No JSON block found');
        }
      }
      console.log('OpenAI parsed JSON keys:', Object.keys(parsed || {}));
      
      // Validate structure - only require wentWell and didntGoWell now
      if (!parsed.wentWell || !parsed.didntGoWell) {
        throw new Error('Response missing required sections');
      }

      // Add metadata to insights
      const addMetadata = (insights) => {
        return (insights || []).map(insight => ({
          ...insight,
          source: 'ai',
          llmProvider: 'openai',
          model: this.config.model || 'gpt-3.5-turbo',
          confidence: insight.confidence || 0.7,
          reasoning: insight.reasoning || 'AI-generated insight'
        }));
      };

      return {
        wentWell: addMetadata(parsed.wentWell || []),
        didntGoWell: addMetadata(parsed.didntGoWell || []),
        actionItems: addMetadata(parsed.actionItems || []),
        metadata: {
          provider: 'openai',
          model: this.config.model || 'gpt-3.5-turbo',
          tokensUsed: isGPT5Model ? (response.usage?.total_tokens || 0) : (response.usage?.total_tokens || 0),
          promptTemplate: prompt?.metadata?.template,
          promptTokens: prompt?.metadata?.estimatedTokens,
          generatedAt: new Date().toISOString()
        }
      };
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', parseError.message);
      console.error('Raw response:', content);
      
      // Try to extract partial insights from malformed JSON
      return this._extractPartialInsights(content);
    }
  }

  _extractResponseText(resp) {
    if (!resp) return '';
    if (resp.output_text) return resp.output_text;
    // Responses API: prefer message content parts with type output_text
    if (Array.isArray(resp.output)) {
      for (const out of resp.output) {
        const contents = Array.isArray(out?.content) ? out.content : (Array.isArray(out?.contents) ? out.contents : []);
        for (const part of contents) {
          if (typeof part?.text === 'string') return part.text;
          if (part?.type === 'output_text' && typeof part?.text === 'string') return part.text;
        }
      }
    }
    // Fallbacks
    if (resp.choices?.[0]?.message?.content) return resp.choices[0].message.content;
    if (resp.response?.text) return resp.response.text;
    return '';
  }

  /**
   * Extracts partial insights from malformed JSON response
   * @private
   */
  _extractPartialInsights(content) {
    const fallbackInsight = {
      title: 'AI Analysis Available',
      details: 'The AI provided analysis but in an unexpected format. Please review the raw output.',
      source: 'ai',
      llmProvider: 'openai',
      confidence: 0.5,
      category: 'technical',
      rawContent: content.substring(0, 500) // Truncate for safety
    };

    return {
      wentWell: [fallbackInsight],
      didntGoWell: [],
      actionItems: [],
      metadata: {
        provider: 'openai',
        model: this.config.model || 'gpt-3.5-turbo',
        parseError: true,
        generatedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Applies rate limiting to prevent API quota issues
   * @private
   */
  async _applyRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    // Minimum delay between requests (adjust based on your rate limits)
    const minDelay = 100; // 100ms minimum
    
    if (timeSinceLastRequest < minDelay) {
      await this._sleep(minDelay - timeSinceLastRequest);
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Checks if error is due to rate limiting
   * @private
   */
  _isRateLimitError(error) {
    return error.status === 429 || 
           error.code === 'rate_limit_exceeded' ||
           error.message?.includes('rate limit');
  }

  /**
   * Checks if error is retryable
   * @private
   */
  _isRetryableError(error) {
    const retryableStatuses = [408, 429, 500, 502, 503, 504];
    return retryableStatuses.includes(error.status) ||
           error.code === 'ECONNRESET' ||
           error.code === 'ETIMEDOUT';
  }

  /**
   * Calculates retry delay with exponential backoff
   * @private
   */
  _calculateRetryDelay(attempt, error = null) {
    const baseDelay = this.config.retryDelay || 1000;
    
    // If rate limit error, use the retry-after header if available
    if (error && this._isRateLimitError(error)) {
      const retryAfter = error.headers?.['retry-after'];
      if (retryAfter) {
        return parseInt(retryAfter, 10) * 1000; // Convert to milliseconds
      }
    }
    
    // Exponential backoff: baseDelay * 2^(attempt-1) with jitter
    const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
    
    return Math.min(exponentialDelay + jitter, 30000); // Cap at 30 seconds
  }

  /**
   * Sleep utility for delays
   * @private
   */
  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Gets token count estimate for text (delegates to PromptBuilder)
   * @param {string} text - Text to estimate tokens for
   * @returns {number} Estimated token count
   */
  estimateTokens(text) {
    return this.promptBuilder.estimateTokens(text);
  }

  /**
   * Gets prompt usage statistics
   * @param {Object} prompt - Generated prompt object
   * @returns {Object} Token usage breakdown
   */
  getPromptUsage(prompt) {
    return this.promptBuilder.getTokenUsage(prompt);
  }

  /**
   * Optimizes data for token limits (backward compatibility)
   * @param {Object} teamData - Team data to optimize
   * @param {number} maxTokens - Maximum tokens allowed
   * @returns {Object} Optimized team data
   */
  optimizeDataForTokens(teamData, maxTokens = 3000) {
    // Use PromptBuilder's optimization logic
    const tempBuilder = new PromptBuilder({ 
      maxTokens: maxTokens + 1000, // Add buffer for system prompt
      systemPromptTokens: 800,
      reserveTokens: 200
    });
    
    return tempBuilder.optimizeDataForTokens(teamData, {
      dateRange: { start: '2024-01-01', end: '2024-01-31' },
      teamSize: 5
    });
  }

  /**
   * Summarize a chunk for progressive analysis.
   */
  async generateChunkSummary(chunkData, context = {}) {
    const model = this.config.model || 'gpt-3.5-turbo';
    const isGPT5Model = model.startsWith('gpt-5');
    const isO1Model = model.startsWith('o1-');
    let prompt = this._buildChunkSummaryPrompt(chunkData, context);
    if (prompt.length > 200000) {
      prompt = prompt.slice(0, 200000) + '\n...';
    }

    try {
      let text;
      if (isGPT5Model) {
        const response = await this.client.responses.create({
          model,
          input: prompt,
          reasoning: { effort: 'low' },
          text: { verbosity: 'low' }
        });
        text = response?.output_text || this._extractResponseText(response);
      } else {
        const requestConfig = {
          model,
          messages: isO1Model 
            ? [{ role: 'user', content: prompt }]
            : [
                { role: 'system', content: 'You are a helpful assistant that returns ONLY JSON.' },
                { role: 'user', content: prompt }
              ],
          max_tokens: 1000
        };
        if (!isO1Model) requestConfig.response_format = { type: 'json_object' };
        const response = await this.client.chat.completions.create(requestConfig);
        text = response?.choices?.[0]?.message?.content;
      }

      if (!text) return { summary: '', source: context.source, part: context.part };
      let cleaned = text.trim();
      if (cleaned.startsWith('```')) cleaned = cleaned.replace(/^```json\s*/i, '').replace(/^```\s*/i, '');
      if (cleaned.endsWith('```')) cleaned = cleaned.replace(/```\s*$/i, '');
      try {
        const parsed = JSON.parse(cleaned);
        if (parsed && typeof parsed === 'object' && parsed.summary) {
          return { summary: String(parsed.summary).slice(0, 4000), source: context.source, part: context.part };
        }
      } catch (_) {}
      return { summary: cleaned.slice(0, 4000), source: context.source, part: context.part };
    } catch (error) {
      console.warn('OpenAI chunk summary failed:', error?.message || String(error));
      return { summary: '', source: context.source, part: context.part };
    }
  }

  _buildChunkSummaryPrompt(chunkData, context) {
    const header = `Summarize the following data chunk as compact JSON with shape { "summary": string }.
Rules:
- 3-5 sentences with key patterns, metrics, and themes.
- Team-level perspective; avoid PII.
- Return ONLY JSON.`;
    const body = JSON.stringify(chunkData, null, 2);
    const ctx = `Source: ${context?.source || 'unknown'} ${context?.part || ''}`;
    return `${header}\n\n${ctx}\n\nData:\n${body}\n\nReturn JSON now:`;
  }
}