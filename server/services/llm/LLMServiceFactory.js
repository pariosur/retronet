import { BaseLLMProvider } from "./BaseLLMProvider.js";

/**
 * LLM Service Factory
 * Manages different LLM provider implementations and handles provider selection
 */
export class LLMServiceFactory {
  static providers = new Map();
  static defaultConfig = {
    timeout: 30000,
    maxTokens: 4000,
    temperature: 0.7,
    retryAttempts: 3,
    retryDelay: 1000,
  };

  /**
   * Registers a provider class with the factory
   * @param {string} name - Provider name (e.g., 'openai', 'anthropic', 'local')
   * @param {class} ProviderClass - Provider class that extends BaseLLMProvider
   */
  static registerProvider(name, ProviderClass) {
    if (!name || typeof name !== "string") {
      throw new Error("Provider name must be a non-empty string");
    }

    if (
      !ProviderClass ||
      !(ProviderClass.prototype instanceof BaseLLMProvider)
    ) {
      throw new Error("Provider class must extend BaseLLMProvider");
    }

    this.providers.set(name.toLowerCase(), ProviderClass);
  }

  /**
   * Creates an LLM provider instance based on configuration
   * @param {Object} config - Provider configuration
   * @param {string} config.provider - Provider name
   * @param {string} config.apiKey - API key (if required)
   * @param {string} config.model - Model name
   * @param {number} config.timeout - Request timeout in milliseconds
   * @param {number} config.maxTokens - Maximum tokens for requests
   * @param {number} config.temperature - Model temperature
   * @param {Object} performanceMonitor - Optional performance monitor instance
   * @returns {BaseLLMProvider} Provider instance
   */
  static createProvider(config, performanceMonitor = null) {
    const validatedConfig = this.validateConfig(config);
    const mergedConfig = { ...this.defaultConfig, ...validatedConfig };

    const ProviderClass = this.providers.get(
      mergedConfig.provider.toLowerCase()
    );

    if (!ProviderClass) {
      throw new Error(
        `Unknown provider: ${
          mergedConfig.provider
        }. Available providers: ${Array.from(this.providers.keys()).join(", ")}`
      );
    }

    return new ProviderClass(mergedConfig, performanceMonitor);
  }

  /**
   * Validates provider configuration
   * @param {Object} config - Configuration to validate
   * @returns {Object} Validated configuration
   * @throws {Error} If configuration is invalid
   */
  static validateConfig(config) {
    if (!config || typeof config !== "object") {
      throw new Error("LLM configuration must be an object");
    }

    if (!config.provider || typeof config.provider !== "string") {
      throw new Error("Provider name is required and must be a string");
    }

    const provider = config.provider.toLowerCase();

    // Validate provider exists
    if (!this.providers.has(provider)) {
      throw new Error(
        `Unknown provider: ${provider}. Available providers: ${Array.from(
          this.providers.keys()
        ).join(", ")}`
      );
    }

    // Validate API key for external providers
    if (
      provider !== "local" &&
      (!config.apiKey || typeof config.apiKey !== "string")
    ) {
      throw new Error(`API key is required for ${provider} provider`);
    }

    // Validate numeric fields
    if (
      config.timeout !== undefined &&
      (typeof config.timeout !== "number" || config.timeout <= 0)
    ) {
      throw new Error("Timeout must be a positive number");
    }

    if (
      config.maxTokens !== undefined &&
      (typeof config.maxTokens !== "number" || config.maxTokens <= 0)
    ) {
      throw new Error("Max tokens must be a positive number");
    }

    if (
      config.temperature !== undefined &&
      (typeof config.temperature !== "number" ||
        config.temperature < 0 ||
        config.temperature > 2)
    ) {
      throw new Error("Temperature must be a number between 0 and 2");
    }

    const validatedConfig = {
      provider: provider,
      apiKey: config.apiKey,
      model: config.model || this._getDefaultModel(provider),
      enabled: config.enabled !== false, // Default to true
      privacyMode: config.privacyMode || false,
    };

    // Only include optional numeric fields if they were provided
    if (config.timeout !== undefined) validatedConfig.timeout = config.timeout;
    if (config.maxTokens !== undefined)
      validatedConfig.maxTokens = config.maxTokens;
    if (config.temperature !== undefined)
      validatedConfig.temperature = config.temperature;
    if (config.retryAttempts !== undefined)
      validatedConfig.retryAttempts = config.retryAttempts;
    if (config.retryDelay !== undefined)
      validatedConfig.retryDelay = config.retryDelay;

    return validatedConfig;
  }

  /**
   * Gets default model for a provider
   * @private
   */
  static _getDefaultModel(provider) {
    const defaultModels = {
      openai: "gpt-4o",
      anthropic: "claude-3-sonnet-20240229",
      local: "llama2",
    };

    return defaultModels[provider] || "default";
  }

  /**
   * Gets list of available providers
   * @returns {string[]} Array of provider names
   */
  static getAvailableProviders() {
    return Array.from(this.providers.keys());
  }

  /**
   * Checks if a provider is registered
   * @param {string} providerName - Name of the provider to check
   * @returns {boolean} True if provider is registered
   */
  static hasProvider(providerName) {
    return this.providers.has(providerName.toLowerCase());
  }

  /**
   * Creates configuration from environment variables
   * @param {Object} env - Environment variables object
   * @returns {Object|null} Configuration object or null if not configured
   */
  static createConfigFromEnv(env) {
    const provider = env.LLM_PROVIDER;

    if (!provider) {
      return null; // LLM not configured
    }

    const config = {
      provider: provider.toLowerCase(),
      enabled: env.LLM_ENABLED !== "false",
      privacyMode: env.LLM_PRIVACY_MODE === "true",
    };

    // Set API key based on provider
    switch (config.provider) {
      case "openai":
        config.apiKey = env.OPENAI_API_KEY;
        config.model = env.OPENAI_MODEL || "gpt-4o";
        break;
      case "anthropic":
        config.apiKey = env.ANTHROPIC_API_KEY;
        config.model = env.ANTHROPIC_MODEL || "claude-3-sonnet-20240229";
        break;
      case "local":
        config.model = env.LOCAL_MODEL || "llama2";
        config.endpoint = env.LOCAL_LLM_ENDPOINT || "http://localhost:11434";
        break;
    }

    // Optional numeric configurations
    if (env.LLM_TIMEOUT) {
      config.timeout = parseInt(env.LLM_TIMEOUT, 10);
    }

    if (env.LLM_MAX_TOKENS) {
      config.maxTokens = parseInt(env.LLM_MAX_TOKENS, 10);
    }

    if (env.LLM_TEMPERATURE) {
      config.temperature = parseFloat(env.LLM_TEMPERATURE);
    }

    // GPT-5 specific configurations
    if (env.LLM_REASONING_EFFORT) {
      config.reasoningEffort = env.LLM_REASONING_EFFORT;
    }

    if (env.LLM_VERBOSITY) {
      config.verbosity = env.LLM_VERBOSITY;
    }

    return config;
  }

  /**
   * Tests a provider configuration
   * @param {Object} config - Configuration to test
   * @param {Object} performanceMonitor - Optional performance monitor instance
   * @returns {Promise<Object>} Test result with success status and details
   */
  static async testProvider(config, performanceMonitor = null) {
    try {
      const provider = this.createProvider(config, performanceMonitor);

      try {
        const isConnected = await provider.validateConnection();
        return {
          success: isConnected,
          provider: config.provider,
          model: provider.getModel(),
          message: isConnected ? "Connection successful" : "Connection failed",
        };
      } catch (connectionError) {
        return {
          success: false,
          provider: config.provider,
          model: provider.getModel(),
          error: connectionError.message,
          message: connectionError.message,
        };
      }
    } catch (configError) {
      return {
        success: false,
        provider: config.provider,
        error: configError.message,
        message: `Configuration error: ${configError.message}`,
      };
    }
  }
}
