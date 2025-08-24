import Anthropic from '@anthropic-ai/sdk';
import { BaseLLMProvider } from './BaseLLMProvider.js';
import { PromptBuilder } from './PromptBuilder.js';

/**
 * Anthropic LLM Provider
 * Implements Anthropic-specific LLM provider with Claude model support
 */
export class AnthropicProvider extends BaseLLMProvider {
  constructor(config, performanceMonitor = null) {
    super(config, performanceMonitor);
    this.client = new Anthropic({
      apiKey: this.config.apiKey,
      timeout: this.config.timeout || 30000
    });
    this.rateLimitDelay = 0;
    this.lastRequestTime = 0;
    
    // Initialize prompt builder with Anthropic-specific token limits
    this.promptBuilder = new PromptBuilder({
      maxTokens: this.config.maxTokens || 4000,
      systemPromptTokens: 800,
      reserveTokens: 200
    });
  }

  /**
   * Validates Anthropic-specific configuration
   * @throws {Error} If configuration is invalid
   */
  validateConfig() {
    super.validateConfig();
    
    if (!this.config.apiKey || !this.config.apiKey.startsWith('sk-ant-')) {
      throw new Error('Valid Anthropic API key is required (must start with sk-ant-)');
    }

    const supportedModels = [
      'claude-3-opus-20240229',
      'claude-3-sonnet-20240229',
      'claude-3-haiku-20240307',
      'claude-2.1',
      'claude-2.0',
      'claude-instant-1.2'
    ];

    if (this.config.model && !supportedModels.includes(this.config.model)) {
      throw new Error(`Unsupported Anthropic model: ${this.config.model}. Supported models: ${supportedModels.join(', ')}`);
    }
  }

  /**
   * Tests connectivity to Anthropic API
   * @returns {Promise<boolean>} True if connection is successful
   */
  async validateConnection() {
    try {
      // Make a minimal request to test the connection
      const response = await this.client.messages.create({
        model: this.config.model || 'claude-3-sonnet-20240229',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }]
      });
      
      return response && response.content && response.content.length > 0;
    } catch (error) {
      console.error('Anthropic connection validation failed:', error.message);
      return false;
    }
  }

  /**
   * Generates insights from team data using Anthropic
   * @param {Object} teamData - Combined data from GitHub, Linear, and Slack
   * @param {Object} context - Additional context like date range, team size
   * @returns {Promise<Object>} Structured insights object
   */
  async generateInsights(teamData, context) {
    let requestId = null;
    
    try {
      // Sanitize data before sending to Anthropic
      const sanitizedData = this.sanitizeData(teamData);
      
      // Apply rate limiting
      await this._applyRateLimit();
      
      // Generate optimized prompt using PromptBuilder
      const prompt = this.promptBuilder.generateRetroPrompt(sanitizedData, context);
      
      // Start performance tracking
      const estimatedInputTokens = this.estimateTokenCount(prompt.system + prompt.user);
      requestId = this.startPerformanceTracking(estimatedInputTokens);
      
      // Make request with retry logic
      const response = await this._makeRequestWithRetry(prompt);
      
      // Complete performance tracking with success
      const outputTokens = response.usage?.output_tokens || 0;
      this.completePerformanceTracking(requestId, outputTokens, 'success');
      
      // Parse and validate response
      return this._parseResponse(response, prompt);
      
    } catch (error) {
      // Complete performance tracking with error
      if (requestId) {
        this.completePerformanceTracking(requestId, 0, 'error');
      }
      
      console.error('Anthropic insight generation failed:', error.message);
      throw new Error(`Failed to generate insights: ${error.message}`);
    }
  }

  /**
   * Makes Anthropic API request with retry logic
   * @private
   */
  async _makeRequestWithRetry(prompt) {
    const maxRetries = this.config.retryAttempts || 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Format prompt for Anthropic's message format
        const messages = [
          { role: 'user', content: this._formatPromptForAnthropic(prompt) }
        ];

        const response = await this.client.messages.create({
          model: this.config.model || 'claude-3-sonnet-20240229',
          max_tokens: this.config.maxTokens || 4000,
          temperature: this.config.temperature || 0.7,
          messages: messages,
          system: prompt.system || undefined
        });

        return response;
      } catch (error) {
        lastError = error;
        
        if (this._isRateLimitError(error)) {
          const delay = this._calculateRetryDelay(attempt, error);
          console.warn(`Anthropic rate limit hit, retrying in ${delay}ms (attempt ${attempt}/${maxRetries})`);
          await this._sleep(delay);
          continue;
        }
        
        if (this._isRetryableError(error) && attempt < maxRetries) {
          const delay = this._calculateRetryDelay(attempt);
          console.warn(`Anthropic request failed, retrying in ${delay}ms (attempt ${attempt}/${maxRetries}):`, error.message);
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
   * Formats prompt for Anthropic's message format
   * @private
   */
  _formatPromptForAnthropic(prompt) {
    // Combine system and user prompts for Anthropic format
    let formattedPrompt = '';
    
    if (prompt.system) {
      formattedPrompt += `System: ${prompt.system}\n\n`;
    }
    
    formattedPrompt += `Human: ${prompt.user}\n\nPlease respond with a valid JSON object containing the retrospective insights.`;
    
    return formattedPrompt;
  }

  /**
   * Parses and validates Anthropic response
   * @private
   */
  _parseResponse(response, prompt = null) {
    if (!response || !response.content || response.content.length === 0) {
      throw new Error('Invalid response from Anthropic');
    }

    const content = response.content[0]?.text;
    if (!content) {
      throw new Error('Empty response from Anthropic');
    }

    try {
      // Try to extract JSON from the response
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      const jsonContent = jsonMatch ? jsonMatch[0] : content;
      
      const parsed = JSON.parse(jsonContent);
      
      // Validate structure - if missing sections, throw to trigger fallback
      if (!parsed.wentWell || !parsed.didntGoWell || !parsed.actionItems) {
        throw new Error('Response missing required sections');
      }

      // Add metadata to insights
      const addMetadata = (insights) => {
        return insights.map(insight => ({
          ...insight,
          source: 'ai',
          llmProvider: 'anthropic',
          model: this.config.model || 'claude-3-sonnet-20240229',
          confidence: insight.confidence || 0.7,
          reasoning: insight.reasoning || 'AI-generated insight'
        }));
      };

      return {
        wentWell: addMetadata(parsed.wentWell || []),
        didntGoWell: addMetadata(parsed.didntGoWell || []),
        actionItems: addMetadata(parsed.actionItems || []),
        metadata: {
          provider: 'anthropic',
          model: this.config.model || 'claude-3-sonnet-20240229',
          tokensUsed: response.usage?.input_tokens + response.usage?.output_tokens || 0,
          inputTokens: response.usage?.input_tokens || 0,
          outputTokens: response.usage?.output_tokens || 0,
          promptTemplate: prompt?.metadata?.template,
          promptTokens: prompt?.metadata?.estimatedTokens,
          generatedAt: new Date().toISOString()
        }
      };
    } catch (parseError) {
      console.error('Failed to parse Anthropic response:', parseError.message);
      console.error('Raw response:', content);
      
      // Try to extract partial insights from malformed JSON
      return this._extractPartialInsights(content);
    }
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
      llmProvider: 'anthropic',
      confidence: 0.5,
      category: 'technical',
      rawContent: content.substring(0, 500) // Truncate for safety
    };

    return {
      wentWell: [fallbackInsight],
      didntGoWell: [],
      actionItems: [],
      metadata: {
        provider: 'anthropic',
        model: this.config.model || 'claude-3-sonnet-20240229',
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
    
    // Minimum delay between requests (Anthropic has different rate limits than OpenAI)
    const minDelay = 200; // 200ms minimum for Anthropic
    
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
           error.type === 'rate_limit_error' ||
           error.message?.includes('rate limit') ||
           error.message?.includes('Rate limit');
  }

  /**
   * Checks if error is retryable
   * @private
   */
  _isRetryableError(error) {
    const retryableStatuses = [408, 429, 500, 502, 503, 504];
    const retryableTypes = ['rate_limit_error', 'api_error', 'overloaded_error'];
    
    return retryableStatuses.includes(error.status) ||
           retryableTypes.includes(error.type) ||
           error.code === 'ECONNRESET' ||
           error.code === 'ETIMEDOUT';
  }

  /**
   * Calculates retry delay with exponential backoff
   * @private
   */
  _calculateRetryDelay(attempt, error = null) {
    const baseDelay = this.config.retryDelay || 1000;
    
    // If rate limit error, use a longer delay for Anthropic
    if (error && this._isRateLimitError(error)) {
      // Anthropic doesn't provide retry-after header, use conservative delay
      return Math.min(baseDelay * Math.pow(2, attempt), 60000); // Cap at 60 seconds
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
}