import { vi, describe, test, expect, beforeEach, afterEach, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import { LLMAnalyzer } from '../services/llm/index.js';
import PerformanceMonitor from '../services/llm/PerformanceMonitor.js';
import PerformanceOptimizer from '../services/llm/PerformanceOptimizer.js';

// Mock the LLMAnalyzer to avoid real API calls
vi.mock('../services/llm/LLMAnalyzer.js');

describe('Performance Monitoring Integration', () => {
  let app;
  let mockLLMAnalyzer;

  beforeEach(() => {
    // Create Express app with performance monitoring endpoints
    app = express();
    app.use(express.json());

    // Mock LLMAnalyzer
    mockLLMAnalyzer = {
      config: { enabled: true, provider: 'openai', model: 'gpt-3.5-turbo' },
      getPerformanceMetrics: vi.fn(),
      getOptimizationRecommendations: vi.fn(),
      resetPerformanceMetrics: vi.fn()
    };

    LLMAnalyzer.fromEnvironment = vi.fn().mockReturnValue(mockLLMAnalyzer);

    // Add performance monitoring endpoints
    app.get('/api/llm-performance', async (req, res) => {
      try {
        const llmAnalyzer = LLMAnalyzer.fromEnvironment(process.env);
        
        if (!llmAnalyzer.config.enabled) {
          return res.json({
            enabled: false,
            message: 'LLM analysis is not enabled'
          });
        }

        const metrics = llmAnalyzer.getPerformanceMetrics();
        const recommendations = llmAnalyzer.getOptimizationRecommendations();
        
        res.json({
          enabled: true,
          provider: llmAnalyzer.config.provider,
          model: llmAnalyzer.config.model,
          metrics: {
            totalRequests: metrics.totalRequests,
            totalTokensUsed: metrics.totalTokensUsed,
            totalCost: metrics.totalCost,
            averageResponseTime: metrics.averageResponseTime,
            providerStats: metrics.providerStats,
            recentRequests: metrics.recentRequests
          },
          recommendations,
          lastUpdated: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          error: 'Failed to get performance metrics: ' + error.message
        });
      }
    });

    app.post('/api/llm-performance/reset', async (req, res) => {
      try {
        const llmAnalyzer = LLMAnalyzer.fromEnvironment(process.env);
        
        if (!llmAnalyzer.config.enabled) {
          return res.status(400).json({
            error: 'LLM analysis is not enabled'
          });
        }

        llmAnalyzer.resetPerformanceMetrics();
        
        res.json({
          status: 'Performance metrics reset successfully',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        res.status(500).json({
          error: 'Failed to reset performance metrics: ' + error.message
        });
      }
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/llm-performance', () => {
    it('should return performance metrics when LLM is enabled', async () => {
      const mockMetrics = {
        totalRequests: 10,
        totalTokensUsed: 15000,
        totalCost: 0.25,
        averageResponseTime: 5000,
        providerStats: {
          openai: {
            requests: 10,
            totalTokens: 15000,
            totalCost: 0.25,
            averageResponseTime: 5000
          }
        },
        recentRequests: [
          {
            id: 'req_123',
            provider: 'openai',
            totalTokens: 1500,
            responseTime: 4500,
            cost: 0.025,
            status: 'success'
          }
        ]
      };

      const mockRecommendations = {
        modelSelection: null,
        costOptimization: {
          suggestion: 'Consider using local models',
          reason: 'Average cost per request is high'
        }
      };

      mockLLMAnalyzer.getPerformanceMetrics.mockReturnValue(mockMetrics);
      mockLLMAnalyzer.getOptimizationRecommendations.mockReturnValue(mockRecommendations);

      const response = await request(app)
        .get('/api/llm-performance')
        .expect(200);

      expect(response.body).toMatchObject({
        enabled: true,
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        metrics: {
          totalRequests: 10,
          totalTokensUsed: 15000,
          totalCost: 0.25,
          averageResponseTime: 5000
        },
        recommendations: mockRecommendations
      });

      expect(response.body.lastUpdated).toBeDefined();
      expect(mockLLMAnalyzer.getPerformanceMetrics).toHaveBeenCalled();
      expect(mockLLMAnalyzer.getOptimizationRecommendations).toHaveBeenCalled();
    });

    it('should return disabled status when LLM is not enabled', async () => {
      mockLLMAnalyzer.config.enabled = false;

      const response = await request(app)
        .get('/api/llm-performance')
        .expect(200);

      expect(response.body).toEqual({
        enabled: false,
        message: 'LLM analysis is not enabled'
      });

      expect(mockLLMAnalyzer.getPerformanceMetrics).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockLLMAnalyzer.getPerformanceMetrics.mockImplementation(() => {
        throw new Error('Metrics unavailable');
      });

      const response = await request(app)
        .get('/api/llm-performance')
        .expect(500);

      expect(response.body).toMatchObject({
        error: 'Failed to get performance metrics: Metrics unavailable'
      });
    });
  });

  describe('POST /api/llm-performance/reset', () => {
    it('should reset performance metrics successfully', async () => {
      const response = await request(app)
        .post('/api/llm-performance/reset')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'Performance metrics reset successfully'
      });

      expect(response.body.timestamp).toBeDefined();
      expect(mockLLMAnalyzer.resetPerformanceMetrics).toHaveBeenCalled();
    });

    it('should return error when LLM is not enabled', async () => {
      mockLLMAnalyzer.config.enabled = false;

      const response = await request(app)
        .post('/api/llm-performance/reset')
        .expect(400);

      expect(response.body).toEqual({
        error: 'LLM analysis is not enabled'
      });

      expect(mockLLMAnalyzer.resetPerformanceMetrics).not.toHaveBeenCalled();
    });

    it('should handle reset errors gracefully', async () => {
      mockLLMAnalyzer.resetPerformanceMetrics.mockImplementation(() => {
        throw new Error('Reset failed');
      });

      const response = await request(app)
        .post('/api/llm-performance/reset')
        .expect(500);

      expect(response.body).toMatchObject({
        error: 'Failed to reset performance metrics: Reset failed'
      });
    });
  });
});

describe('Performance Monitor Integration with LLM Providers', () => {
  let monitor;
  let optimizer;

  beforeEach(() => {
    monitor = new PerformanceMonitor();
    optimizer = new PerformanceOptimizer(monitor);
  });

  describe('End-to-end performance tracking', () => {
    it('should track complete request lifecycle', async () => {
      // Simulate a complete LLM request lifecycle
      const requestId = monitor.startRequest('openai', 'gpt-3.5-turbo', 1500);
      
      expect(requestId).toBeDefined();
      expect(monitor.getMetrics().totalRequests).toBe(1);
      
      // Simulate processing time
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Complete the request
      monitor.completeRequest(requestId, 800, 'success');
      
      const metrics = monitor.getMetrics();
      expect(metrics.totalTokensUsed).toBe(2300); // 1500 + 800
      expect(metrics.totalCost).toBeGreaterThan(0);
      expect(metrics.averageResponseTime).toBeGreaterThan(0);
      expect(metrics.providerStats.openai.requests).toBe(1);
    });

    it('should provide optimization recommendations based on usage patterns', () => {
      // Simulate various usage patterns
      
      // High cost pattern
      for (let i = 0; i < 5; i++) {
        const requestId = monitor.startRequest('openai', 'gpt-4', 8000);
        monitor.completeRequest(requestId, 4000, 'success');
      }
      
      // High token usage pattern
      for (let i = 0; i < 3; i++) {
        const requestId = monitor.startRequest('anthropic', 'claude-3-opus', 12000);
        monitor.completeRequest(requestId, 6000, 'success');
      }
      
      const recommendations = optimizer.getOptimizationRecommendations();
      
      expect(recommendations.costOptimization).toBeDefined();
      expect(recommendations.tokenOptimization).toBeDefined();
    });

    it('should optimize model selection based on requirements', () => {
      // Add performance history for different models
      const openaiId = monitor.startRequest('openai', 'gpt-3.5-turbo', 1000);
      monitor.completeRequest(openaiId, 500, 'success');
      
      const anthropicId = monitor.startRequest('anthropic', 'claude-3-haiku', 800);
      monitor.completeRequest(anthropicId, 400, 'success');
      
      // Test different optimization scenarios
      const costOptimal = optimizer.selectOptimalModel({
        dataSize: 5000,
        prioritizeCost: true
      });
      
      const speedOptimal = optimizer.selectOptimalModel({
        dataSize: 10000,
        prioritizeSpeed: true
      });
      
      const qualityOptimal = optimizer.selectOptimalModel({
        dataSize: 20000,
        prioritizeQuality: true
      });
      
      expect(costOptimal.provider).toBeDefined();
      expect(speedOptimal.provider).toBeDefined();
      expect(qualityOptimal.provider).toBeDefined();
      
      // Cost optimal should prefer cheaper models
      expect(costOptimal.reason).toContain('cost') || 
             costOptimal.estimatedCost <= speedOptimal.estimatedCost;
    });

    it('should handle prompt optimization for large inputs', () => {
      const largePrompt = 'Analyze this data: ' + JSON.stringify({
        commits: Array(1000).fill({ message: 'test commit', author: 'developer' }),
        issues: Array(500).fill({ title: 'test issue', description: 'long description' })
      });
      
      const optimization = optimizer.optimizePromptSize(
        largePrompt,
        'openai',
        'gpt-3.5-turbo',
        20000
      );
      
      if (optimization.optimized) {
        expect(optimization.prompt.length).toBeLessThan(largePrompt.length);
        expect(optimization.optimizedTokens).toBeLessThan(optimization.originalTokens);
        expect(optimization.reductionRatio).toBeLessThan(1);
      }
    });
  });

  describe('Performance data cleanup and maintenance', () => {
    it('should clean up old performance data', () => {
      // Add old requests
      const oldTime = Date.now() - 48 * 60 * 60 * 1000; // 48 hours ago
      monitor.metrics.requestHistory = [
        { id: 'old1', startTime: oldTime, provider: 'openai' },
        { id: 'old2', startTime: oldTime, provider: 'openai' }
      ];
      
      // Add recent request
      const recentId = monitor.startRequest('openai', 'gpt-3.5-turbo', 1000);
      monitor.completeRequest(recentId, 500, 'success');
      
      expect(monitor.metrics.requestHistory).toHaveLength(3);
      
      // Cleanup old requests (24 hour retention)
      monitor.cleanupOldRequests(24 * 60 * 60 * 1000);
      
      expect(monitor.metrics.requestHistory).toHaveLength(1);
      expect(monitor.metrics.requestHistory[0].id).toBe(recentId);
    });

    it('should reset metrics completely', () => {
      // Add some data
      const requestId = monitor.startRequest('openai', 'gpt-3.5-turbo', 1000);
      monitor.completeRequest(requestId, 500, 'success');
      
      expect(monitor.getMetrics().totalRequests).toBe(1);
      
      // Reset
      monitor.reset();
      
      const metrics = monitor.getMetrics();
      expect(metrics.totalRequests).toBe(0);
      expect(metrics.totalTokensUsed).toBe(0);
      expect(metrics.totalCost).toBe(0);
      expect(metrics.requestHistory).toHaveLength(0);
    });
  });

  describe('Error handling and edge cases', () => {
    it('should handle failed requests properly', () => {
      const requestId = monitor.startRequest('openai', 'gpt-4', 2000);
      monitor.completeRequest(requestId, 0, 'error');
      
      const metrics = monitor.getMetrics();
      expect(metrics.totalRequests).toBe(1);
      expect(metrics.totalTokensUsed).toBe(2000); // Only input tokens
      expect(metrics.providerStats.openai.requests).toBe(1);
      
      const request = metrics.requestHistory[0];
      expect(request.status).toBe('error');
      expect(request.outputTokens).toBe(0);
    });

    it('should handle missing request IDs gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation();
      
      monitor.completeRequest('non-existent', 100, 'success');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Request non-existent not found')
      );
      
      consoleSpy.mockRestore();
    });

    it('should provide fallback recommendations when no data available', () => {
      const recommendations = optimizer.getOptimizationRecommendations();
      
      // Should not crash and should provide some structure
      expect(typeof recommendations).toBe('object');
    });
  });
});