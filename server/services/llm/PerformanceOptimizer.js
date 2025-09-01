/**
 * Performance optimizer for LLM operations
 * Makes intelligent decisions about model selection, prompt optimization, and resource usage
 */
class PerformanceOptimizer {
  constructor(performanceMonitor) {
    this.monitor = performanceMonitor;
    
    // Optimization thresholds
    this.thresholds = {
      maxResponseTime: 30000, // 30 seconds
      maxCostPerRequest: 0.20, // $0.20
      maxTokensPerRequest: 10000,
      minSuccessRate: 0.95 // 95%
    };
    
    // Model performance characteristics (based on general benchmarks)
    this.modelCharacteristics = {
      'openai': {
        'gpt-4': { speed: 3, cost: 5, quality: 5, maxTokens: 8192 },
        'gpt-4-turbo': { speed: 4, cost: 3, quality: 5, maxTokens: 128000 },
        'gpt-3.5-turbo': { speed: 5, cost: 1, quality: 3, maxTokens: 16385 }
      },
      'anthropic': {
        'claude-3-opus': { speed: 3, cost: 4, quality: 5, maxTokens: 200000 },
        'claude-3-sonnet': { speed: 4, cost: 2, quality: 4, maxTokens: 200000 },
        'claude-3-haiku': { speed: 5, cost: 1, quality: 3, maxTokens: 200000 }
      },
      'local': {
        'default': { speed: 2, cost: 0, quality: 2, maxTokens: 4096 }
      }
    };
  }

  /**
   * Optimize prompt size based on data volume and model limits
   * @param {string} prompt - Original prompt
   * @param {string} provider - LLM provider
   * @param {string} model - Model name
   * @param {number} estimatedTokens - Estimated token count
   * @returns {object} Optimization result
   */
  optimizePromptSize(prompt, provider, model, estimatedTokens) {
    const modelInfo = this.modelCharacteristics[provider]?.[model];
    if (!modelInfo) {
      return { optimized: false, prompt, reason: 'Unknown model characteristics' };
    }
    
    const maxTokens = modelInfo.maxTokens;
    const safeLimit = Math.floor(maxTokens * 0.8); // Leave 20% buffer for response
    
    if (estimatedTokens <= safeLimit) {
      return { optimized: false, prompt, reason: 'Prompt size within limits' };
    }
    
    // Calculate reduction needed
    const reductionRatio = safeLimit / estimatedTokens;
    
    // Simple optimization strategies
    let optimizedPrompt = prompt;
    
    // Strategy 1: Remove redundant whitespace and formatting
    optimizedPrompt = optimizedPrompt.replace(/\s+/g, ' ').trim();
    
    // Strategy 2: Truncate examples if present
    if (reductionRatio < 0.9) {
      optimizedPrompt = this.truncateExamples(optimizedPrompt, reductionRatio);
    }
    
    // Strategy 3: Summarize data sections if still too long
    if (reductionRatio < 0.7) {
      optimizedPrompt = this.summarizeDataSections(optimizedPrompt, reductionRatio);
    }
    
    return {
      optimized: true,
      prompt: optimizedPrompt,
      originalTokens: estimatedTokens,
      optimizedTokens: Math.floor(estimatedTokens * reductionRatio),
      reductionRatio,
      reason: `Reduced prompt size by ${Math.round((1 - reductionRatio) * 100)}% to fit model limits`
    };
  }

  /**
   * Select optimal model based on current performance data and requirements
   * @param {object} requirements - Analysis requirements
   * @returns {object} Model recommendation
   */
  selectOptimalModel(requirements) {
    const {
      dataVolume = 0,
      prioritizeCost = false,
      prioritizeSpeed = false,
      prioritizeQuality = false,
      maxResponseTime = this.thresholds.maxResponseTime,
      maxCost = this.thresholds.maxCostPerRequest
    } = requirements;
    
    const metrics = this.monitor.getMetrics();
    const candidates = [];
    
    // Evaluate all available models
    for (const [provider, models] of Object.entries(this.modelCharacteristics)) {
      for (const [model, characteristics] of Object.entries(models)) {
        const providerStats = metrics.providerStats[provider] || {};
        const avgResponseTime = providerStats.averageResponseTime || 0;
        const avgCost = providerStats.totalCost / Math.max(providerStats.requests, 1) || 0;
        
        // Calculate suitability score
        let score = 0;
        
        // Speed scoring
        if (prioritizeSpeed) {
          score += characteristics.speed * 2;
          if (avgResponseTime > 0 && avgResponseTime < maxResponseTime) {
            score += 2;
          }
        } else {
          score += characteristics.speed;
        }
        
        // Cost scoring
        if (prioritizeCost) {
          score += (6 - characteristics.cost) * 2; // Invert cost (lower is better)
          if (avgCost > 0 && avgCost < maxCost) {
            score += 2;
          }
        } else {
          score += (6 - characteristics.cost);
        }
        
        // Quality scoring
        if (prioritizeQuality) {
          score += characteristics.quality * 2;
        } else {
          score += characteristics.quality;
        }
        
        // Data volume considerations
        if (dataVolume > characteristics.maxTokens * 0.8) {
          score -= 5; // Penalize models that can't handle the data volume
        }
        
        // Historical performance bonus
        if (providerStats.requests > 5) {
          const successRate = (providerStats.requests - (metrics.requestHistory.filter(
            r => r.provider === provider && r.status === 'error'
          ).length)) / providerStats.requests;
          
          if (successRate >= this.thresholds.minSuccessRate) {
            score += 2;
          }
        }
        
        candidates.push({
          provider,
          model,
          score,
          characteristics,
          avgResponseTime,
          avgCost,
          estimatedCost: this.monitor.calculateCost(provider, model, dataVolume * 0.1, dataVolume * 0.05)
        });
      }
    }
    
    // Sort by score and return best candidate
    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];
    
    if (!best) {
      return {
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        reason: 'Default fallback - no suitable models found'
      };
    }
    
    return {
      provider: best.provider,
      model: best.model,
      score: best.score,
      estimatedCost: best.estimatedCost,
      estimatedResponseTime: best.avgResponseTime || this.estimateResponseTime(best.characteristics),
      reason: this.generateSelectionReason(best, requirements),
      alternatives: candidates.slice(1, 3) // Include top 2 alternatives
    };
  }

  /**
   * Estimate response time based on model characteristics
   * @param {object} characteristics - Model characteristics
   * @returns {number} Estimated response time in milliseconds
   */
  estimateResponseTime(characteristics) {
    // Simple heuristic: faster models (higher speed score) have lower response times
    const baseTime = 5000; // 5 seconds base
    const speedMultiplier = (6 - characteristics.speed) / 5; // Normalize to 0.2-1.0
    return baseTime * speedMultiplier;
  }

  /**
   * Generate human-readable reason for model selection
   * @param {object} selection - Selected model info
   * @param {object} requirements - Original requirements
   * @returns {string} Selection reason
   */
  generateSelectionReason(selection, requirements) {
    const reasons = [];
    
    if (requirements.prioritizeCost) {
      reasons.push(`cost-effective (estimated $${selection.estimatedCost.toFixed(4)} per request)`);
    }
    
    if (requirements.prioritizeSpeed) {
      reasons.push(`fast processing (${selection.characteristics.speed}/5 speed rating)`);
    }
    
    if (requirements.prioritizeQuality) {
      reasons.push(`high quality analysis (${selection.characteristics.quality}/5 quality rating)`);
    }
    
    if (selection.avgResponseTime > 0) {
      reasons.push(`proven performance (${(selection.avgResponseTime / 1000).toFixed(1)}s avg response time)`);
    }
    
    return reasons.length > 0 
        ? `Selected for ${reasons.join(', ')}`
        : 'Best overall performance';
  }

  /**
   * Truncate examples in prompt to reduce size
   * @param {string} prompt - Original prompt
   * @param {number} targetRatio - Target reduction ratio
   * @returns {string} Optimized prompt
   */
  truncateExamples(prompt, targetRatio) {
    // Look for example sections and truncate them
    const examplePattern = /(Example[s]?:|For example:|e\.g\.|Examples include:)(.*?)(?=\n\n|\n[A-Z]|$)/gis;
    
    return prompt.replace(examplePattern, (match, prefix, content) => {
      const truncatedLength = Math.floor(content.length * targetRatio);
      const truncated = content.substring(0, truncatedLength);
      return `${prefix}${truncated}... [truncated for optimization]`;
    });
  }

  /**
   * Summarize data sections in prompt
   * @param {string} prompt - Original prompt
   * @param {number} targetRatio - Target reduction ratio
   * @returns {string} Optimized prompt
   */
  summarizeDataSections(prompt, targetRatio) {
    // Look for data sections (JSON, lists, etc.) and summarize them
    const dataPattern = /(\{[\s\S]*?\}|\[[\s\S]*?\])/g;
    
    return prompt.replace(dataPattern, (match) => {
      if (match.length < 200) return match; // Don't optimize small data sections
      
      const targetLength = Math.floor(match.length * targetRatio);
      const truncated = match.substring(0, targetLength);
      
      // Try to end at a reasonable point (comma, bracket, etc.)
      const lastGoodChar = Math.max(
        truncated.lastIndexOf(','),
        truncated.lastIndexOf('}'),
        truncated.lastIndexOf(']'),
        truncated.lastIndexOf('\n')
      );
      
      const finalTruncated = lastGoodChar > targetLength * 0.8 
        ? truncated.substring(0, lastGoodChar)
        : truncated;
      
      return `${finalTruncated}... [data truncated for optimization]`;
    });
  }

  /**
   * Get performance optimization recommendations
   * @returns {object} Optimization recommendations
   */
  getOptimizationRecommendations() {
    const metrics = this.monitor.getMetrics();
    const recommendations = this.monitor.getOptimizationRecommendations();
    
    // Add optimizer-specific recommendations
    const recentRequests = metrics.recentRequests || [];
    const failedRequests = recentRequests.filter(r => r.status === 'error');
    
    if (failedRequests.length > recentRequests.length * 0.1) {
      recommendations.reliabilityOptimization = {
        suggestion: 'Consider implementing request retry logic or switching to more reliable models',
        reason: `${failedRequests.length} of ${recentRequests.length} recent requests failed`
      };
    }
    
    // Token usage optimization
    const highTokenRequests = recentRequests.filter(r => r.totalTokens > 8000);
    if (highTokenRequests.length > 0) {
      recommendations.tokenOptimization = {
        suggestion: 'Implement prompt compression or data summarization for large requests',
        reason: `${highTokenRequests.length} recent requests used >8K tokens`
      };
    }
    
    return recommendations;
  }

  /**
   * Update optimization thresholds based on performance data
   * @param {object} newThresholds - New threshold values
   */
  updateThresholds(newThresholds) {
    this.thresholds = { ...this.thresholds, ...newThresholds };
  }
}

export default PerformanceOptimizer;