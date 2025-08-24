import { LLMServiceFactory } from './LLMServiceFactory.js';

/**
 * LLM Configuration Helper
 * Provides utilities for managing LLM configuration
 */
export class LLMConfig {
  /**
   * Creates LLM configuration from environment variables
   * @param {Object} env - Environment variables (defaults to process.env)
   * @returns {Object|null} Configuration object or null if not configured
   */
  static fromEnvironment(env = process.env) {
    return LLMServiceFactory.createConfigFromEnv(env);
  }

  /**
   * Checks if LLM is configured and enabled
   * @param {Object} env - Environment variables (defaults to process.env)
   * @returns {boolean} True if LLM is configured and enabled
   */
  static isEnabled(env = process.env) {
    const config = this.fromEnvironment(env);
    return config ? config.enabled !== false : false;
  }

  /**
   * Gets the configured LLM provider name
   * @param {Object} env - Environment variables (defaults to process.env)
   * @returns {string|null} Provider name or null if not configured
   */
  static getProvider(env = process.env) {
    const config = this.fromEnvironment(env);
    return config ? config.provider : null;
  }

  /**
   * Validates the current LLM configuration
   * @param {Object} env - Environment variables (defaults to process.env)
   * @returns {Object} Validation result with success status and details
   */
  static validate(env = process.env) {
    const config = this.fromEnvironment(env);
    
    if (!config) {
      return {
        success: false,
        message: 'LLM not configured. Set LLM_PROVIDER environment variable.',
        configured: false
      };
    }

    try {
      LLMServiceFactory.validateConfig(config);
      return {
        success: true,
        message: 'LLM configuration is valid',
        configured: true,
        provider: config.provider,
        model: config.model,
        enabled: config.enabled
      };
    } catch (error) {
      return {
        success: false,
        message: `LLM configuration error: ${error.message}`,
        configured: true,
        error: error.message
      };
    }
  }
}