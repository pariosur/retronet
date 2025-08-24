/**
 * Performance monitoring service for LLM operations
 * Tracks token usage, costs, response times, and provides optimization recommendations
 */
class PerformanceMonitor {
  constructor() {
    this.metrics = {
      totalRequests: 0,
      totalTokensUsed: 0,
      totalCost: 0,
      averageResponseTime: 0,
      requestHistory: [],
      providerStats: {}
    };
    
    // Token pricing per 1K tokens (approximate rates as of 2024)
    this.tokenPricing = {
      'openai': {
        'gpt-4': { input: 0.03, output: 0.06 },
        'gpt-4-turbo': { input: 0.01, output: 0.03 },
        'gpt-3.5-turbo': { input: 0.0015, output: 0.002 }
      },
      'anthropic': {
        'claude-3-opus': { input: 0.015, output: 0.075 },
        'claude-3-sonnet': { input: 0.003, output: 0.015 },
        'claude-3-haiku': { input: 0.00025, output: 0.00125 }
      },
      'local': {
        'default': { input: 0, output: 0 } // Local models are free
      }
    };
  }

  /**
   * Start tracking a new LLM request
   * @param {string} provider - LLM provider name
   * @param {string} model - Model name
   * @param {number} inputTokens - Number of input tokens
   * @returns {string} requestId for tracking
   */
  startRequest(provider, model, inputTokens) {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    
    const request = {
      id: requestId,
      provider,
      model,
      inputTokens,
      outputTokens: 0,
      startTime,
      endTime: null,
      responseTime: null,
      cost: 0,
      status: 'pending'
    };
    
    this.metrics.requestHistory.push(request);
    this.metrics.totalRequests++;
    
    // Initialize provider stats if not exists
    if (!this.metrics.providerStats[provider]) {
      this.metrics.providerStats[provider] = {
        requests: 0,
        totalTokens: 0,
        totalCost: 0,
        averageResponseTime: 0
      };
    }
    
    return requestId;
  }

  /**
   * Complete tracking for a request
   * @param {string} requestId - Request ID from startRequest
   * @param {number} outputTokens - Number of output tokens
   * @param {string} status - Request status ('success' or 'error')
   */
  completeRequest(requestId, outputTokens = 0, status = 'success') {
    const request = this.metrics.requestHistory.find(r => r.id === requestId);
    if (!request) {
      console.warn(`Request ${requestId} not found in performance metrics`);
      return;
    }
    
    const endTime = Date.now();
    const responseTime = endTime - request.startTime;
    
    request.endTime = endTime;
    request.responseTime = responseTime;
    request.outputTokens = outputTokens;
    request.status = status;
    request.cost = this.calculateCost(request.provider, request.model, request.inputTokens, outputTokens);
    
    // Update aggregate metrics
    this.metrics.totalTokensUsed += request.inputTokens + outputTokens;
    this.metrics.totalCost += request.cost;
    this.updateAverageResponseTime();
    
    // Update provider stats
    const providerStats = this.metrics.providerStats[request.provider];
    providerStats.requests++;
    providerStats.totalTokens += request.inputTokens + outputTokens;
    providerStats.totalCost += request.cost;
    providerStats.averageResponseTime = this.calculateProviderAverageResponseTime(request.provider);
  }

  /**
   * Calculate cost for a request
   * @param {string} provider - Provider name
   * @param {string} model - Model name
   * @param {number} inputTokens - Input tokens
   * @param {number} outputTokens - Output tokens
   * @returns {number} Cost in USD
   */
  calculateCost(provider, model, inputTokens, outputTokens) {
    const pricing = this.tokenPricing[provider]?.[model] || this.tokenPricing[provider]?.['default'];
    if (!pricing) {
      return 0;
    }
    
    const inputCost = (inputTokens / 1000) * pricing.input;
    const outputCost = (outputTokens / 1000) * pricing.output;
    
    return inputCost + outputCost;
  }

  /**
   * Update average response time across all requests
   */
  updateAverageResponseTime() {
    const completedRequests = this.metrics.requestHistory.filter(r => r.responseTime !== null);
    if (completedRequests.length === 0) {
      this.metrics.averageResponseTime = 0;
      return;
    }
    
    const totalTime = completedRequests.reduce((sum, req) => sum + req.responseTime, 0);
    this.metrics.averageResponseTime = totalTime / completedRequests.length;
  }

  /**
   * Calculate average response time for a specific provider
   * @param {string} provider - Provider name
   * @returns {number} Average response time in milliseconds
   */
  calculateProviderAverageResponseTime(provider) {
    const providerRequests = this.metrics.requestHistory.filter(
      r => r.provider === provider && r.responseTime !== null
    );
    
    if (providerRequests.length === 0) return 0;
    
    const totalTime = providerRequests.reduce((sum, req) => sum + req.responseTime, 0);
    return totalTime / providerRequests.length;
  }

  /**
   * Get current performance metrics
   * @returns {object} Current metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      recentRequests: this.getRecentRequests(10)
    };
  }

  /**
   * Get recent requests for analysis
   * @param {number} limit - Number of recent requests to return
   * @returns {Array} Recent requests
   */
  getRecentRequests(limit = 10) {
    return this.metrics.requestHistory
      .slice(-limit)
      .map(req => ({
        id: req.id,
        provider: req.provider,
        model: req.model,
        totalTokens: req.inputTokens + req.outputTokens,
        responseTime: req.responseTime,
        cost: req.cost,
        status: req.status,
        timestamp: req.startTime
      }));
  }

  /**
   * Get optimization recommendations based on current metrics
   * @param {number} dataVolume - Size of data being processed
   * @returns {object} Optimization recommendations
   */
  getOptimizationRecommendations(dataVolume = 0) {
    const recommendations = {
      modelSelection: null,
      promptOptimization: null,
      costOptimization: null,
      performanceOptimization: null
    };
    
    // Model selection based on data volume and performance
    if (dataVolume > 50000) { // Large data volume
      recommendations.modelSelection = {
        suggestion: 'Consider using a more efficient model like GPT-3.5-turbo or Claude Haiku for large datasets',
        reason: 'Large data volume detected - faster, cheaper models may be more appropriate'
      };
    }
    
    // Cost optimization
    const avgCostPerRequest = this.metrics.totalCost / Math.max(this.metrics.totalRequests, 1);
    if (avgCostPerRequest > 0.10) {
      recommendations.costOptimization = {
        suggestion: 'Consider using local models or cheaper alternatives for routine analysis',
        reason: `Average cost per request is $${avgCostPerRequest.toFixed(4)}, which is relatively high`
      };
    }
    
    // Performance optimization
    if (this.metrics.averageResponseTime > 15000) { // 15 seconds
      recommendations.performanceOptimization = {
        suggestion: 'Consider implementing request batching or using faster models',
        reason: `Average response time is ${(this.metrics.averageResponseTime / 1000).toFixed(1)}s, which may impact user experience`
      };
    }
    
    // Prompt optimization
    const avgTokensPerRequest = this.metrics.totalTokensUsed / Math.max(this.metrics.totalRequests, 1);
    if (avgTokensPerRequest > 8000) {
      recommendations.promptOptimization = {
        suggestion: 'Consider reducing prompt size or implementing data summarization',
        reason: `Average tokens per request is ${Math.round(avgTokensPerRequest)}, which is quite high`
      };
    }
    
    return recommendations;
  }

  /**
   * Suggest optimal model based on data characteristics
   * @param {object} dataCharacteristics - Data size, complexity, etc.
   * @returns {object} Model recommendation
   */
  suggestOptimalModel(dataCharacteristics) {
    const { dataSize, complexity, prioritizeCost, prioritizeSpeed } = dataCharacteristics;
    
    // Simple heuristic for model selection
    if (prioritizeCost && dataSize < 10000) {
      return {
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        reason: 'Cost-effective for small to medium datasets'
      };
    }
    
    if (prioritizeSpeed && dataSize < 20000) {
      return {
        provider: 'anthropic',
        model: 'claude-3-haiku',
        reason: 'Fast processing for medium datasets'
      };
    }
    
    if (complexity === 'high' || dataSize > 30000) {
      return {
        provider: 'openai',
        model: 'gpt-4o',
        reason: 'Best available performance for complex analysis and large datasets'
      };
    }
    
    // Default recommendation
    return {
      provider: 'openai',
      model: 'gpt-3.5-turbo',
      reason: 'Balanced performance and cost for general use'
    };
  }

  /**
   * Reset metrics (useful for testing or periodic cleanup)
   */
  reset() {
    this.metrics = {
      totalRequests: 0,
      totalTokensUsed: 0,
      totalCost: 0,
      averageResponseTime: 0,
      requestHistory: [],
      providerStats: {}
    };
  }

  /**
   * Clean up old request history to prevent memory issues
   * @param {number} maxAge - Maximum age in milliseconds (default: 24 hours)
   */
  cleanupOldRequests(maxAge = 24 * 60 * 60 * 1000) {
    const cutoffTime = Date.now() - maxAge;
    const initialCount = this.metrics.requestHistory.length;
    
    this.metrics.requestHistory = this.metrics.requestHistory.filter(
      req => req.startTime > cutoffTime
    );
    
    const removedCount = initialCount - this.metrics.requestHistory.length;
    if (removedCount > 0) {
      console.log(`Cleaned up ${removedCount} old performance metrics records`);
    }
  }
}

export default PerformanceMonitor;