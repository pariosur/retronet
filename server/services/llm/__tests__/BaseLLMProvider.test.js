import { describe, it, expect, beforeEach } from 'vitest';
import { BaseLLMProvider } from '../BaseLLMProvider.js';

// Mock implementation for testing
class MockLLMProvider extends BaseLLMProvider {
  async generateInsights(teamData, context) {
    return {
      wentWell: ['Mock insight'],
      didntGoWell: ['Mock issue'],
      actionItems: ['Mock action']
    };
  }

  async validateConnection() {
    return true;
  }
}

describe('BaseLLMProvider', () => {
  let provider;
  let config;

  beforeEach(() => {
    config = {
      provider: 'mock',
      apiKey: 'test-key',
      model: 'test-model'
    };
  });

  describe('constructor and validation', () => {
    it('should create provider with valid config', () => {
      provider = new MockLLMProvider(config);
      expect(provider.config).toEqual(config);
    });

    it('should throw error with no config', () => {
      expect(() => new MockLLMProvider()).toThrow('LLM provider configuration is required');
    });

    it('should throw error with no API key for external providers', () => {
      const invalidConfig = { provider: 'openai' };
      expect(() => new MockLLMProvider(invalidConfig)).toThrow('API key is required for external LLM providers');
    });

    it('should allow local provider without API key', () => {
      const localConfig = { provider: 'local', model: 'llama2' };
      expect(() => new MockLLMProvider(localConfig)).not.toThrow();
    });
  });

  describe('abstract methods', () => {
    beforeEach(() => {
      provider = new BaseLLMProvider(config);
    });

    it('should throw error for generateInsights if not implemented', async () => {
      await expect(provider.generateInsights({}, {})).rejects.toThrow('generateInsights method must be implemented by provider');
    });

    it('should throw error for validateConnection if not implemented', async () => {
      await expect(provider.validateConnection()).rejects.toThrow('validateConnection method must be implemented by provider');
    });
  });

  describe('data sanitization', () => {
    beforeEach(() => {
      provider = new MockLLMProvider(config);
    });

    it('should sanitize email addresses', () => {
      const data = {
        message: 'Contact john.doe@example.com for details',
        author: 'jane.smith@company.org'
      };
      
      const sanitized = provider.sanitizeData(data);
      
      expect(sanitized.message).toBe('Contact [EMAIL] for details');
      expect(sanitized.author).toBe('[EMAIL]');
    });

    it('should sanitize API keys', () => {
      const data = {
        token: 'sk-1234567890abcdef1234567890abcdef12345678901234567890',
        githubToken: 'ghp_1234567890abcdef1234567890abcdef123456',
        slackToken: 'xoxb-1234567890-1234567890-abcdefghijklmnop',
        genericKey: '1234567890abcdef1234567890abcdef12'
      };
      
      const sanitized = provider.sanitizeData(data);
      
      expect(sanitized.token).toBe('[API_KEY]');
      expect(sanitized.githubToken).toBe('[GITHUB_TOKEN]');
      expect(sanitized.slackToken).toBe('[SLACK_TOKEN]');
      expect(sanitized.genericKey).toBe('[API_KEY]');
    });

    it('should handle nested objects', () => {
      const data = {
        user: {
          email: 'test@example.com',
          profile: {
            contact: 'admin@company.com'
          }
        },
        messages: [
          { text: 'Email me at support@help.com' },
          { text: 'Regular message' }
        ]
      };
      
      const sanitized = provider.sanitizeData(data);
      
      expect(sanitized.user.email).toBe('[EMAIL]');
      expect(sanitized.user.profile.contact).toBe('[EMAIL]');
      expect(sanitized.messages[0].text).toBe('Email me at [EMAIL]');
      expect(sanitized.messages[1].text).toBe('Regular message');
    });

    it('should handle null and undefined data', () => {
      expect(provider.sanitizeData(null)).toBe(null);
      expect(provider.sanitizeData(undefined)).toBe(undefined);
      expect(provider.sanitizeData('')).toBe('');
    });

    it('should not mutate original data', () => {
      const originalData = {
        email: 'test@example.com',
        message: 'Contact admin@company.com'
      };
      const originalCopy = JSON.parse(JSON.stringify(originalData));
      
      provider.sanitizeData(originalData);
      
      expect(originalData).toEqual(originalCopy);
    });
  });

  describe('utility methods', () => {
    beforeEach(() => {
      provider = new MockLLMProvider(config);
    });

    it('should return provider name', () => {
      expect(provider.getProviderName()).toBe('mock');
    });

    it('should return model name', () => {
      expect(provider.getModel()).toBe('test-model');
    });

    it('should return default values when not configured', () => {
      const minimalConfig = { provider: 'local' }; // Use local to avoid API key requirement
      const minimalProvider = new MockLLMProvider(minimalConfig);
      
      expect(minimalProvider.getModel()).toBe('default');
    });

    it('should check availability', async () => {
      const available = await provider.isAvailable();
      expect(available).toBe(true);
    });

    it('should handle availability check errors', async () => {
      class FailingProvider extends BaseLLMProvider {
        async validateConnection() {
          throw new Error('Connection failed');
        }
      }
      
      const failingProvider = new FailingProvider(config);
      const available = await failingProvider.isAvailable();
      expect(available).toBe(false);
    });
  });
});