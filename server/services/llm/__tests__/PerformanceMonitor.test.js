import { vi, describe, test, expect, beforeEach, it } from 'vitest';
import PerformanceMonitor from '../PerformanceMonitor.js';

describe('PerformanceMonitor', () => {
  let monitor;

  beforeEach(() => {
    monitor = new PerformanceMonitor();
  });

  describe('constructor', () => {
    it('should initialize with default metrics', () => {
      const metrics = monitor.getMetrics();
      
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.totalTokensUsed).toBe(0);
      expect(metrics.totalCost).toBe(0);
      expect(metrics.averageResponseTime).toBe(0);
      expect(metrics.requestHistory).toEqual([]);
      expect(metrics.providerStats).toEqual({});
    });

    it('should have token pricing for all providers', () => {
      expect(monitor.tokenPricing.openai).toBeDefined();
      expect(monitor.tokenPricing.anthropic).toBeDefined();
      expect(monitor.tokenPricing.local).toBeDefined();
    });
  });

  describe('startRequest', () => {
    it('should create a new request tracking entry', () => {
      const requestId = monitor.startRequest('openai', 'gpt-3.5-turbo', 1000);
      
      expect(requestId).toMatch(/^req_\d+_[a-z0-9]+$/);
      
      const metrics = monitor.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.requestHistory).toHaveLength(1);
      
      const request = metrics.requestHistory[0];
      expect(request.id).toBe(requestId);
      expect(request.provider).toBe('openai');
      expect(request.model).toBe('gpt-3.5-turbo');
      expect(request.inputTokens).toBe(1000);
      expect(request.status).toBe('pending');
    });

    it('should initialize provider stats', () => {
      monitor.startRequest('openai', 'gpt-4', 500);
      
      const metrics = monitor.getMetrics();
      expect(metrics.providerStats.openai).toBeDefined();
      expect(metrics.providerStats.openai.requests).toBe(0); // Not completed yet
    });
  });

  describe('completeRequest', () => {
    it('should complete a request with success status', async () => {
      const requestId = monitor.startRequest('openai', 'gpt-3.5-turbo', 1000);
      
      // Wait a bit to ensure response time is measurable
      await new Promise(resolve => setTimeout(resolve, 10));
      
      monitor.completeRequest(requestId, 500, 'success');
      
      const metrics = monitor.getMetrics();
      const request = metrics.requestHistory[0];
      
      expect(request.status).toBe('success');
      expect(request.outputTokens).toBe(500);
      expect(request.responseTime).toBeGreaterThan(0);
      expect(request.cost).toBeGreaterThan(0);
      expect(metrics.totalTokensUsed).toBe(1500); // 1000 + 500
      expect(metrics.totalCost).toBeGreaterThan(0);
    });

    it('should handle error status', () => {
      const requestId = monitor.startRequest('anthropic', 'claude-3-sonnet', 800);
      monitor.completeRequest(requestId, 0, 'error');
      
      const metrics = monitor.getMetrics();
      const request = metrics.requestHistory[0];
      
      expect(request.status).toBe('error');
      expect(request.outputTokens).toBe(0);
      expect(metrics.totalTokensUsed).toBe(800); // Only input tokens
    });

    it('should update provider stats', async () => {
      const requestId = monitor.startRequest('openai', 'gpt-4', 1200);
      
      // Add small delay to ensure measurable response time
      await new Promise(resolve => setTimeout(resolve, 10));
      
      monitor.completeRequest(requestId, 600, 'success');
      
      const metrics = monitor.getMetrics();
      const providerStats = metrics.providerStats.openai;
      
      expect(providerStats.requests).toBe(1);
      expect(providerStats.totalTokens).toBe(1800);
      expect(providerStats.totalCost).toBeGreaterThan(0);
      expect(providerStats.averageResponseTime).toBeGreaterThan(0);
    });

    it('should handle non-existent request ID gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation();
      
      monitor.completeRequest('non-existent-id', 100, 'success');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Request non-existent-id not found')
      );
      
      consoleSpy.mockRestore();
    });
  });

  describe('calculateCost', () => {
    it('should calculate cost for OpenAI models', () => {
      const cost = monitor.calculateCost('openai', 'gpt-3.5-turbo', 1000, 500);
      
      // Expected: (1000/1000 * 0.0015) + (500/1000 * 0.002) = 0.0015 + 0.001 = 0.0025
      expect(cost).toBeCloseTo(0.0025, 4);
    });

    it('should calculate cost for Anthropic models', () => {
      const cost = monitor.calculateCost('anthropic', 'claude-3-sonnet', 1000, 500);
      
      // Expected: (1000/1000 * 0.003) + (500/1000 * 0.015) = 0.003 + 0.0075 = 0.0105
      expect(cost).toBeCloseTo(0.0105, 4);
    });

    it('should return zero cost for local models', () => {
      const cost = monitor.calculateCost('local', 'default', 1000, 500);
      expect(cost).toBe(0);
    });

    it('should return zero for unknown provider/model', () => {
      const cost = monitor.calculateCost('unknown', 'model', 1000, 500);
      expect(cost).toBe(0);
    });
  });

  describe('getOptimizationRecommendations', () => {
    beforeEach(() => {
      // Set up some test data
      const requestId1 = monitor.startRequest('openai', 'gpt-4', 5000);
      monitor.completeRequest(requestId1, 2000, 'success');
      
      const requestId2 = monitor.startRequest('openai', 'gpt-4', 6000);
      monitor.completeRequest(requestId2, 3000, 'success');
    });

    it('should recommend model selection for large data volume', () => {
      const recommendations = monitor.getOptimizationRecommendations(60000);
      
      expect(recommendations.modelSelection).toBeDefined();
      expect(recommendations.modelSelection.suggestion).toContain('efficient model');
      expect(recommendations.modelSelection.reason).toContain('Large data volume');
    });

    it('should recommend cost optimization for expensive requests', () => {
      // Add expensive requests
      for (let i = 0; i < 5; i++) {
        const requestId = monitor.startRequest('openai', 'gpt-4', 8000);
        monitor.completeRequest(requestId, 4000, 'success');
      }
      
      const recommendations = monitor.getOptimizationRecommendations();
      
      expect(recommendations.costOptimization).toBeDefined();
      expect(recommendations.costOptimization.suggestion).toContain('local models');
    });

    it('should recommend performance optimization for slow requests', () => {
      // Simulate slow requests by manually setting response times
      monitor.metrics.requestHistory.forEach(request => {
        request.responseTime = 20000; // 20 seconds
      });
      monitor.updateAverageResponseTime();
      
      const recommendations = monitor.getOptimizationRecommendations();
      
      expect(recommendations.performanceOptimization).toBeDefined();
      expect(recommendations.performanceOptimization.suggestion).toContain('batching');
    });

    it('should recommend prompt optimization for high token usage', () => {
      // Add high token requests
      for (let i = 0; i < 3; i++) {
        const requestId = monitor.startRequest('openai', 'gpt-4', 10000);
        monitor.completeRequest(requestId, 5000, 'success');
      }
      
      const recommendations = monitor.getOptimizationRecommendations();
      
      expect(recommendations.promptOptimization).toBeDefined();
      expect(recommendations.promptOptimization.suggestion).toContain('reducing prompt size');
    });
  });

  describe('suggestOptimalModel', () => {
    it('should suggest cost-effective model for small datasets', () => {
      const suggestion = monitor.suggestOptimalModel({
        dataSize: 5000,
        prioritizeCost: true
      });
      
      expect(suggestion.provider).toBe('openai');
      expect(suggestion.model).toBe('gpt-3.5-turbo');
      expect(suggestion.reason).toContain('Cost-effective');
    });

    it('should suggest fast model for speed priority', () => {
      const suggestion = monitor.suggestOptimalModel({
        dataSize: 15000,
        prioritizeSpeed: true
      });
      
      expect(suggestion.provider).toBe('anthropic');
      expect(suggestion.model).toBe('claude-3-haiku');
      expect(suggestion.reason).toContain('Fast processing');
    });

    it('should suggest high-quality model for complex data', () => {
      const suggestion = monitor.suggestOptimalModel({
        dataSize: 40000,
        complexity: 'high'
      });
      
      expect(suggestion.provider).toBe('openai');
      expect(suggestion.model).toBe('gpt-4-turbo');
      expect(suggestion.reason).toContain('complex analysis');
    });
  });

  describe('reset', () => {
    it('should reset all metrics to initial state', () => {
      // Add some data
      const requestId = monitor.startRequest('openai', 'gpt-3.5-turbo', 1000);
      monitor.completeRequest(requestId, 500, 'success');
      
      // Reset
      monitor.reset();
      
      const metrics = monitor.getMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.totalTokensUsed).toBe(0);
      expect(metrics.totalCost).toBe(0);
      expect(metrics.averageResponseTime).toBe(0);
      expect(metrics.requestHistory).toEqual([]);
      expect(metrics.providerStats).toEqual({});
    });
  });

  describe('cleanupOldRequests', () => {
    it('should remove old requests', () => {
      // Add requests with old timestamps
      const oldTime = Date.now() - 48 * 60 * 60 * 1000; // 48 hours ago
      const recentTime = Date.now() - 1 * 60 * 60 * 1000; // 1 hour ago
      
      monitor.metrics.requestHistory = [
        { id: 'old1', startTime: oldTime, provider: 'openai' },
        { id: 'old2', startTime: oldTime, provider: 'openai' },
        { id: 'recent1', startTime: recentTime, provider: 'openai' }
      ];
      
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation();
      
      monitor.cleanupOldRequests(24 * 60 * 60 * 1000); // 24 hours
      
      expect(monitor.metrics.requestHistory).toHaveLength(1);
      expect(monitor.metrics.requestHistory[0].id).toBe('recent1');
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Cleaned up 2 old performance metrics')
      );
      
      consoleSpy.mockRestore();
    });

    it('should not remove anything if all requests are recent', () => {
      const requestId = monitor.startRequest('openai', 'gpt-3.5-turbo', 1000);
      monitor.completeRequest(requestId, 500, 'success');
      
      monitor.cleanupOldRequests();
      
      expect(monitor.metrics.requestHistory).toHaveLength(1);
    });
  });

  describe('getRecentRequests', () => {
    it('should return limited number of recent requests', () => {
      // Add multiple requests
      for (let i = 0; i < 15; i++) {
        const requestId = monitor.startRequest('openai', 'gpt-3.5-turbo', 1000);
        monitor.completeRequest(requestId, 500, 'success');
      }
      
      const recent = monitor.getRecentRequests(5);
      
      expect(recent).toHaveLength(5);
      expect(recent[0]).toHaveProperty('id');
      expect(recent[0]).toHaveProperty('provider');
      expect(recent[0]).toHaveProperty('totalTokens');
      expect(recent[0]).toHaveProperty('responseTime');
      expect(recent[0]).toHaveProperty('cost');
    });
  });
});