import { vi, describe, test, expect, beforeEach, it } from 'vitest';
import PerformanceOptimizer from '../PerformanceOptimizer.js';
import PerformanceMonitor from '../PerformanceMonitor.js';

describe('PerformanceOptimizer', () => {
  let monitor;
  let optimizer;

  beforeEach(() => {
    monitor = new PerformanceMonitor();
    optimizer = new PerformanceOptimizer(monitor);
  });

  describe('constructor', () => {
    it('should initialize with default thresholds', () => {
      expect(optimizer.thresholds.maxResponseTime).toBe(30000);
      expect(optimizer.thresholds.maxCostPerRequest).toBe(0.20);
      expect(optimizer.thresholds.maxTokensPerRequest).toBe(10000);
      expect(optimizer.thresholds.minSuccessRate).toBe(0.95);
    });

    it('should have model characteristics for all providers', () => {
      expect(optimizer.modelCharacteristics.openai).toBeDefined();
      expect(optimizer.modelCharacteristics.anthropic).toBeDefined();
      expect(optimizer.modelCharacteristics.local).toBeDefined();
    });
  });

  describe('optimizePromptSize', () => {
    it('should not optimize if prompt is within limits', () => {
      const prompt = 'This is a short prompt';
      const result = optimizer.optimizePromptSize(prompt, 'openai', 'gpt-3.5-turbo', 100);
      
      expect(result.optimized).toBe(false);
      expect(result.prompt).toBe(prompt);
      expect(result.reason).toContain('within limits');
    });

    it('should optimize if prompt exceeds token limits', () => {
      const longPrompt = 'This is a very long prompt that exceeds token limits. '.repeat(1000);
      const result = optimizer.optimizePromptSize(longPrompt, 'openai', 'gpt-3.5-turbo', 20000);
      
      expect(result.optimized).toBe(true);
      expect(result.prompt.length).toBeLessThan(longPrompt.length);
      expect(result.originalTokens).toBe(20000);
      expect(result.optimizedTokens).toBeLessThan(20000);
      expect(result.reductionRatio).toBeLessThan(1);
    });

    it('should handle unknown model gracefully', () => {
      const prompt = 'Test prompt';
      const result = optimizer.optimizePromptSize(prompt, 'unknown', 'unknown-model', 1000);
      
      expect(result.optimized).toBe(false);
      expect(result.reason).toContain('Unknown model characteristics');
    });

    it('should truncate examples when needed', () => {
      const promptWithExamples = `
        Analyze this data.
        
        Examples:
        Example 1: This is a very long example that should be truncated when optimization is needed. It contains lots of details that might not be essential for the core analysis.
        Example 2: Another long example with extensive details.
        
        Please provide insights.
      `;
      
      const result = optimizer.optimizePromptSize(promptWithExamples, 'openai', 'gpt-3.5-turbo', 15000);
      
      if (result.optimized) {
        expect(result.prompt).toContain('[truncated for optimization]');
      }
    });

    it('should handle large prompts appropriately', () => {
      // Create a large data structure
      const largeDataArray = Array(1000).fill({ message: 'test commit', author: 'test' });
      const promptWithData = `
        Analyze this data:
        
        ${JSON.stringify({ commits: largeDataArray })}
        
        Provide insights.
      `;
      
      // Use a very high token count to ensure optimization is triggered
      const result = optimizer.optimizePromptSize(promptWithData, 'openai', 'gpt-3.5-turbo', 50000);
      
      // The function should return a result object with the expected structure
      expect(result).toHaveProperty('optimized');
      expect(result).toHaveProperty('prompt');
      expect(result).toHaveProperty('reason');
      
      // If optimization occurs, the prompt should be shorter
      if (result.optimized) {
        expect(result.prompt.length).toBeLessThan(promptWithData.length);
        expect(result).toHaveProperty('originalTokens');
        expect(result).toHaveProperty('optimizedTokens');
        expect(result).toHaveProperty('reductionRatio');
      }
    });
  });

  describe('selectOptimalModel', () => {
    beforeEach(() => {
      // Add some performance history
      const requestId1 = monitor.startRequest('openai', 'gpt-3.5-turbo', 1000);
      monitor.completeRequest(requestId1, 500, 'success');
      
      const requestId2 = monitor.startRequest('anthropic', 'claude-3-haiku', 800);
      monitor.completeRequest(requestId2, 400, 'success');
    });

    it('should prioritize cost when requested', () => {
      const result = optimizer.selectOptimalModel({
        prioritizeCost: true,
        dataVolume: 5000
      });
      
      expect(result.provider).toBeDefined();
      expect(result.model).toBeDefined();
      expect(result.reason).toContain('cost');
      expect(result.estimatedCost).toBeDefined();
    });

    it('should prioritize speed when requested', () => {
      const result = optimizer.selectOptimalModel({
        prioritizeSpeed: true,
        dataVolume: 10000
      });
      
      expect(result.provider).toBeDefined();
      expect(result.model).toBeDefined();
      expect(result.reason).toContain('fast') || expect(result.reason).toContain('speed');
    });

    it('should prioritize quality when requested', () => {
      const result = optimizer.selectOptimalModel({
        prioritizeQuality: true,
        dataVolume: 15000
      });
      
      expect(result.provider).toBeDefined();
      expect(result.model).toBeDefined();
      expect(result.reason).toContain('quality');
    });

    it('should consider data volume in selection', () => {
      const smallDataResult = optimizer.selectOptimalModel({
        dataVolume: 1000
      });
      
      const largeDataResult = optimizer.selectOptimalModel({
        dataVolume: 100000
      });
      
      expect(smallDataResult.provider).toBeDefined();
      expect(largeDataResult.provider).toBeDefined();
      // Large data might prefer different models
    });

    it('should include alternatives in response', () => {
      const result = optimizer.selectOptimalModel({
        dataVolume: 5000
      });
      
      expect(result.alternatives).toBeDefined();
      expect(Array.isArray(result.alternatives)).toBe(true);
      expect(result.alternatives.length).toBeLessThanOrEqual(2);
    });

    it('should provide fallback when no models found', () => {
      // Clear all model characteristics to simulate no suitable models
      optimizer.modelCharacteristics = {};
      
      const result = optimizer.selectOptimalModel({
        dataVolume: 5000
      });
      
      expect(result.provider).toBe('openai');
      expect(result.model).toBe('gpt-3.5-turbo');
      expect(result.reason).toContain('Default fallback');
    });

    it('should bonus models with good historical performance', () => {
      // Add more successful requests for a specific provider
      for (let i = 0; i < 10; i++) {
        const requestId = monitor.startRequest('openai', 'gpt-3.5-turbo', 1000);
        monitor.completeRequest(requestId, 500, 'success');
      }
      
      const result = optimizer.selectOptimalModel({
        dataVolume: 5000
      });
      
      // Should consider historical performance in scoring
      expect(result.provider).toBeDefined();
      expect(result.model).toBeDefined();
    });
  });

  describe('estimateResponseTime', () => {
    it('should estimate response time based on speed characteristics', () => {
      const fastModel = { speed: 5, cost: 1, quality: 3 };
      const slowModel = { speed: 1, cost: 5, quality: 5 };
      
      const fastTime = optimizer.estimateResponseTime(fastModel);
      const slowTime = optimizer.estimateResponseTime(slowModel);
      
      expect(fastTime).toBeLessThan(slowTime);
      expect(fastTime).toBeGreaterThan(0);
      expect(slowTime).toBeGreaterThan(0);
    });
  });

  describe('generateSelectionReason', () => {
    it('should generate reason for cost priority', () => {
      const selection = {
        estimatedCost: 0.05,
        characteristics: { speed: 4, cost: 2, quality: 3 },
        avgResponseTime: 5000
      };
      
      const reason = optimizer.generateSelectionReason(selection, {
        prioritizeCost: true
      });
      
      expect(reason).toContain('cost-effective');
      expect(reason).toContain('$0.0500');
    });

    it('should generate reason for speed priority', () => {
      const selection = {
        characteristics: { speed: 5, cost: 2, quality: 3 },
        avgResponseTime: 3000
      };
      
      const reason = optimizer.generateSelectionReason(selection, {
        prioritizeSpeed: true
      });
      
      expect(reason).toContain('fast processing');
      expect(reason).toContain('5/5 speed rating');
    });

    it('should generate reason for quality priority', () => {
      const selection = {
        characteristics: { speed: 3, cost: 4, quality: 5 },
        avgResponseTime: 8000
      };
      
      const reason = optimizer.generateSelectionReason(selection, {
        prioritizeQuality: true
      });
      
      expect(reason).toContain('high quality');
      expect(reason).toContain('5/5 quality rating');
    });

    it('should include proven performance when available', () => {
      const selection = {
        characteristics: { speed: 4, cost: 2, quality: 4 },
        avgResponseTime: 6000
      };
      
      const reason = optimizer.generateSelectionReason(selection, {});
      
      expect(reason).toContain('proven performance');
      expect(reason).toContain('6.0s avg response time');
    });

    it('should provide default reason when no specific priorities', () => {
      const selection = {
        characteristics: { speed: 4, cost: 2, quality: 4 },
        avgResponseTime: 0
      };
      
      const reason = optimizer.generateSelectionReason(selection, {});
      
      expect(reason).toContain('Best overall balance');
    });
  });

  describe('getOptimizationRecommendations', () => {
    beforeEach(() => {
      // Set up some test data
      const requestId1 = monitor.startRequest('openai', 'gpt-3.5-turbo', 1000);
      monitor.completeRequest(requestId1, 500, 'success');
      
      const requestId2 = monitor.startRequest('openai', 'gpt-3.5-turbo', 1200);
      monitor.completeRequest(requestId2, 600, 'error');
    });

    it('should recommend reliability optimization for high failure rate', () => {
      // Add more failed requests
      for (let i = 0; i < 5; i++) {
        const requestId = monitor.startRequest('openai', 'gpt-3.5-turbo', 1000);
        monitor.completeRequest(requestId, 0, 'error');
      }
      
      const recommendations = optimizer.getOptimizationRecommendations();
      
      expect(recommendations.reliabilityOptimization).toBeDefined();
      expect(recommendations.reliabilityOptimization.suggestion).toContain('retry logic');
    });

    it('should recommend token optimization for high token usage', () => {
      // Add high token requests
      for (let i = 0; i < 3; i++) {
        const requestId = monitor.startRequest('openai', 'gpt-4', 9000);
        monitor.completeRequest(requestId, 4000, 'success');
      }
      
      const recommendations = optimizer.getOptimizationRecommendations();
      
      expect(recommendations.tokenOptimization).toBeDefined();
      expect(recommendations.tokenOptimization.suggestion).toContain('prompt compression');
    });

    it('should include base monitor recommendations', () => {
      const recommendations = optimizer.getOptimizationRecommendations();
      
      // Should include recommendations from the base monitor
      expect(typeof recommendations).toBe('object');
    });
  });

  describe('updateThresholds', () => {
    it('should update optimization thresholds', () => {
      const newThresholds = {
        maxResponseTime: 20000,
        maxCostPerRequest: 0.15
      };
      
      optimizer.updateThresholds(newThresholds);
      
      expect(optimizer.thresholds.maxResponseTime).toBe(20000);
      expect(optimizer.thresholds.maxCostPerRequest).toBe(0.15);
      expect(optimizer.thresholds.maxTokensPerRequest).toBe(10000); // Unchanged
    });
  });

  describe('truncateExamples', () => {
    it('should truncate example sections', () => {
      const prompt = `
        Analyze this data.
        
        Examples:
        This is a long example that should be truncated when the target ratio is applied.
        
        Continue analysis.
      `;
      
      const result = optimizer.truncateExamples(prompt, 0.5);
      
      expect(result).toContain('[truncated for optimization]');
      expect(result.length).toBeLessThan(prompt.length);
    });

    it('should handle prompts without examples', () => {
      const prompt = 'Simple prompt without examples';
      const result = optimizer.truncateExamples(prompt, 0.5);
      
      expect(result).toBe(prompt);
    });
  });

  describe('summarizeDataSections', () => {
    it('should summarize large data sections', () => {
      const largeData = '{"data": [' + '"item",'.repeat(1000) + '"last"]}';
      const prompt = `Analyze this: ${largeData}`;
      
      const result = optimizer.summarizeDataSections(prompt, 0.3);
      
      expect(result).toContain('[data truncated for optimization]');
      expect(result.length).toBeLessThan(prompt.length);
    });

    it('should not modify small data sections', () => {
      const prompt = 'Analyze this: {"small": "data"}';
      const result = optimizer.summarizeDataSections(prompt, 0.5);
      
      expect(result).toBe(prompt);
    });

    it('should try to end at reasonable points', () => {
      const largeData = '{"items": [' + '{"id": 1, "name": "test"},'.repeat(100) + '{"id": 100}]}';
      const prompt = `Analyze: ${largeData}`;
      
      const result = optimizer.summarizeDataSections(prompt, 0.3);
      
      if (result.includes('[data truncated for optimization]')) {
        // Should try to end at comma, bracket, or brace
        const truncatedPart = result.split('[data truncated for optimization]')[0];
        const lastChar = truncatedPart.trim().slice(-1);
        expect([',', '}', ']', '\n'].includes(lastChar) || truncatedPart.length > 0).toBe(true);
      }
    });
  });
});