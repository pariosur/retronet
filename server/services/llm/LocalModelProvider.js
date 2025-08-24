import { BaseLLMProvider } from './BaseLLMProvider.js';
import { PromptBuilder } from './PromptBuilder.js';

/**
 * Local Model Provider
 * Implements local LLM provider for Ollama and other local inference services
 */
export class LocalModelProvider extends BaseLLMProvider {
  constructor(config, performanceMonitor = null) {
    super(config, performanceMonitor);
    this.endpoint = this.config.endpoint || 'http://localhost:11434';
    this.rateLimitDelay = 0;
    this.lastRequestTime = 0;
    
    // Initialize prompt builder with local model token limits
    this.promptBuilder = new PromptBuilder({
      maxTokens: this.config.maxTokens || 4000,
      systemPromptTokens: 800,
      reserveTokens: 200
    });
  }

  /**
   * Validates local model configuration
   * @throws {Error} If configuration is invalid
   */
  validateConfig() {
    // Skip API key validation for local provider
    if (!this.config) {
      throw new Error('Local model provider configuration is required');
    }

    if (this.config.endpoint && !this._isValidUrl(this.config.endpoint)) {
      throw new Error('Invalid endpoint URL for local model provider');
    }

    // Validate model name if provided
    if (this.config.model && typeof this.config.model !== 'string') {
      throw new Error('Model name must be a string');
    }
  }

  /**
   * Validates if a string is a valid URL
   * @private
   */
  _isValidUrl(string) {
    try {
      new URL(string);
      return true;
    } catch (_) {
      return false;
    }
  }

  /**
   * Tests connectivity to local model service
   * @returns {Promise<boolean>} True if connection is successful
   */
  async validateConnection() {
    try {
      // First check if the service is running
      const healthResponse = await this._makeRequest('/api/tags', 'GET');
      
      if (!healthResponse.ok) {
        return false;
      }

      // Check if the specified model is available
      const models = await healthResponse.json();
      const modelName = this.config.model || 'llama2';
      
      if (models.models && Array.isArray(models.models)) {
        const modelExists = models.models.some(model => 
          model.name === modelName || model.name.startsWith(modelName + ':')
        );
        
        if (!modelExists) {
          console.warn(`Model ${modelName} not found. Available models:`, 
            models.models.map(m => m.name).join(', '));
          return false;
        }
      }

      // Test with a minimal generation request
      const testResponse = await this._generateText('test', { max_tokens: 1 });
      return testResponse !== null;
      
    } catch (error) {
      console.error('Local model connection validation failed:', error.message);
      return false;
    }
  }

  /**
   * Discovers available local models
   * @returns {Promise<Array>} List of available models
   */
  async discoverModels() {
    try {
      const response = await this._makeRequest('/api/tags', 'GET');
      
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      
      if (data.models && Array.isArray(data.models)) {
        return data.models.map(model => ({
          name: model.name,
          size: model.size,
          modified: model.modified_at,
          digest: model.digest
        }));
      }
      
      return [];
    } catch (error) {
      console.error('Failed to discover local models:', error.message);
      return [];
    }
  }

  /**
   * Checks if a specific model is available
   * @param {string} modelName - Name of the model to check
   * @returns {Promise<boolean>} True if model is available
   */
  async isModelAvailable(modelName) {
    try {
      const models = await this.discoverModels();
      return models.some(model => 
        model.name === modelName || model.name.startsWith(modelName + ':')
      );
    } catch (error) {
      console.error('Failed to check model availability:', error.message);
      return false;
    }
  }

  /**
   * Generates insights from team data using local model
   * @param {Object} teamData - Combined data from GitHub, Linear, and Slack
   * @param {Object} context - Additional context like date range, team size
   * @returns {Promise<Object>} Structured insights object
   */
  async generateInsights(teamData, context) {
    let requestId = null;
    
    try {
      // Sanitize data (local models still benefit from clean data)
      const sanitizedData = this.sanitizeData(teamData);
      
      // Apply rate limiting to prevent overwhelming local service
      await this._applyRateLimit();
      
      // Generate optimized prompt using PromptBuilder
      const prompt = this.promptBuilder.generateRetroPrompt(sanitizedData, context);
      
      // Start performance tracking
      const estimatedInputTokens = this.estimateTokenCount(prompt.system + prompt.user);
      requestId = this.startPerformanceTracking(estimatedInputTokens);
      
      // Make request with retry logic
      const response = await this._generateWithRetry(prompt);
      
      // Complete performance tracking with success
      // Local models typically don't provide token counts, so estimate
      const outputTokens = this.estimateTokenCount(response.response || '');
      this.completePerformanceTracking(requestId, outputTokens, 'success');
      
      // Parse and validate response
      return this._parseResponse(response, prompt);
      
    } catch (error) {
      // Complete performance tracking with error
      if (requestId) {
        this.completePerformanceTracking(requestId, 0, 'error');
      }
      
      console.error('Local model insight generation failed:', error.message);
      throw new Error(`Failed to generate insights: ${error.message}`);
    }
  }

  /**
   * Makes a request to the local model service with retry logic
   * @private
   */
  async _generateWithRetry(prompt) {
    const maxRetries = this.config.retryAttempts || 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const fullPrompt = `${prompt.system}\n\n${prompt.user}`;
        const response = await this._generateText(fullPrompt, {
          max_tokens: this.config.maxTokens || 4000,
          temperature: this.config.temperature || 0.7,
          format: 'json'
        });

        if (response === null) {
          throw new Error('Empty response from local model');
        }

        return response;
      } catch (error) {
        lastError = error;
        
        if (this._isRetryableError(error) && attempt < maxRetries) {
          const delay = this._calculateRetryDelay(attempt);
          console.warn(`Local model request failed, retrying in ${delay}ms (attempt ${attempt}/${maxRetries}):`, error.message);
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
   * Generates text using the local model API
   * @private
   */
  async _generateText(prompt, options = {}) {
    const modelName = this.config.model || 'llama2';
    
    const requestBody = {
      model: modelName,
      prompt: prompt,
      stream: false,
      options: {
        temperature: options.temperature || 0.7,
        num_predict: options.max_tokens || 4000,
        top_p: options.top_p || 0.9,
        top_k: options.top_k || 40
      }
    };

    // Add format specification for JSON output if supported
    if (options.format === 'json') {
      requestBody.format = 'json';
    }

    const response = await this._makeRequest('/api/generate', 'POST', requestBody);
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Local model request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data = await response.json();
    return data.response || null;
  }

  /**
   * Makes HTTP request to local model service
   * @private
   */
  async _makeRequest(path, method = 'GET', body = null) {
    const url = `${this.endpoint}${path}`;
    const timeout = this.config.timeout || 30000;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const options = {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        signal: controller.signal
      };

      if (body && method !== 'GET') {
        options.body = JSON.stringify(body);
      }

      const response = await fetch(url, options);
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      
      throw error;
    }
  }

  /**
   * Parses and validates local model response
   * @private
   */
  _parseResponse(response, prompt = null) {
    if (!response || typeof response !== 'string') {
      throw new Error('Invalid response from local model');
    }

    try {
      // Try to parse as JSON first
      const parsed = JSON.parse(response);
      
      // Validate structure - if missing sections, throw to trigger fallback
      if (!parsed.wentWell || !parsed.didntGoWell || !parsed.actionItems) {
        throw new Error('Response missing required sections');
      }

      // Add metadata to insights
      const addMetadata = (insights) => {
        return insights.map(insight => ({
          ...insight,
          source: 'ai',
          llmProvider: 'local',
          model: this.config.model || 'llama2',
          confidence: insight.confidence || 0.7,
          reasoning: insight.reasoning || 'AI-generated insight'
        }));
      };

      return {
        wentWell: addMetadata(parsed.wentWell || []),
        didntGoWell: addMetadata(parsed.didntGoWell || []),
        actionItems: addMetadata(parsed.actionItems || []),
        metadata: {
          provider: 'local',
          model: this.config.model || 'llama2',
          endpoint: this.endpoint,
          promptTemplate: prompt?.metadata?.template,
          promptTokens: prompt?.metadata?.estimatedTokens,
          generatedAt: new Date().toISOString()
        }
      };
    } catch (parseError) {
      console.error('Failed to parse local model response:', parseError.message);
      console.error('Raw response:', response.substring(0, 500));
      
      // Try to extract partial insights from malformed JSON or plain text
      return this._extractPartialInsights(response);
    }
  }

  /**
   * Extracts partial insights from malformed response
   * @private
   */
  _extractPartialInsights(content) {
    const fallbackInsight = {
      title: 'Local AI Analysis Available',
      details: 'The local AI provided analysis but in an unexpected format. Please review the raw output.',
      source: 'ai',
      llmProvider: 'local',
      model: this.config.model || 'llama2',
      confidence: 0.5,
      category: 'technical',
      rawContent: content.substring(0, 500) // Truncate for safety
    };

    return {
      wentWell: [fallbackInsight],
      didntGoWell: [],
      actionItems: [],
      metadata: {
        provider: 'local',
        model: this.config.model || 'llama2',
        endpoint: this.endpoint,
        parseError: true,
        generatedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Applies rate limiting to prevent overwhelming local service
   * @private
   */
  async _applyRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    // Minimum delay between requests (local models may be slower)
    const minDelay = 500; // 500ms minimum for local models
    
    if (timeSinceLastRequest < minDelay) {
      await this._sleep(minDelay - timeSinceLastRequest);
    }
    
    this.lastRequestTime = Date.now();
  }

  /**
   * Checks if error is retryable
   * @private
   */
  _isRetryableError(error) {
    // Connection errors, timeouts, and server errors are retryable
    return error.message.includes('timeout') ||
           error.message.includes('ECONNREFUSED') ||
           error.message.includes('ECONNRESET') ||
           error.message.includes('ETIMEDOUT') ||
           error.message.includes('500') ||
           error.message.includes('502') ||
           error.message.includes('503') ||
           error.message.includes('504');
  }

  /**
   * Calculates retry delay with exponential backoff
   * @private
   */
  _calculateRetryDelay(attempt) {
    const baseDelay = this.config.retryDelay || 2000; // Longer base delay for local models
    
    // Exponential backoff: baseDelay * 2^(attempt-1) with jitter
    const exponentialDelay = baseDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
    
    return Math.min(exponentialDelay + jitter, 60000); // Cap at 60 seconds for local models
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
   * Gets the local service endpoint
   * @returns {string} Service endpoint URL
   */
  getEndpoint() {
    return this.endpoint;
  }

  /**
   * Checks if the local service is running
   * @returns {Promise<boolean>} True if service is accessible
   */
  async isServiceRunning() {
    try {
      const response = await this._makeRequest('/api/tags', 'GET');
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Gets service information
   * @returns {Promise<Object>} Service information including version and models
   */
  async getServiceInfo() {
    try {
      const [tagsResponse, versionResponse] = await Promise.allSettled([
        this._makeRequest('/api/tags', 'GET'),
        this._makeRequest('/api/version', 'GET')
      ]);

      const info = {
        endpoint: this.endpoint,
        running: false,
        models: [],
        version: null
      };

      if (tagsResponse.status === 'fulfilled' && tagsResponse.value.ok) {
        info.running = true;
        const tagsData = await tagsResponse.value.json();
        info.models = tagsData.models || [];
      }

      if (versionResponse.status === 'fulfilled' && versionResponse.value.ok) {
        const versionData = await versionResponse.value.json();
        info.version = versionData.version || null;
      }

      return info;
    } catch (error) {
      return {
        endpoint: this.endpoint,
        running: false,
        models: [],
        version: null,
        error: error.message
      };
    }
  }
}