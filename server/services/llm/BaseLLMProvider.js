/**
 * Base LLM Provider Interface
 * Defines common interface for all LLM providers to ensure consistent behavior
 */
export class BaseLLMProvider {
  constructor(config, performanceMonitor = null) {
    this.config = config;
    this.performanceMonitor = performanceMonitor;
    this.validateConfig();
  }

  /**
   * Validates the provider configuration
   * @throws {Error} If configuration is invalid
   */
  validateConfig() {
    if (!this.config) {
      throw new Error('LLM provider configuration is required');
    }
    if (!this.config.apiKey && this.config.provider !== 'local') {
      throw new Error('API key is required for external LLM providers');
    }
  }

  /**
   * Generates insights from team data using the LLM
   * @param {Object} teamData - Combined data from GitHub, Linear, and Slack
   * @param {Object} context - Additional context like date range, team size
   * @returns {Promise<Object>} Structured insights object
   */
  async generateInsights(teamData, context) {
    throw new Error('generateInsights method must be implemented by provider');
  }

  /**
   * Starts performance monitoring for a request
   * @param {number} inputTokens - Estimated input tokens
   * @returns {string|null} Request ID for tracking
   */
  startPerformanceTracking(inputTokens) {
    if (!this.performanceMonitor) return null;
    
    return this.performanceMonitor.startRequest(
      this.getProviderName(),
      this.getModel(),
      inputTokens
    );
  }

  /**
   * Completes performance monitoring for a request
   * @param {string} requestId - Request ID from startPerformanceTracking
   * @param {number} outputTokens - Number of output tokens
   * @param {string} status - Request status ('success' or 'error')
   */
  completePerformanceTracking(requestId, outputTokens = 0, status = 'success') {
    if (!this.performanceMonitor || !requestId) return;
    
    this.performanceMonitor.completeRequest(requestId, outputTokens, status);
  }

  /**
   * Estimates token count for text (rough approximation)
   * @param {string} text - Text to estimate
   * @returns {number} Estimated token count
   */
  estimateTokenCount(text) {
    if (!text) return 0;
    // Rough approximation: 1 token ≈ 4 characters for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Tests connectivity to the LLM provider
   * @returns {Promise<boolean>} True if connection is successful
   */
  async validateConnection() {
    throw new Error('validateConnection method must be implemented by provider');
  }

  /**
   * Sanitizes data by removing sensitive information
   * @param {Object} data - Raw data to sanitize
   * @returns {Object} Sanitized data
   */
  sanitizeData(data) {
    if (!data) return data;

    // Create deep copy to avoid mutating original data
    const sanitized = JSON.parse(JSON.stringify(data));

    // Remove common sensitive patterns
    this._sanitizeObject(sanitized);
    
    return sanitized;
  }

  /**
   * Recursively sanitizes an object
   * @private
   */
  _sanitizeObject(obj) {
    if (!obj || typeof obj !== 'object') return;

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const value = obj[key];
        
        if (typeof value === 'string') {
          obj[key] = this._sanitizeString(value);
        } else if (Array.isArray(value)) {
          value.forEach(item => this._sanitizeObject(item));
        } else if (typeof value === 'object') {
          this._sanitizeObject(value);
        }
      }
    }
  }

  /**
   * Sanitizes sensitive information from strings
   * @private
   */
  _sanitizeString(str) {
    if (!str) return str;

    // Email pattern
    str = str.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]');
    
    // API key patterns (common formats) - order matters for specificity
    str = str.replace(/\bsk-[A-Za-z0-9]{48,}\b/g, '[API_KEY]');
    str = str.replace(/\bghp_[A-Za-z0-9]{36,}\b/g, '[GITHUB_TOKEN]');
    str = str.replace(/\bxoxb-[A-Za-z0-9-]+\b/g, '[SLACK_TOKEN]');
    str = str.replace(/\b[A-Za-z0-9]{32,}\b/g, '[API_KEY]');
    
    return str;
  }

  /**
   * Gets the provider name
   * @returns {string} Provider name
   */
  getProviderName() {
    return this.config.provider || 'unknown';
  }

  /**
   * Gets the model being used
   * @returns {string} Model name
   */
  getModel() {
    return this.config.model || 'default';
  }

  /**
   * Checks if the provider is available
   * @returns {Promise<boolean>} True if provider is available
   */
  async isAvailable() {
    try {
      return await this.validateConnection();
    } catch (error) {
      return false;
    }
  }
}