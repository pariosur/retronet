import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LLMConfig } from '../config.js';
import { LLMServiceFactory } from '../LLMServiceFactory.js';
import { BaseLLMProvider } from '../BaseLLMProvider.js';

// Mock provider for testing
class MockProvider extends BaseLLMProvider {
  async generateInsights() { return {}; }
  async validateConnection() { return true; }
}

describe('LLMConfig', () => {
  beforeEach(() => {
    // Register mock providers for testing
    LLMServiceFactory.registerProvider('openai', MockProvider);
    LLMServiceFactory.registerProvider('anthropic', MockProvider);
  });

  afterEach(() => {
    // Clean up providers after each test
    LLMServiceFactory.providers.clear();
  });
  describe('fromEnvironment', () => {
    it('should return null when LLM_PROVIDER not set', () => {
      const env = {};
      const config = LLMConfig.fromEnvironment(env);
      expect(config).toBe(null);
    });

    it('should create config from environment', () => {
      const env = {
        LLM_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-test123',
        OPENAI_MODEL: 'gpt-4'
      };

      const config = LLMConfig.fromEnvironment(env);
      expect(config.provider).toBe('openai');
      expect(config.apiKey).toBe('sk-test123');
      expect(config.model).toBe('gpt-4');
    });
  });

  describe('isEnabled', () => {
    it('should return false when not configured', () => {
      const env = {};
      expect(LLMConfig.isEnabled(env)).toBe(false);
    });

    it('should return true when configured and enabled', () => {
      const env = {
        LLM_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-test123',
        LLM_ENABLED: 'true'
      };
      expect(LLMConfig.isEnabled(env)).toBe(true);
    });

    it('should return false when configured but disabled', () => {
      const env = {
        LLM_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-test123',
        LLM_ENABLED: 'false'
      };
      expect(LLMConfig.isEnabled(env)).toBe(false);
    });
  });

  describe('getProvider', () => {
    it('should return null when not configured', () => {
      const env = {};
      expect(LLMConfig.getProvider(env)).toBe(null);
    });

    it('should return provider name when configured', () => {
      const env = {
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'ant-test123'
      };
      expect(LLMConfig.getProvider(env)).toBe('anthropic');
    });
  });

  describe('validate', () => {
    it('should return not configured when LLM not set up', () => {
      const env = {};
      const result = LLMConfig.validate(env);
      
      expect(result.success).toBe(false);
      expect(result.configured).toBe(false);
      expect(result.message).toContain('LLM not configured');
    });

    it('should return success for valid configuration', () => {
      const env = {
        LLM_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-test123',
        OPENAI_MODEL: 'gpt-4'
      };
      
      const result = LLMConfig.validate(env);
      
      expect(result.success).toBe(true);
      expect(result.configured).toBe(true);
      expect(result.provider).toBe('openai');
      expect(result.model).toBe('gpt-4');
    });

    it('should return error for invalid configuration', () => {
      const env = {
        LLM_PROVIDER: 'openai'
        // Missing API key
      };
      
      const result = LLMConfig.validate(env);
      
      expect(result.success).toBe(false);
      expect(result.configured).toBe(true);
      expect(result.message).toContain('configuration error');
    });
  });
});