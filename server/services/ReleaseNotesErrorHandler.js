/**
 * Release Notes Error Handler
 * Provides comprehensive error handling, graceful degradation, and user feedback for release notes generation
 */

import { LLMErrorHandler, LLMError } from './llm/ErrorHandler.js';

export class ReleaseNotesError extends Error {
  constructor(message, type, code, details = {}) {
    super(message);
    this.name = 'ReleaseNotesError';
    this.type = type;
    this.code = code;
    this.details = details;
    this.timestamp = new Date().toISOString();
    this.recoverable = this.isRecoverable();
  }

  isRecoverable() {
    const recoverableTypes = [
      'DATA_SOURCE_UNAVAILABLE',
      'PARTIAL_DATA_FAILURE',
      'NETWORK_ERROR',
      'TIMEOUT',
      'RATE_LIMIT'
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

export class ReleaseNotesErrorHandler {
  static ERROR_TYPES = {
    // Data source errors
    DATA_SOURCE_UNAVAILABLE: 'DATA_SOURCE_UNAVAILABLE',
    PARTIAL_DATA_FAILURE: 'PARTIAL_DATA_FAILURE',
    ALL_SOURCES_FAILED: 'ALL_SOURCES_FAILED',
    
    // Configuration errors
    INVALID_DATE_RANGE: 'INVALID_DATE_RANGE',
    MISSING_CONFIGURATION: 'MISSING_CONFIGURATION',
    
    // Processing errors
    NO_DATA_FOUND: 'NO_DATA_FOUND',
    ANALYSIS_FAILED: 'ANALYSIS_FAILED',
    CATEGORIZATION_FAILED: 'CATEGORIZATION_FAILED',
    
    // LLM errors (delegated to LLMErrorHandler)
    LLM_ERROR: 'LLM_ERROR',
    
    // System errors
    INTERNAL_ERROR: 'INTERNAL_ERROR',
    TIMEOUT: 'TIMEOUT',
    NETWORK_ERROR: 'NETWORK_ERROR'
  };

  static ERROR_CODES = {
    // Data source (2000-2099)
    GITHUB_UNAVAILABLE: 2001,
    LINEAR_UNAVAILABLE: 2002,
    SLACK_UNAVAILABLE: 2003,
    MULTIPLE_SOURCES_FAILED: 2004,
    ALL_SOURCES_FAILED: 2005,
    
    // Configuration (2100-2199)
    INVALID_DATE_FORMAT: 2101,
    DATE_RANGE_TOO_LARGE: 2102,
    FUTURE_DATE_RANGE: 2103,
    MISSING_API_KEYS: 2104,
    
    // Processing (2200-2299)
    NO_CHANGES_FOUND: 2201,
    ANALYSIS_TIMEOUT: 2202,
    CATEGORIZATION_FAILED: 2203,
    TRANSLATION_FAILED: 2204,
    
    // System (2300-2399)
    INTERNAL_FAILURE: 2301,
    TIMEOUT_ERROR: 2302,
    MEMORY_ERROR: 2303
  };

  /**
   * Create a release notes error from a raw error
   * @param {Error} error - Raw error object
   * @param {string} context - Context where error occurred
   * @param {Object} metadata - Additional metadata
   * @returns {ReleaseNotesError} Categorized release notes error
   */
  static createError(error, context = 'unknown', metadata = {}) {
    // Check if it's already an LLM error
    if (error instanceof LLMError) {
      return new ReleaseNotesError(
        error.message,
        this.ERROR_TYPES.LLM_ERROR,
        error.code,
        {
          originalError: error,
          context,
          llmErrorType: error.type,
          ...metadata
        }
      );
    }

    const errorInfo = this.categorizeError(error, context, metadata);
    
    return new ReleaseNotesError(
      errorInfo.userMessage,
      errorInfo.type,
      errorInfo.code,
      {
        originalMessage: error.message,
        context,
        stack: error.stack,
        ...errorInfo.details,
        ...metadata
      }
    );
  }

  /**
   * Categorize error and provide user-friendly information
   * @param {Error} error - Raw error object
   * @param {string} context - Context where error occurred
   * @param {Object} metadata - Additional metadata
   * @returns {Object} Error categorization info
   */
  static categorizeError(error, context, metadata = {}) {
    const message = error.message?.toLowerCase() || '';
    
    // Data source specific errors
    if (context.includes('github') || message.includes('github')) {
      return {
        type: this.ERROR_TYPES.DATA_SOURCE_UNAVAILABLE,
        code: this.ERROR_CODES.GITHUB_UNAVAILABLE,
        userMessage: 'GitHub data is currently unavailable. Release notes will be generated from other sources.',
        details: { 
          source: 'github',
          suggestion: 'Check your GitHub token and network connection.',
          fallbackAvailable: true
        }
      };
    }

    if (context.includes('linear') || message.includes('linear')) {
      return {
        type: this.ERROR_TYPES.DATA_SOURCE_UNAVAILABLE,
        code: this.ERROR_CODES.LINEAR_UNAVAILABLE,
        userMessage: 'Linear data is currently unavailable. Release notes will be generated from other sources.',
        details: { 
          source: 'linear',
          suggestion: 'Check your Linear API key and network connection.',
          fallbackAvailable: true
        }
      };
    }

    if (context.includes('slack') || message.includes('slack')) {
      return {
        type: this.ERROR_TYPES.DATA_SOURCE_UNAVAILABLE,
        code: this.ERROR_CODES.SLACK_UNAVAILABLE,
        userMessage: 'Slack data is currently unavailable. Release notes will be generated from other sources.',
        details: { 
          source: 'slack',
          suggestion: 'Check your Slack bot token and permissions.',
          fallbackAvailable: true
        }
      };
    }

    // Date range errors
    if (message.includes('date') && (message.includes('invalid') || message.includes('format'))) {
      return {
        type: this.ERROR_TYPES.INVALID_DATE_RANGE,
        code: this.ERROR_CODES.INVALID_DATE_FORMAT,
        userMessage: 'Invalid date range format. Please use valid dates.',
        details: { 
          suggestion: 'Ensure dates are in YYYY-MM-DD format and start date is before end date.'
        }
      };
    }

    // No data found
    if (message.includes('no data') || message.includes('no changes') || message.includes('empty')) {
      return {
        type: this.ERROR_TYPES.NO_DATA_FOUND,
        code: this.ERROR_CODES.NO_CHANGES_FOUND,
        userMessage: 'No changes found for the selected date range.',
        details: { 
          suggestion: 'Try expanding the date range or check if there was development activity during this period.'
        }
      };
    }

    // Timeout errors
    if (message.includes('timeout') || message.includes('timed out')) {
      return {
        type: this.ERROR_TYPES.TIMEOUT,
        code: this.ERROR_CODES.TIMEOUT_ERROR,
        userMessage: 'The operation timed out. This usually happens with large date ranges.',
        details: { 
          suggestion: 'Try a smaller date range or retry the operation.'
        }
      };
    }

    // Network errors
    if (message.includes('network') || message.includes('connection') || message.includes('econnrefused')) {
      return {
        type: this.ERROR_TYPES.NETWORK_ERROR,
        code: this.ERROR_CODES.TIMEOUT_ERROR,
        userMessage: 'Network connection error. Please check your internet connection.',
        details: { 
          suggestion: 'Check your internet connection and try again.'
        }
      };
    }

    // Default to internal error
    return {
      type: this.ERROR_TYPES.INTERNAL_ERROR,
      code: this.ERROR_CODES.INTERNAL_FAILURE,
      userMessage: 'An unexpected error occurred while generating release notes.',
      details: { 
        suggestion: 'Please try again. If the problem persists, contact support.',
        originalError: error.message
      }
    };
  }

  /**
   * Handle data source failures with graceful degradation
   * @param {Array} sourceErrors - Array of source-specific errors
   * @param {Object} availableSources - Available data sources status
   * @returns {Object} Degradation strategy
   */
  static handleDataSourceFailures(sourceErrors, availableSources) {
    const failedSources = sourceErrors.map(err => err.details.source).filter(Boolean);
    const totalSources = Object.keys(availableSources).length;
    const workingSources = totalSources - failedSources.length;

    if (workingSources === 0) {
      return {
        canContinue: false,
        error: new ReleaseNotesError(
          'All data sources are currently unavailable. Cannot generate release notes.',
          this.ERROR_TYPES.ALL_SOURCES_FAILED,
          this.ERROR_CODES.ALL_SOURCES_FAILED,
          {
            failedSources,
            suggestion: 'Check your API keys and network connection, then try again.'
          }
        )
      };
    }

    return {
      canContinue: true,
      degradationInfo: {
        workingSources,
        totalSources,
        failedSources,
        message: `Release notes generated from ${workingSources} of ${totalSources} data sources. ${failedSources.join(', ')} unavailable.`,
        impact: workingSources === 1 ? 'high' : 'medium'
      }
    };
  }

  /**
   * Get user-friendly error information with recovery actions
   * @param {ReleaseNotesError} error - Release notes error object
   * @returns {Object} User-friendly error information
   */
  static getUserFriendlyError(error) {
    // Delegate LLM errors to LLMErrorHandler
    if (error.type === this.ERROR_TYPES.LLM_ERROR && error.details.originalError) {
      const llmError = LLMErrorHandler.getUserFriendlyError(error.details.originalError);
      return {
        ...llmError,
        title: 'AI Analysis Error',
        fallback: 'Continue with rule-based analysis only'
      };
    }

    const baseInfo = {
      title: this.getErrorTitle(error.type),
      message: error.message,
      type: error.type,
      recoverable: error.recoverable,
      timestamp: error.timestamp
    };

    // Add specific actions based on error type
    switch (error.type) {
      case this.ERROR_TYPES.DATA_SOURCE_UNAVAILABLE:
        return {
          ...baseInfo,
          actions: [
            { type: 'retry', label: 'Retry', delay: 5000 },
            { type: 'config', label: 'Check Configuration', field: `${error.details.source}Token` }
          ],
          fallback: 'Continue with available data sources',
          impact: 'medium'
        };

      case this.ERROR_TYPES.PARTIAL_DATA_FAILURE:
        return {
          ...baseInfo,
          actions: [
            { type: 'retry', label: 'Retry Failed Sources', delay: 3000 },
            { type: 'continue', label: 'Continue with Available Data' }
          ],
          fallback: 'Generate release notes with available data',
          impact: 'low'
        };

      case this.ERROR_TYPES.ALL_SOURCES_FAILED:
        return {
          ...baseInfo,
          actions: [
            { type: 'config', label: 'Check All Configurations' },
            { type: 'retry', label: 'Retry All Sources', delay: 10000 }
          ],
          fallback: null,
          impact: 'critical'
        };

      case this.ERROR_TYPES.INVALID_DATE_RANGE:
        return {
          ...baseInfo,
          actions: [
            { type: 'input', label: 'Fix Date Range', field: 'dateRange' }
          ],
          fallback: null,
          impact: 'low'
        };

      case this.ERROR_TYPES.NO_DATA_FOUND:
        return {
          ...baseInfo,
          actions: [
            { type: 'input', label: 'Expand Date Range', field: 'dateRange' },
            { type: 'retry', label: 'Try Again', delay: 0 }
          ],
          fallback: 'Generate empty release notes template',
          impact: 'medium'
        };

      case this.ERROR_TYPES.TIMEOUT:
        return {
          ...baseInfo,
          actions: [
            { type: 'input', label: 'Reduce Date Range', field: 'dateRange' },
            { type: 'retry', label: 'Retry', delay: 5000 }
          ],
          fallback: 'Try with rule-based analysis only',
          impact: 'medium'
        };

      default:
        return {
          ...baseInfo,
          actions: [
            { type: 'retry', label: 'Try Again', delay: 5000 }
          ],
          fallback: 'Contact support if problem persists',
          impact: 'high'
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
      [this.ERROR_TYPES.DATA_SOURCE_UNAVAILABLE]: 'Data Source Unavailable',
      [this.ERROR_TYPES.PARTIAL_DATA_FAILURE]: 'Partial Data Failure',
      [this.ERROR_TYPES.ALL_SOURCES_FAILED]: 'All Data Sources Failed',
      [this.ERROR_TYPES.INVALID_DATE_RANGE]: 'Invalid Date Range',
      [this.ERROR_TYPES.MISSING_CONFIGURATION]: 'Configuration Error',
      [this.ERROR_TYPES.NO_DATA_FOUND]: 'No Data Found',
      [this.ERROR_TYPES.ANALYSIS_FAILED]: 'Analysis Failed',
      [this.ERROR_TYPES.LLM_ERROR]: 'AI Analysis Error',
      [this.ERROR_TYPES.TIMEOUT]: 'Operation Timeout',
      [this.ERROR_TYPES.NETWORK_ERROR]: 'Network Error',
      [this.ERROR_TYPES.INTERNAL_ERROR]: 'Internal Error'
    };
    
    return titles[errorType] || 'Error';
  }

  /**
   * Get retry strategy for error
   * @param {ReleaseNotesError} error - Release notes error object
   * @returns {Object|null} Retry strategy or null if no retry
   */
  static getRetryStrategy(error) {
    if (!error.recoverable) {
      return null;
    }

    switch (error.type) {
      case this.ERROR_TYPES.DATA_SOURCE_UNAVAILABLE:
        return {
          maxAttempts: 2,
          delay: 5000,
          backoff: 'fixed',
          retryCondition: 'source_specific'
        };

      case this.ERROR_TYPES.PARTIAL_DATA_FAILURE:
        return {
          maxAttempts: 1,
          delay: 3000,
          backoff: 'fixed',
          retryCondition: 'failed_sources_only'
        };

      case this.ERROR_TYPES.TIMEOUT:
      case this.ERROR_TYPES.NETWORK_ERROR:
        return {
          maxAttempts: 3,
          delay: 2000,
          backoff: 'exponential',
          retryCondition: 'full_retry'
        };

      case this.ERROR_TYPES.LLM_ERROR:
        // Delegate to LLM error handler
        if (error.details.originalError) {
          return LLMErrorHandler.getRetryStrategy(error.details.originalError);
        }
        return null;

      default:
        return {
          maxAttempts: 1,
          delay: 5000,
          backoff: 'fixed',
          retryCondition: 'full_retry'
        };
    }
  }

  /**
   * Check if operation should continue with degraded functionality
   * @param {ReleaseNotesError} error - Release notes error object
   * @returns {boolean} Whether to continue with degradation
   */
  static shouldContinueWithDegradation(error) {
    const degradableTypes = [
      this.ERROR_TYPES.DATA_SOURCE_UNAVAILABLE,
      this.ERROR_TYPES.PARTIAL_DATA_FAILURE,
      this.ERROR_TYPES.LLM_ERROR
    ];
    
    return degradableTypes.includes(error.type);
  }

  /**
   * Generate fallback release notes when primary generation fails
   * @param {Object} partialData - Any successfully collected data
   * @param {Object} dateRange - Date range for release notes
   * @param {Array} errors - Array of errors encountered
   * @returns {Object} Fallback release notes document
   */
  static generateFallbackReleaseNotes(partialData, dateRange, errors) {
    const failedSources = errors
      .filter(err => err.type === this.ERROR_TYPES.DATA_SOURCE_UNAVAILABLE)
      .map(err => err.details.source);

    return {
      title: `Release Notes - ${dateRange.start} to ${dateRange.end}`,
      dateRange,
      entries: {
        newFeatures: [],
        improvements: [],
        fixes: []
      },
      metadata: {
        generationMethod: 'fallback',
        errors: errors.map(err => ({
          type: err.type,
          message: err.message,
          source: err.details.source
        })),
        failedSources,
        availableData: Object.keys(partialData).filter(key => partialData[key]),
        warning: 'This is a fallback release notes document generated due to data source failures.'
      }
    };
  }
}