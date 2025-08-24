/**
 * Enhanced Error Handler for LLM operations
 * Provides comprehensive error categorization, user-friendly messages, and recovery suggestions
 */

export class LLMError extends Error {
  constructor(message, type, code, details = {}) {
    super(message);
    this.name = 'LLMError';
    this.type = type;
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
    this.recoverable = this.isRecoverable();
  }

  isRecoverable() {
    const recoverableTypes = [
      'RATE_LIMIT',
      'TIMEOUT',
      'NETWORK_ERROR',
      'TEMPORARY_UNAVAILABLE'
    ];
    return recoverableTypes.includes(this.type);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      code: this.code,
      details: this.details,
      timestamp: this.timestamp,
      recoverable: this.recoverable
    };
  }
}

export class LLMErrorHandler {
  static ERROR_TYPES = {
    // Configuration errors
    CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
    INVALID_API_KEY: 'INVALID_API_KEY',
    INVALID_MODEL: 'INVALID_MODEL',
    MISSING_PROVIDER: 'MISSING_PROVIDER',
    
    // Network and connectivity errors
    NETWORK_ERROR: 'NETWORK_ERROR',
    CONNECTION_FAILED: 'CONNECTION_FAILED',
    TIMEOUT: 'TIMEOUT',
    
    // API errors
    RATE_LIMIT: 'RATE_LIMIT',
    QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
    UNAUTHORIZED: 'UNAUTHORIZED',
    FORBIDDEN: 'FORBIDDEN',
    NOT_FOUND: 'NOT_FOUND',
    
    // Processing errors
    INVALID_RESPONSE: 'INVALID_RESPONSE',
    PARSING_ERROR: 'PARSING_ERROR',
    VALIDATION_ERROR: 'VALIDATION_ERROR',
    
    // System errors
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    TEMPORARY_UNAVAILABLE: 'TEMPORARY_UNAVAILABLE',
    UNKNOWN_ERROR: 'UNKNOWN_ERROR'
  };

  static ERROR_CODES = {
    // Configuration (1000-1099)
    CONFIG_MISSING: 1001,
    CONFIG_INVALID: 1002,
    API_KEY_MISSING: 1003,
    API_KEY_INVALID: 1004,
    MODEL_INVALID: 1005,
    PROVIDER_UNSUPPORTED: 1006,
    
    // Network (1100-1199)
    NETWORK_TIMEOUT: 1101,
    CONNECTION_REFUSED: 1102,
    DNS_ERROR: 1103,
    SSL_ERROR: 1104,
    
    // API (1200-1299)
    RATE_LIMITED: 1201,
    QUOTA_EXCEEDED: 1202,
    UNAUTHORIZED_ACCESS: 1203,
    FORBIDDEN_ACCESS: 1204,
    RESOURCE_NOT_FOUND: 1205,
    
    // Processing (1300-1399)
    RESPONSE_INVALID: 1301,
    RESPONSE_EMPTY: 1302,
    PARSING_FAILED: 1303,
    VALIDATION_FAILED: 1304,
    
    // System (1400-1499)
    INTERNAL_FAILURE: 1401,
    SERVICE_UNAVAILABLE: 1402,
    UNKNOWN_FAILURE: 1499
  };

  /**
   * Create an LLMError from a raw error
   * @param {Error} error - Raw error object
   * @param {string} context - Context where error occurred
   * @returns {LLMError} Categorized LLM error
   */
  static createError(error, context = 'unknown') {
    const errorInfo = this.categorizeError(error);
    
    return new LLMError(
      errorInfo.userMessage,
      errorInfo.type,
      errorInfo.code,
      {
        originalMessage: error.message,
        context,
        stack: error.stack,
        ...errorInfo.details
      }
    );
  }

  /**
   * Categorize error and provide user-friendly information
   * @param {Error} error - Raw error object
   * @returns {Object} Error categorization info
   */
  static categorizeError(error) {
    const message = error.message?.toLowerCase() || '';
    
    // Configuration errors
    if (message.includes('api key') || message.includes('unauthorized')) {
      if (message.includes('missing') || message.includes('required')) {
        return {
          type: this.ERROR_TYPES.INVALID_API_KEY,
          code: this.ERROR_CODES.API_KEY_MISSING,
          userMessage: 'API key is missing. Please check your configuration.',
          details: { 
            suggestion: 'Add your API key to the environment variables or configuration.',
            configField: 'apiKey'
          }
        };
      } else {
        return {
          type: this.ERROR_TYPES.UNAUTHORIZED,
          code: this.ERROR_CODES.UNAUTHORIZED_ACCESS,
          userMessage: 'Invalid API key. Please check your credentials.',
          details: { 
            suggestion: 'Verify your API key is correct and has the necessary permissions.',
            configField: 'apiKey'
          }
        };
      }
    }

    // Rate limiting
    if (message.includes('rate limit') || message.includes('too many requests')) {
      return {
        type: this.ERROR_TYPES.RATE_LIMIT,
        code: this.ERROR_CODES.RATE_LIMITED,
        userMessage: 'API rate limit exceeded. Please wait before trying again.',
        details: { 
          suggestion: 'Wait a few minutes before retrying, or upgrade your API plan.',
          retryAfter: this.extractRetryAfter(error)
        }
      };
    }

    // Quota exceeded
    if (message.includes('quota') || message.includes('billing') || message.includes('credits')) {
      return {
        type: this.ERROR_TYPES.QUOTA_EXCEEDED,
        code: this.ERROR_CODES.QUOTA_EXCEEDED,
        userMessage: 'API quota exceeded. Please check your billing or upgrade your plan.',
        details: { 
          suggestion: 'Check your API usage dashboard and consider upgrading your plan.'
        }
      };
    }

    // Network errors
    if (message.includes('timeout') || message.includes('timed out')) {
      return {
        type: this.ERROR_TYPES.TIMEOUT,
        code: this.ERROR_CODES.NETWORK_TIMEOUT,
        userMessage: 'Request timed out. The AI service is taking too long to respond.',
        details: { 
          suggestion: 'Try again with a smaller dataset or increase the timeout setting.',
          configField: 'timeout'
        }
      };
    }

    if (message.includes('network') || message.includes('connection') || message.includes('econnrefused')) {
      return {
        type: this.ERROR_TYPES.CONNECTION_FAILED,
        code: this.ERROR_CODES.CONNECTION_REFUSED,
        userMessage: 'Cannot connect to the AI service. Please check your internet connection.',
        details: { 
          suggestion: 'Check your internet connection and try again.'
        }
      };
    }

    // Model errors
    if (message.includes('model') && (message.includes('not found') || message.includes('invalid'))) {
      return {
        type: this.ERROR_TYPES.INVALID_MODEL,
        code: this.ERROR_CODES.MODEL_INVALID,
        userMessage: 'The specified AI model is not available or invalid.',
        details: { 
          suggestion: 'Check the model name and ensure it\'s supported by your provider.',
          configField: 'model'
        }
      };
    }

    // Response parsing errors
    if (message.includes('parse') || message.includes('json') || message.includes('invalid response')) {
      return {
        type: this.ERROR_TYPES.PARSING_ERROR,
        code: this.ERROR_CODES.PARSING_FAILED,
        userMessage: 'The AI service returned an invalid response format.',
        details: { 
          suggestion: 'This is usually temporary. Please try again.'
        }
      };
    }

    // Forbidden access
    if (message.includes('forbidden') || message.includes('403')) {
      return {
        type: this.ERROR_TYPES.FORBIDDEN,
        code: this.ERROR_CODES.FORBIDDEN_ACCESS,
        userMessage: 'Access denied. Your API key may not have the required permissions.',
        details: { 
          suggestion: 'Check your API key permissions or contact your provider.'
        }
      };
    }

    // Service unavailable
    if (message.includes('unavailable') || message.includes('503') || message.includes('502')) {
      return {
        type: this.ERROR_TYPES.TEMPORARY_UNAVAILABLE,
        code: this.ERROR_CODES.SERVICE_UNAVAILABLE,
        userMessage: 'The AI service is temporarily unavailable.',
        details: { 
          suggestion: 'Please try again in a few minutes.'
        }
      };
    }

    // Default to unknown error
    return {
      type: this.ERROR_TYPES.UNKNOWN_ERROR,
      code: this.ERROR_CODES.UNKNOWN_FAILURE,
      userMessage: 'An unexpected error occurred during AI analysis.',
      details: { 
        suggestion: 'Please try again. If the problem persists, contact support.',
        originalError: error.message
      }
    };
  }

  /**
   * Extract retry-after information from error
   * @param {Error} error - Error object
   * @returns {number|null} Retry after seconds
   */
  static extractRetryAfter(error) {
    // Try to extract from error message or headers
    const message = error.message || '';
    const retryMatch = message.match(/retry.*?(\d+).*?second/i);
    if (retryMatch) {
      return parseInt(retryMatch[1]);
    }
    
    // Default retry times based on error type
    if (message.includes('rate limit')) {
      return 60; // 1 minute for rate limits
    }
    
    return null;
  }

  /**
   * Get user-friendly error message with recovery suggestions
   * @param {LLMError} error - LLM error object
   * @returns {Object} User-friendly error information
   */
  static getUserFriendlyError(error) {
    const baseInfo = {
      title: this.getErrorTitle(error.type),
      message: error.message,
      type: error.type,
      recoverable: error.recoverable,
      timestamp: error.timestamp
    };

    // Add specific suggestions based on error type
    switch (error.type) {
      case this.ERROR_TYPES.INVALID_API_KEY:
      case this.ERROR_TYPES.UNAUTHORIZED:
        return {
          ...baseInfo,
          actions: [
            { type: 'config', label: 'Check API Key', field: 'apiKey' },
            { type: 'retry', label: 'Try Again', delay: 0 }
          ],
          fallback: 'Continue with rule-based analysis only'
        };

      case this.ERROR_TYPES.RATE_LIMIT:
        return {
          ...baseInfo,
          actions: [
            { 
              type: 'retry', 
              label: `Retry in ${error.details.retryAfter || 60} seconds`, 
              delay: (error.details.retryAfter || 60) * 1000 
            }
          ],
          fallback: 'Continue with rule-based analysis only'
        };

      case this.ERROR_TYPES.TIMEOUT:
        return {
          ...baseInfo,
          actions: [
            { type: 'config', label: 'Increase Timeout', field: 'timeout' },
            { type: 'retry', label: 'Try Again', delay: 0 }
          ],
          fallback: 'Continue with rule-based analysis only'
        };

      case this.ERROR_TYPES.QUOTA_EXCEEDED:
        return {
          ...baseInfo,
          actions: [
            { type: 'external', label: 'Check Usage Dashboard', url: this.getProviderDashboard(error.details.provider) }
          ],
          fallback: 'Continue with rule-based analysis only'
        };

      case this.ERROR_TYPES.INVALID_MODEL:
        return {
          ...baseInfo,
          actions: [
            { type: 'config', label: 'Select Different Model', field: 'model' },
            { type: 'retry', label: 'Try Again', delay: 0 }
          ],
          fallback: 'Continue with rule-based analysis only'
        };

      default:
        return {
          ...baseInfo,
          actions: [
            { type: 'retry', label: 'Try Again', delay: 5000 }
          ],
          fallback: 'Continue with rule-based analysis only'
        };
    }
  }

  /**
   * Get error title for display
   * @param {string} errorType - Error type
   * @returns {string} User-friendly title
   */
  static getErrorTitle(errorType) {
    const titles = {
      [this.ERROR_TYPES.CONFIGURATION_ERROR]: 'Configuration Error',
      [this.ERROR_TYPES.INVALID_API_KEY]: 'Invalid API Key',
      [this.ERROR_TYPES.INVALID_MODEL]: 'Invalid Model',
      [this.ERROR_TYPES.NETWORK_ERROR]: 'Network Error',
      [this.ERROR_TYPES.CONNECTION_FAILED]: 'Connection Failed',
      [this.ERROR_TYPES.TIMEOUT]: 'Request Timeout',
      [this.ERROR_TYPES.RATE_LIMIT]: 'Rate Limited',
      [this.ERROR_TYPES.QUOTA_EXCEEDED]: 'Quota Exceeded',
      [this.ERROR_TYPES.UNAUTHORIZED]: 'Unauthorized',
      [this.ERROR_TYPES.FORBIDDEN]: 'Access Denied',
      [this.ERROR_TYPES.PARSING_ERROR]: 'Response Error',
      [this.ERROR_TYPES.TEMPORARY_UNAVAILABLE]: 'Service Unavailable',
      [this.ERROR_TYPES.UNKNOWN_ERROR]: 'Unexpected Error'
    };
    
    return titles[errorType] || 'Error';
  }

  /**
   * Get provider dashboard URL for quota/billing issues
   * @param {string} provider - Provider name
   * @returns {string|null} Dashboard URL
   */
  static getProviderDashboard(provider) {
    const dashboards = {
      'openai': 'https://platform.openai.com/usage',
      'anthropic': 'https://console.anthropic.com/dashboard',
      'local': null
    };
    
    return dashboards[provider] || null;
  }

  /**
   * Check if error should trigger fallback to rule-based analysis
   * @param {LLMError} error - LLM error object
   * @returns {boolean} Whether to use fallback
   */
  static shouldFallback(error) {
    const fallbackTypes = [
      this.ERROR_TYPES.QUOTA_EXCEEDED,
      this.ERROR_TYPES.FORBIDDEN,
      this.ERROR_TYPES.INVALID_MODEL,
      this.ERROR_TYPES.CONFIGURATION_ERROR,
      this.ERROR_TYPES.UNKNOWN_ERROR
    ];
    
    return fallbackTypes.includes(error.type);
  }

  /**
   * Get retry strategy for error
   * @param {LLMError} error - LLM error object
   * @returns {Object|null} Retry strategy or null if no retry
   */
  static getRetryStrategy(error) {
    if (!error.recoverable) {
      return null;
    }

    switch (error.type) {
      case this.ERROR_TYPES.RATE_LIMIT:
        return {
          maxAttempts: 2,
          delay: (error.details.retryAfter || 60) * 1000,
          backoff: 'fixed'
        };

      case this.ERROR_TYPES.TIMEOUT:
      case this.ERROR_TYPES.NETWORK_ERROR:
      case this.ERROR_TYPES.CONNECTION_FAILED:
        return {
          maxAttempts: 3,
          delay: 1000,
          backoff: 'exponential'
        };

      case this.ERROR_TYPES.TEMPORARY_UNAVAILABLE:
        return {
          maxAttempts: 2,
          delay: 5000,
          backoff: 'fixed'
        };

      default:
        return {
          maxAttempts: 1,
          delay: 1000,
          backoff: 'fixed'
        };
    }
  }
}