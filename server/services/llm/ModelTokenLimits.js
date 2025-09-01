/**
 * ModelTokenLimits - Dynamic token configuration for different LLM models
 * 
 * Replaces hardcoded 4K token limits with model-specific configurations
 * that utilize the full capacity of modern models for better analysis.
 */
export class ModelTokenLimits {
  constructor() {
    // Model-specific token limits with realistic values for rapid testing
    this.limits = {
      'openai': {
        'gpt-3.5-turbo': { 
          total: 16385, 
          input: 14000, 
          output: 2385,
          tokenizer: 'cl100k_base',
          bufferPercentage: 15
        },
        'gpt-4': { 
          total: 8192, 
          input: 6500, 
          output: 1692,
          tokenizer: 'cl100k_base',
          bufferPercentage: 15
        },
        'gpt-4-turbo': { 
          total: 128000, 
          input: 120000, 
          output: 8000,
          tokenizer: 'cl100k_base',
          bufferPercentage: 10
        },
        'gpt-4o': { 
          total: 128000, 
          input: 120000, 
          output: 8000,
          tokenizer: 'o200k_base',
          bufferPercentage: 10
        },
        'gpt-5': { 
          total: 400000, // GPT-5 context window
          input: 272000, // enforce input cap aligned with provider limits
          // We rarely need massive outputs; reserve a small, sane cap
          output: 4000,
          tokenizer: 'o200k_base',
          // Keep buffer small so most capacity goes to input
          bufferPercentage: 1
        }
      },
      'anthropic': {
        'claude-3-opus': { 
          total: 200000, 
          input: 180000, 
          output: 20000,
          tokenizer: 'claude',
          bufferPercentage: 10
        },
        'claude-3-sonnet': { 
          total: 200000, 
          input: 180000, 
          output: 20000,
          tokenizer: 'claude',
          bufferPercentage: 10
        },
        'claude-3-haiku': { 
          total: 200000, 
          input: 180000, 
          output: 20000,
          tokenizer: 'claude',
          bufferPercentage: 10
        }
      },
      'local': {
        'llama': {
          total: 32768,
          input: 28000,
          output: 4768,
          tokenizer: 'llama',
          bufferPercentage: 15
        },
        'mistral': {
          total: 32768,
          input: 28000,
          output: 4768,
          tokenizer: 'mistral',
          bufferPercentage: 15
        }
      },
      'gemini': {
        'gemini-2.5-pro': {
          total: 1000000,
          input: 900000,
          output: 100000,
          tokenizer: 'gemini',
          bufferPercentage: 2
        },
        'gemini-2.5-flash': {
          total: 1000000,
          input: 900000,
          output: 100000,
          tokenizer: 'gemini',
          bufferPercentage: 2
        }
      }
    };

    // Default conservative limits for unknown models
    this.defaultLimits = {
      total: 8000,
      input: 6000,
      output: 2000,
      tokenizer: 'cl100k_base',
      bufferPercentage: 20
    };
  }

  /**
   * Get token limits for a specific model
   * @param {string} provider - The LLM provider (openai, anthropic, local)
   * @param {string} model - The specific model name
   * @returns {Object} Token limits configuration
   */
  getModelLimits(provider, model) {
    const providerLimits = this.limits[provider?.toLowerCase()];
    if (!providerLimits) {
      console.warn(`Unknown provider: ${provider}, using default limits`);
      return this.getDefaultLimits();
    }
    
    const modelLimits = providerLimits[model?.toLowerCase()];
    if (!modelLimits) {
      console.warn(`Unknown model: ${model} for provider: ${provider}, using default limits`);
      return this.getDefaultLimits();
    }
    
    return {
      ...modelLimits,
      provider,
      model
    };
  }

  /**
   * Get default conservative limits for unknown models
   * @returns {Object} Default token limits
   */
  getDefaultLimits() {
    return {
      ...this.defaultLimits,
      provider: 'unknown',
      model: 'unknown'
    };
  }

  /**
   * Calculate optimal token distribution for a given model
   * @param {string} provider - The LLM provider
   * @param {string} model - The specific model name
   * @param {number} systemPromptTokens - Estimated tokens for system prompt
   * @returns {Object} Optimal token distribution
   */
  calculateOptimalSplit(provider, model, systemPromptTokens = 500) {
    const limits = this.getModelLimits(provider, model);
    
    // Calculate buffer based on model's buffer percentage (bounded by explicit output cap)
    const outputBuffer = Math.max(limits.output, Math.floor(limits.total * (limits.bufferPercentage / 100)));
    
    // Available tokens for user data. Respect explicit input capacity if provided.
    // Some providers (e.g., GPT-5) have a lower input window than total.
    const maxInputCapacity = Math.max(0, (limits.input || (limits.total - outputBuffer)));
    const availableForData = Math.max(0, Math.min(maxInputCapacity, limits.total - outputBuffer) - systemPromptTokens);
    
    return {
      total: limits.total,
      systemPrompt: systemPromptTokens,
      userData: Math.max(0, availableForData),
      outputBuffer: outputBuffer,
      efficiency: (availableForData / limits.total) * 100,
      tokenizer: limits.tokenizer
    };
  }

  /**
   * Check if data size requires optimization for a given model
   * @param {number} estimatedDataTokens - Estimated tokens for the data
   * @param {string} provider - The LLM provider
   * @param {string} model - The specific model name
   * @param {number} systemPromptTokens - Estimated tokens for system prompt
   * @returns {Object} Optimization recommendation
   */
  getOptimizationRecommendation(estimatedDataTokens, provider, model, systemPromptTokens = 500) {
    const split = this.calculateOptimalSplit(provider, model, systemPromptTokens);
    const utilizationRatio = estimatedDataTokens / split.userData;
    
    let strategy = 'direct';
    let confidence = 'high';
    let reason = 'Data fits comfortably within token limits';
    
    if (utilizationRatio > 1.0) {
      strategy = 'progressive';
      confidence = 'high';
      reason = 'Data exceeds token limits, progressive analysis recommended';
    } else if (utilizationRatio > 0.8) {
      strategy = 'smart-truncation';
      confidence = 'medium';
      reason = 'Data approaching token limits, smart truncation recommended';
    }
    
    return {
      strategy,
      confidence,
      reason,
      utilizationRatio: Math.round(utilizationRatio * 100) / 100,
      availableTokens: split.userData,
      estimatedTokens: estimatedDataTokens,
      tokenSavings: Math.max(0, estimatedDataTokens - split.userData),
      modelCapacity: split.total,
      efficiency: split.efficiency
    };
  }

  /**
   * Get all supported models and their capabilities
   * @returns {Object} All supported models organized by provider
   */
  getSupportedModels() {
    const models = {};
    
    Object.keys(this.limits).forEach(provider => {
      models[provider] = Object.keys(this.limits[provider]).map(model => ({
        name: model,
        ...this.limits[provider][model]
      }));
    });
    
    return models;
  }

  /**
   * Get the most capable model for a given data size
   * @param {number} estimatedDataTokens - Estimated tokens for the data
   * @param {string} preferredProvider - Preferred provider (optional)
   * @returns {Object} Recommended model configuration
   */
  getRecommendedModel(estimatedDataTokens, preferredProvider = null) {
    const allModels = [];
    
    Object.keys(this.limits).forEach(provider => {
      if (preferredProvider && provider !== preferredProvider) return;
      
      Object.keys(this.limits[provider]).forEach(model => {
        const limits = this.limits[provider][model];
        const split = this.calculateOptimalSplit(provider, model);
        
        if (split.userData >= estimatedDataTokens) {
          allModels.push({
            provider,
            model,
            ...limits,
            availableTokens: split.userData,
            efficiency: split.efficiency,
            overkill: (split.userData / estimatedDataTokens) - 1
          });
        }
      });
    });
    
    if (allModels.length === 0) {
      return {
        provider: null,
        model: null,
        recommendation: 'progressive',
        reason: 'Data too large for any single model, progressive analysis required'
      };
    }
    
    // Sort by efficiency (prefer models that aren't overkill but can handle the data)
    allModels.sort((a, b) => a.overkill - b.overkill);
    
    const recommended = allModels[0];
    return {
      provider: recommended.provider,
      model: recommended.model,
      recommendation: 'direct',
      reason: `${recommended.model} can handle ${estimatedDataTokens} tokens efficiently`,
      efficiency: recommended.efficiency,
      availableTokens: recommended.availableTokens
    };
  }
}

export default ModelTokenLimits;