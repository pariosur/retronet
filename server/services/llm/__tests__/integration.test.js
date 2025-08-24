import { describe, it, expect } from 'vitest';
import { LLMServiceFactory } from '../LLMServiceFactory.js';
import { OpenAIProvider } from '../OpenAIProvider.js';
import { AnthropicProvider } from '../AnthropicProvider.js';
import '../index.js'; // This imports and registers providers

describe('LLM Integration Tests', () => {
  describe('Provider Registration', () => {
    it('should have OpenAI provider registered', () => {
      const providers = LLMServiceFactory.getAvailableProviders();
      expect(providers).toContain('openai');
    });

    it('should have Anthropic provider registered', () => {
      const providers = LLMServiceFactory.getAvailableProviders();
      expect(providers).toContain('anthropic');
    });

    it('should create OpenAI provider instance', () => {
      const config = {
        provider: 'openai',
        apiKey: 'sk-test123456789012345678901234567890123456789012345678',
        model: 'gpt-3.5-turbo'
      };

      const provider = LLMServiceFactory.createProvider(config);
      expect(provider).toBeInstanceOf(OpenAIProvider);
      expect(provider.getProviderName()).toBe('openai');
      expect(provider.getModel()).toBe('gpt-3.5-turbo');
    });

    it('should validate OpenAI configuration', () => {
      const validConfig = {
        provider: 'openai',
        apiKey: 'sk-test123456789012345678901234567890123456789012345678',
        model: 'gpt-3.5-turbo'
      };

      expect(() => {
        LLMServiceFactory.validateConfig(validConfig);
      }).not.toThrow();
    });

    it('should reject invalid OpenAI configuration', () => {
      const invalidConfig = {
        provider: 'openai',
        apiKey: 'invalid-key',
        model: 'gpt-3.5-turbo'
      };

      expect(() => {
        LLMServiceFactory.createProvider(invalidConfig);
      }).toThrow('Valid OpenAI API key is required');
    });

    it('should create Anthropic provider instance', () => {
      const config = {
        provider: 'anthropic',
        apiKey: 'sk-ant-test123456789012345678901234567890123456789012345678',
        model: 'claude-3-sonnet-20240229'
      };

      const provider = LLMServiceFactory.createProvider(config);
      expect(provider).toBeInstanceOf(AnthropicProvider);
      expect(provider.getProviderName()).toBe('anthropic');
      expect(provider.getModel()).toBe('claude-3-sonnet-20240229');
    });

    it('should validate Anthropic configuration', () => {
      const validConfig = {
        provider: 'anthropic',
        apiKey: 'sk-ant-test123456789012345678901234567890123456789012345678',
        model: 'claude-3-sonnet-20240229'
      };

      expect(() => {
        LLMServiceFactory.validateConfig(validConfig);
      }).not.toThrow();
    });

    it('should reject invalid Anthropic configuration', () => {
      const invalidConfig = {
        provider: 'anthropic',
        apiKey: 'invalid-key',
        model: 'claude-3-sonnet-20240229'
      };

      expect(() => {
        LLMServiceFactory.createProvider(invalidConfig);
      }).toThrow('Valid Anthropic API key is required');
    });
  });

  describe('Environment Configuration', () => {
    it('should create OpenAI config from environment variables', () => {
      const env = {
        LLM_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-test123456789012345678901234567890123456789012345678',
        OPENAI_MODEL: 'gpt-4',
        LLM_ENABLED: 'true',
        LLM_PRIVACY_MODE: 'false',
        LLM_TIMEOUT: '45000',
        LLM_MAX_TOKENS: '8000',
        LLM_TEMPERATURE: '0.5'
      };

      const config = LLMServiceFactory.createConfigFromEnv(env);
      
      expect(config).toMatchObject({
        provider: 'openai',
        apiKey: 'sk-test123456789012345678901234567890123456789012345678',
        model: 'gpt-4',
        enabled: true,
        privacyMode: false,
        timeout: 45000,
        maxTokens: 8000,
        temperature: 0.5
      });
    });

    it('should use default OpenAI model when not specified', () => {
      const env = {
        LLM_PROVIDER: 'openai',
        OPENAI_API_KEY: 'sk-test123456789012345678901234567890123456789012345678'
      };

      const config = LLMServiceFactory.createConfigFromEnv(env);
      expect(config.model).toBe('gpt-3.5-turbo');
    });

    it('should create Anthropic config from environment variables', () => {
      const env = {
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'sk-ant-test123456789012345678901234567890123456789012345678',
        ANTHROPIC_MODEL: 'claude-3-opus-20240229',
        LLM_ENABLED: 'true',
        LLM_PRIVACY_MODE: 'false',
        LLM_TIMEOUT: '45000',
        LLM_MAX_TOKENS: '8000',
        LLM_TEMPERATURE: '0.5'
      };

      const config = LLMServiceFactory.createConfigFromEnv(env);
      
      expect(config).toMatchObject({
        provider: 'anthropic',
        apiKey: 'sk-ant-test123456789012345678901234567890123456789012345678',
        model: 'claude-3-opus-20240229',
        enabled: true,
        privacyMode: false,
        timeout: 45000,
        maxTokens: 8000,
        temperature: 0.5
      });
    });

    it('should use default Anthropic model when not specified', () => {
      const env = {
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'sk-ant-test123456789012345678901234567890123456789012345678'
      };

      const config = LLMServiceFactory.createConfigFromEnv(env);
      expect(config.model).toBe('claude-3-sonnet-20240229');
    });
  });
});