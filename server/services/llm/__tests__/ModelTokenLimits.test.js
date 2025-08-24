import { describe, it, test, expect, beforeEach } from 'vitest';
import { ModelTokenLimits } from '../ModelTokenLimits.js';

describe('ModelTokenLimits', () => {
  let tokenLimits;

  beforeEach(() => {
    tokenLimits = new ModelTokenLimits();
  });

  describe('getModelLimits', () => {
    test('should return correct limits for GPT-4-turbo', () => {
      const limits = tokenLimits.getModelLimits('openai', 'gpt-4-turbo');
      
      expect(limits).toEqual({
        total: 128000,
        input: 120000,
        output: 8000,
        tokenizer: 'cl100k_base',
        bufferPercentage: 10,
        provider: 'openai',
        model: 'gpt-4-turbo'
      });
    });

    test('should return correct limits for GPT-5 with massive capacity', () => {
      const limits = tokenLimits.getModelLimits('openai', 'gpt-5');
      
      expect(limits).toEqual({
        total: 400000,
        input: 272000,
        output: 128000,
        tokenizer: 'o200k_base',
        bufferPercentage: 5,
        provider: 'openai',
        model: 'gpt-5'
      });
    });

    test('should return correct limits for Claude models', () => {
      const limits = tokenLimits.getModelLimits('anthropic', 'claude-3-opus');
      
      expect(limits).toEqual({
        total: 200000,
        input: 180000,
        output: 20000,
        tokenizer: 'claude',
        bufferPercentage: 10,
        provider: 'anthropic',
        model: 'claude-3-opus'
      });
    });

    test('should return default limits for unknown provider', () => {
      const limits = tokenLimits.getModelLimits('unknown-provider', 'some-model');
      
      expect(limits).toEqual({
        total: 8000,
        input: 6000,
        output: 2000,
        tokenizer: 'cl100k_base',
        bufferPercentage: 20,
        provider: 'unknown',
        model: 'unknown'
      });
    });

    test('should return default limits for unknown model', () => {
      const limits = tokenLimits.getModelLimits('openai', 'unknown-model');
      
      expect(limits).toEqual({
        total: 8000,
        input: 6000,
        output: 2000,
        tokenizer: 'cl100k_base',
        bufferPercentage: 20,
        provider: 'unknown',
        model: 'unknown'
      });
    });

    test('should handle case insensitive provider and model names', () => {
      const limits = tokenLimits.getModelLimits('OPENAI', 'GPT-4-TURBO');
      
      expect(limits.provider).toBe('OPENAI');
      expect(limits.model).toBe('GPT-4-TURBO');
      expect(limits.total).toBe(128000);
    });
  });

  describe('calculateOptimalSplit', () => {
    test('should calculate optimal split for GPT-4-turbo', () => {
      const split = tokenLimits.calculateOptimalSplit('openai', 'gpt-4-turbo', 1000);
      
      expect(split).toEqual({
        total: 128000,
        systemPrompt: 1000,
        userData: 114200, // 128000 - 1000 - 12800 (10% buffer)
        outputBuffer: 12800,
        efficiency: expect.closeTo(89.22, 1),
        tokenizer: 'cl100k_base'
      });
    });

    test('should calculate optimal split for GPT-5 with massive capacity', () => {
      const split = tokenLimits.calculateOptimalSplit('openai', 'gpt-5', 1000);
      
      expect(split).toEqual({
        total: 400000,
        systemPrompt: 1000,
        userData: 271000, // 400000 - 1000 - 128000
        outputBuffer: 128000,
        efficiency: expect.closeTo(67.75, 1), // 271000/400000 * 100
        tokenizer: 'o200k_base'
      });
    });

    test('should use default system prompt tokens when not provided', () => {
      const split = tokenLimits.calculateOptimalSplit('openai', 'gpt-4-turbo');
      
      expect(split.systemPrompt).toBe(500);
      expect(split.userData).toBe(114700); // 128000 - 500 - 12800
    });

    test('should handle models with minimum output buffer', () => {
      const split = tokenLimits.calculateOptimalSplit('openai', 'gpt-3.5-turbo', 500);
      
      // Should use the larger of output or percentage buffer (15% of 16385 = 2457.75)
      expect(split.outputBuffer).toBe(2457.75); // 15% buffer is larger than fixed output
      expect(split.userData).toBe(13427.25); // 16385 - 500 - 2457.75
    });

    test('should not allow negative userData tokens', () => {
      const split = tokenLimits.calculateOptimalSplit('openai', 'gpt-3.5-turbo', 15000);
      
      expect(split.userData).toBe(0);
      expect(split.systemPrompt).toBe(15000);
    });
  });

  describe('getOptimizationRecommendation', () => {
    test('should recommend direct analysis for small datasets', () => {
      const recommendation = tokenLimits.getOptimizationRecommendation(
        50000, 'openai', 'gpt-4-turbo', 1000
      );
      
      expect(recommendation).toEqual({
        strategy: 'direct',
        confidence: 'high',
        reason: 'Data fits comfortably within token limits',
        utilizationRatio: expect.closeTo(0.44, 2),
        availableTokens: 114200,
        estimatedTokens: 50000,
        tokenSavings: 0,
        modelCapacity: 128000,
        efficiency: expect.closeTo(89.22, 1)
      });
    });

    test('should recommend smart truncation for medium datasets', () => {
      const recommendation = tokenLimits.getOptimizationRecommendation(
        100000, 'openai', 'gpt-4-turbo', 1000
      );
      
      expect(recommendation).toEqual({
        strategy: 'smart-truncation',
        confidence: 'medium',
        reason: 'Data approaching token limits, smart truncation recommended',
        utilizationRatio: expect.closeTo(0.88, 2),
        availableTokens: 114200,
        estimatedTokens: 100000,
        tokenSavings: 0,
        modelCapacity: 128000,
        efficiency: expect.closeTo(89.22, 1)
      });
    });

    test('should recommend progressive analysis for large datasets', () => {
      const recommendation = tokenLimits.getOptimizationRecommendation(
        150000, 'openai', 'gpt-4-turbo', 1000
      );
      
      expect(recommendation).toEqual({
        strategy: 'progressive',
        confidence: 'high',
        reason: 'Data exceeds token limits, progressive analysis recommended',
        utilizationRatio: expect.closeTo(1.31, 2),
        availableTokens: 114200,
        estimatedTokens: 150000,
        tokenSavings: 35800,
        modelCapacity: 128000,
        efficiency: expect.closeTo(89.22, 1)
      });
    });

    test('should handle GPT-5 large datasets efficiently', () => {
      const recommendation = tokenLimits.getOptimizationRecommendation(
        150000, 'openai', 'gpt-5', 1000
      );
      
      // 150K tokens is only ~55% of GPT-5's 271K available tokens, so direct analysis is fine
      expect(recommendation.strategy).toBe('direct');
      expect(recommendation.confidence).toBe('high');
      expect(recommendation.utilizationRatio).toBeLessThan(1.0);
    });
  });

  describe('getSupportedModels', () => {
    test('should return all supported models organized by provider', () => {
      const models = tokenLimits.getSupportedModels();
      
      expect(models).toHaveProperty('openai');
      expect(models).toHaveProperty('anthropic');
      expect(models).toHaveProperty('local');
      
      expect(models.openai).toContainEqual(
        expect.objectContaining({
          name: 'gpt-4-turbo',
          total: 128000
        })
      );
      
      expect(models.openai).toContainEqual(
        expect.objectContaining({
          name: 'gpt-5',
          total: 400000
        })
      );
    });

    test('should include all expected OpenAI models', () => {
      const models = tokenLimits.getSupportedModels();
      const openaiModelNames = models.openai.map(m => m.name);
      
      expect(openaiModelNames).toContain('gpt-3.5-turbo');
      expect(openaiModelNames).toContain('gpt-4');
      expect(openaiModelNames).toContain('gpt-4-turbo');
      expect(openaiModelNames).toContain('gpt-4o');
      expect(openaiModelNames).toContain('gpt-5');
    });
  });

  describe('getRecommendedModel', () => {
    test('should recommend GPT-3.5-turbo for small datasets', () => {
      const recommendation = tokenLimits.getRecommendedModel(10000);
      
      expect(recommendation.provider).toBe('openai');
      expect(recommendation.model).toBe('gpt-3.5-turbo');
      expect(recommendation.recommendation).toBe('direct');
    });

    test('should recommend GPT-4-turbo for medium datasets', () => {
      const recommendation = tokenLimits.getRecommendedModel(50000);
      
      expect(recommendation.provider).toBe('openai');
      expect(recommendation.model).toBe('gpt-4-turbo');
      expect(recommendation.recommendation).toBe('direct');
    });

    test('should recommend GPT-5 for very large datasets', () => {
      const recommendation = tokenLimits.getRecommendedModel(250000);
      
      expect(recommendation.provider).toBe('openai');
      expect(recommendation.model).toBe('gpt-5');
      expect(recommendation.recommendation).toBe('direct');
    });

    test('should recommend progressive analysis for extremely large datasets', () => {
      const recommendation = tokenLimits.getRecommendedModel(300000);
      
      expect(recommendation.provider).toBe(null);
      expect(recommendation.model).toBe(null);
      expect(recommendation.recommendation).toBe('progressive');
      expect(recommendation.reason).toContain('progressive analysis required');
    });

    test('should respect preferred provider', () => {
      const recommendation = tokenLimits.getRecommendedModel(50000, 'anthropic');
      
      expect(recommendation.provider).toBe('anthropic');
      expect(recommendation.model).toContain('claude');
      expect(recommendation.recommendation).toBe('direct');
    });

    test('should handle case where preferred provider cannot handle data size', () => {
      const recommendation = tokenLimits.getRecommendedModel(300000, 'local');
      
      expect(recommendation.provider).toBe(null);
      expect(recommendation.recommendation).toBe('progressive');
    });
  });

  describe('edge cases and error handling', () => {
    test('should handle null/undefined provider and model gracefully', () => {
      const limits1 = tokenLimits.getModelLimits(null, null);
      const limits2 = tokenLimits.getModelLimits(undefined, undefined);
      
      expect(limits1).toEqual(tokenLimits.getDefaultLimits());
      expect(limits2).toEqual(tokenLimits.getDefaultLimits());
    });

    test('should handle empty strings for provider and model', () => {
      const limits = tokenLimits.getModelLimits('', '');
      
      expect(limits).toEqual(tokenLimits.getDefaultLimits());
    });

    test('should handle very large system prompt tokens', () => {
      const split = tokenLimits.calculateOptimalSplit('openai', 'gpt-3.5-turbo', 20000);
      
      expect(split.userData).toBe(0);
      expect(split.systemPrompt).toBe(20000);
    });

    test('should handle zero estimated tokens', () => {
      const recommendation = tokenLimits.getOptimizationRecommendation(
        0, 'openai', 'gpt-4-turbo'
      );
      
      expect(recommendation.strategy).toBe('direct');
      expect(recommendation.utilizationRatio).toBe(0);
    });
  });
});