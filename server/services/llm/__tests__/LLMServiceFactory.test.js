import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LLMServiceFactory } from '../LLMServiceFactory.js';
import { BaseLLMProvider } from '../BaseLLMProvider.js';

// Mock provider for testing
class MockProvider extends BaseLLMProvider {
  async generateInsights(teamData, context) {
    return { insights: 'mock' };
  }

  async validateConnection() {
    return true;
  }
}

class FailingProvider extends BaseLLMProvider {
  async validateConnection() {
    throw new Error('Connection failed');
  }
}

describe('LLMServiceFactory', () => {
  beforeEach(() => {
    // Clear providers before each test
    LLMServiceFactory.providers.clear();
  });

  afterEach(() => {
    // Clean up after tests
    LLMServiceFactory.providers.clear();
  });

  describe('provider registration', () => {
    it('should register a valid provider', () => {
      LLMServiceFactory.registerProvider('mock', MockProvider);
      expect(LLMServiceFactory.hasProvider('mock')).toBe(true);
    });

    it('should throw error for invalid provider name', () => {
      expect(() => LLMServiceFactory.registerProvider('', MockProvider)).toThrow('Provider name must be a non-empty string');
      expect(() => LLMServiceFactory.registerProvider(null, MockProvider)).toThrow('Provider name must be a non-empty string');
    });

    it('should throw error for invalid provider class', () => {
      class InvalidProvider {}
      expect(() => LLMServiceFactory.registerProvider('invalid', InvalidProvider)).toThrow('Provider class must extend BaseLLMProvider');
    });

    it('should handle case-insensitive provider names', () => {
      LLMServiceFactory.registerProvider('Mock', MockProvider);
      expect(LLMServiceFactory.hasProvider('mock')).toBe(true);
      expect(LLMServiceFactory.hasProvider('MOCK')).toBe(true);
    });
  });

  describe('provider creation', () => {
    beforeEach(() => {
      LLMServiceFactory.registerProvider('mock', MockProvider);
    });

    it('should create provider with valid config', () => {
      const config = {
        provider: 'mock',
        apiKey: 'test-key',
        model: 'test-model'
      };

      const provider = LLMServiceFactory.createProvider(config);
      expect(provider).toBeInstanceOf(MockProvider);
      expect(provider.config.provider).toBe('mock');
    });

    it('should merge with default config', () => {
      const config = {
        provider: 'mock',
        apiKey: 'test-key'
      };

      const provider = LLMServiceFactory.createProvider(config);
      expect(provider.config.timeout).toBe(30000);
      expect(provider.config.maxTokens).toBe(4000);
      expect(provider.config.temperature).toBe(0.7);
    });

    it('should throw error for unknown provider', () => {
      const config = {
        provider: 'unknown',
        apiKey: 'test-key'
      };

      expect(() => LLMServiceFactory.createProvider(config)).toThrow('Unknown provider: unknown');
    });
  });

  describe('config validation', () => {
    beforeEach(() => {
      LLMServiceFactory.registerProvider('mock', MockProvider);
      LLMServiceFactory.registerProvider('local', MockProvider);
    });

    it('should validate valid config', () => {
      const config = {
        provider: 'mock',
        apiKey: 'test-key',
        model: 'test-model',
        timeout: 5000,
        maxTokens: 2000,
        temperature: 0.5
      };

      const validated = LLMServiceFactory.validateConfig(config);
      expect(validated.provider).toBe('mock');
      expect(validated.timeout).toBe(5000);
    });

    it('should throw error for missing config', () => {
      expect(() => LLMServiceFactory.validateConfig()).toThrow('LLM configuration must be an object');
      expect(() => LLMServiceFactory.validateConfig(null)).toThrow('LLM configuration must be an object');
    });

    it('should throw error for missing provider', () => {
      expect(() => LLMServiceFactory.validateConfig({})).toThrow('Provider name is required and must be a string');
    });

    it('should throw error for missing API key on external providers', () => {
      const config = { provider: 'mock' };
      expect(() => LLMServiceFactory.validateConfig(config)).toThrow('API key is required for mock provider');
    });

    it('should allow local provider without API key', () => {
      const config = { provider: 'local' };
      expect(() => LLMServiceFactory.validateConfig(config)).not.toThrow();
    });

    it('should validate numeric fields', () => {
      const baseConfig = { provider: 'mock', apiKey: 'test' };

      expect(() => LLMServiceFactory.validateConfig({ ...baseConfig, timeout: -1 })).toThrow('Timeout must be a positive number');
      expect(() => LLMServiceFactory.validateConfig({ ...baseConfig, maxTokens: 0 })).toThrow('Max tokens must be a positive number');
      expect(() => LLMServiceFactory.validateConfig({ ...baseConfig, temperature: -1 })).toThrow('Temperature must be a number between 0 and 2');
      expect(() => LLMServiceFactory.validateConfig({ ...baseConfig, temperature: 3 })).toThrow('Temperature must be a number between 0 and 2');
    });

    it('should set default model for known providers', () => {
      const openaiConfig = { provider: 'openai', apiKey: 'test' };
      LLMServiceFactory.registerProvider('openai', MockProvider);
      
      const openaiValidated = LLMServiceFactory.validateConfig(openaiConfig);
      expect(openaiValidated.model).toBe('gpt-3.5-turbo');

      const localConfig = { provider: 'local' };
      LLMServiceFactory.registerProvider('local', MockProvider);
      
      const localValidated = LLMServiceFactory.validateConfig(localConfig);
      expect(localValidated.model).toBe('llama2');
    });
  });

  describe('environment configuration', () => {
    it('should return null when LLM_PROVIDER not set', () => {
      const env = {};
      const config = LLMServiceFactory.createConfigFromEnv(env);
      expect(config).toBe(null);
    });

    it('should create OpenAI config from env', () => {
      const env = {
        LLM_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-test123',
        OPENAI_MODEL: 'gpt-4',
        LLM_TIMEOUT: '5000',
        LLM_MAX_TOKENS: '2000',
        LLM_TEMPERATURE: '0.5'
      };

      const config = LLMServiceFactory.createConfigFromEnv(env);
      expect(config.provider).toBe('openai');
      expect(config.apiKey).toBe('sk-test123');
      expect(config.model).toBe('gpt-4');
      expect(config.timeout).toBe(5000);
      expect(config.maxTokens).toBe(2000);
      expect(config.temperature).toBe(0.5);
    });

    it('should create Anthropic config from env', () => {
      const env = {
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'ant-test123',
        ANTHROPIC_MODEL: 'claude-3-opus'
      };

      const config = LLMServiceFactory.createConfigFromEnv(env);
      expect(config.provider).toBe('anthropic');
      expect(config.apiKey).toBe('ant-test123');
      expect(config.model).toBe('claude-3-opus');
    });

    it('should create local config from env', () => {
      const env = {
        LLM_PROVIDER: 'local',
        LOCAL_MODEL: 'llama2-7b',
        LOCAL_LLM_ENDPOINT: 'http://localhost:8080'
      };

      const config = LLMServiceFactory.createConfigFromEnv(env);
      expect(config.provider).toBe('local');
      expect(config.model).toBe('llama2-7b');
      expect(config.endpoint).toBe('http://localhost:8080');
    });

    it('should handle privacy and enabled flags', () => {
      const env = {
        LLM_PROVIDER: 'openai',
        OPENAI_API_KEY: 'test',
        LLM_ENABLED: 'false',
        LLM_PRIVACY_MODE: 'true'
      };

      const config = LLMServiceFactory.createConfigFromEnv(env);
      expect(config.enabled).toBe(false);
      expect(config.privacyMode).toBe(true);
    });
  });

  describe('provider testing', () => {
    beforeEach(() => {
      LLMServiceFactory.registerProvider('mock', MockProvider);
      LLMServiceFactory.registerProvider('failing', FailingProvider);
    });

    it('should test successful provider', async () => {
      const config = {
        provider: 'mock',
        apiKey: 'test-key'
      };

      const result = await LLMServiceFactory.testProvider(config);
      expect(result.success).toBe(true);
      expect(result.provider).toBe('mock');
      expect(result.message).toBe('Connection successful');
    });

    it('should test failing provider', async () => {
      const config = {
        provider: 'failing',
        apiKey: 'test-key'
      };

      const result = await LLMServiceFactory.testProvider(config);
      expect(result.success).toBe(false);
      expect(result.provider).toBe('failing');
      expect(result.message).toBe('Connection failed');
    });

    it('should handle configuration errors', async () => {
      const config = {
        provider: 'unknown',
        apiKey: 'test-key'
      };

      const result = await LLMServiceFactory.testProvider(config);
      expect(result.success).toBe(false);
      expect(result.provider).toBe('unknown');
      expect(result.message).toContain('Configuration error');
    });
  });

  describe('utility methods', () => {
    beforeEach(() => {
      LLMServiceFactory.registerProvider('mock1', MockProvider);
      LLMServiceFactory.registerProvider('mock2', MockProvider);
    });

    it('should get available providers', () => {
      const providers = LLMServiceFactory.getAvailableProviders();
      expect(providers).toContain('mock1');
      expect(providers).toContain('mock2');
      expect(providers).toHaveLength(2);
    });

    it('should check if provider exists', () => {
      expect(LLMServiceFactory.hasProvider('mock1')).toBe(true);
      expect(LLMServiceFactory.hasProvider('nonexistent')).toBe(false);
    });
  });
});