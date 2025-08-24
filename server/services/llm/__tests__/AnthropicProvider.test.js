import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AnthropicProvider } from '../AnthropicProvider.js';

// Mock the Anthropic module
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn()
      }
    }))
  };
});

describe('AnthropicProvider', () => {
  let provider;
  let mockAnthropic;
  let mockConfig;

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();
    
    mockConfig = {
      provider: 'anthropic',
      apiKey: 'sk-ant-test123456789012345678901234567890123456789012345678',
      model: 'claude-3-sonnet-20240229',
      timeout: 30000,
      maxTokens: 4000,
      temperature: 0.7,
      retryAttempts: 3,
      retryDelay: 1000
    };

    // Get the mocked Anthropic constructor
    const Anthropic = await import('@anthropic-ai/sdk');
    mockAnthropic = {
      messages: {
        create: vi.fn()
      }
    };
    Anthropic.default.mockReturnValue(mockAnthropic);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor and Configuration', () => {
    it('should create provider with valid config', () => {
      expect(() => {
        provider = new AnthropicProvider(mockConfig);
      }).not.toThrow();
    });

    it('should throw error for invalid API key', () => {
      const invalidConfig = { ...mockConfig, apiKey: 'invalid-key' };
      expect(() => {
        new AnthropicProvider(invalidConfig);
      }).toThrow('Valid Anthropic API key is required');
    });  
  it('should throw error for unsupported model', () => {
      const invalidConfig = { ...mockConfig, model: 'unsupported-model' };
      expect(() => {
        new AnthropicProvider(invalidConfig);
      }).toThrow('Unsupported Anthropic model');
    });

    it('should accept supported models', () => {
      const supportedModels = [
        'claude-3-opus-20240229',
        'claude-3-sonnet-20240229',
        'claude-3-haiku-20240307',
        'claude-2.1',
        'claude-2.0',
        'claude-instant-1.2'
      ];

      supportedModels.forEach(model => {
        const config = { ...mockConfig, model };
        expect(() => {
          new AnthropicProvider(config);
        }).not.toThrow();
      });
    });
  });

  describe('validateConnection', () => {
    beforeEach(() => {
      provider = new AnthropicProvider(mockConfig);
    });

    it('should return true for successful connection', async () => {
      mockAnthropic.messages.create.mockResolvedValue({
        content: [{ text: 'test response' }]
      });

      const result = await provider.validateConnection();
      expect(result).toBe(true);
      expect(mockAnthropic.messages.create).toHaveBeenCalledWith({
        model: 'claude-3-sonnet-20240229',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'test' }]
      });
    });

    it('should return false for failed connection', async () => {
      mockAnthropic.messages.create.mockRejectedValue(new Error('API Error'));

      const result = await provider.validateConnection();
      expect(result).toBe(false);
    });

    it('should return false for invalid response', async () => {
      mockAnthropic.messages.create.mockResolvedValue({
        content: []
      });

      const result = await provider.validateConnection();
      expect(result).toBe(false);
    });
  });

  describe('generateInsights', () => {
    beforeEach(() => {
      provider = new AnthropicProvider(mockConfig);
    });

    it('should generate insights successfully', async () => {
      const mockResponse = {
        content: [{
          text: JSON.stringify({
            wentWell: [{
              title: 'Good Code Reviews',
              details: 'Team conducted thorough code reviews',
              confidence: 0.8,
              category: 'process'
            }],
            didntGoWell: [{
              title: 'Long PR Cycle',
              details: 'PRs took too long to merge',
              confidence: 0.7,
              category: 'process'
            }],
            actionItems: [{
              title: 'Improve Review Speed',
              details: 'Set up review time limits',
              confidence: 0.9,
              category: 'process'
            }]
          })
        }],
        usage: { input_tokens: 100, output_tokens: 50 }
      };

      mockAnthropic.messages.create.mockResolvedValue(mockResponse);

      const teamData = {
        github: { commits: [], pullRequests: [] },
        linear: { issues: [] },
        slack: { messages: [] }
      };

      const context = {
        dateRange: { start: '2024-01-01', end: '2024-01-07' },
        teamSize: 5,
        repositories: ['repo1'],
        channels: ['general']
      };

      const result = await provider.generateInsights(teamData, context);

      expect(result).toHaveProperty('wentWell');
      expect(result).toHaveProperty('didntGoWell');
      expect(result).toHaveProperty('actionItems');
      expect(result).toHaveProperty('metadata');

      expect(result.wentWell[0]).toMatchObject({
        title: 'Good Code Reviews',
        source: 'ai',
        llmProvider: 'anthropic',
        model: 'claude-3-sonnet-20240229'
      });

      expect(result.metadata).toMatchObject({
        provider: 'anthropic',
        model: 'claude-3-sonnet-20240229',
        tokensUsed: 150,
        inputTokens: 100,
        outputTokens: 50
      });
    }); 
   it('should handle malformed JSON response', async () => {
      const mockResponse = {
        content: [{
          text: 'Invalid JSON response from AI'
        }],
        usage: { input_tokens: 50, output_tokens: 25 }
      };

      mockAnthropic.messages.create.mockResolvedValue(mockResponse);

      const teamData = { github: {}, linear: {}, slack: {} };
      const context = { dateRange: { start: '2024-01-01', end: '2024-01-07' } };

      const result = await provider.generateInsights(teamData, context);

      expect(result.wentWell).toHaveLength(1);
      expect(result.wentWell[0].title).toBe('AI Analysis Available');
      expect(result.metadata.parseError).toBe(true);
    });

    it('should handle JSON embedded in text response', async () => {
      const mockResponse = {
        content: [{
          text: `Here's the analysis:
          
          {
            "wentWell": [{"title": "Test", "details": "Test details"}],
            "didntGoWell": [],
            "actionItems": []
          }
          
          That's my analysis.`
        }],
        usage: { input_tokens: 100, output_tokens: 50 }
      };

      mockAnthropic.messages.create.mockResolvedValue(mockResponse);

      const teamData = { github: {}, linear: {}, slack: {} };
      const context = { dateRange: { start: '2024-01-01', end: '2024-01-07' } };

      const result = await provider.generateInsights(teamData, context);

      expect(result.wentWell).toHaveLength(1);
      expect(result.wentWell[0].title).toBe('Test');
      expect(result.wentWell[0].llmProvider).toBe('anthropic');
    });

    it('should retry on rate limit errors', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.status = 429;
      rateLimitError.type = 'rate_limit_error';

      const successResponse = {
        content: [{
          text: JSON.stringify({
            wentWell: [],
            didntGoWell: [],
            actionItems: []
          })
        }],
        usage: { input_tokens: 100, output_tokens: 50 }
      };

      mockAnthropic.messages.create
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(successResponse);

      const teamData = { github: {}, linear: {}, slack: {} };
      const context = { dateRange: { start: '2024-01-01', end: '2024-01-07' } };

      const result = await provider.generateInsights(teamData, context);

      expect(mockAnthropic.messages.create).toHaveBeenCalledTimes(2);
      expect(result).toHaveProperty('metadata');
    }); 
   it('should throw error after max retries', async () => {
      const error = new Error('Persistent error');
      error.status = 500;

      mockAnthropic.messages.create.mockRejectedValue(error);

      const teamData = { github: {}, linear: {}, slack: {} };
      const context = { dateRange: { start: '2024-01-01', end: '2024-01-07' } };

      await expect(provider.generateInsights(teamData, context))
        .rejects.toThrow('Failed to generate insights');

      expect(mockAnthropic.messages.create).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should sanitize sensitive data before sending', async () => {
      const mockResponse = {
        content: [{
          text: JSON.stringify({
            wentWell: [],
            didntGoWell: [],
            actionItems: []
          })
        }],
        usage: { input_tokens: 100, output_tokens: 50 }
      };

      mockAnthropic.messages.create.mockResolvedValue(mockResponse);

      const teamData = {
        github: {
          commits: [{
            message: 'Fix bug with API key sk-ant-1234567890abcdef1234567890abcdef1234567890abcdef12',
            author: 'user@example.com'
          }]
        },
        linear: { issues: [] },
        slack: { messages: [] }
      };

      const context = { dateRange: { start: '2024-01-01', end: '2024-01-07' } };

      await provider.generateInsights(teamData, context);

      const callArgs = mockAnthropic.messages.create.mock.calls[0][0];
      const userMessage = callArgs.messages.find(m => m.role === 'user');
      
      expect(userMessage.content).toContain('[API_KEY]');
      expect(userMessage.content).toContain('[EMAIL]');
      expect(userMessage.content).not.toContain('sk-ant-1234567890abcdef1234567890abcdef1234567890abcdef12');
      expect(userMessage.content).not.toContain('user@example.com');
    });

    it('should format prompt correctly for Anthropic', async () => {
      const mockResponse = {
        content: [{
          text: JSON.stringify({
            wentWell: [],
            didntGoWell: [],
            actionItems: []
          })
        }],
        usage: { input_tokens: 100, output_tokens: 50 }
      };

      mockAnthropic.messages.create.mockResolvedValue(mockResponse);

      const teamData = { github: {}, linear: {}, slack: {} };
      const context = { dateRange: { start: '2024-01-01', end: '2024-01-07' } };

      await provider.generateInsights(teamData, context);

      const callArgs = mockAnthropic.messages.create.mock.calls[0][0];
      
      expect(callArgs).toHaveProperty('model');
      expect(callArgs).toHaveProperty('max_tokens');
      expect(callArgs).toHaveProperty('messages');
      expect(callArgs.messages[0].role).toBe('user');
      expect(callArgs.messages[0].content).toContain('System:');
      expect(callArgs.messages[0].content).toContain('Human:');
    });
  });

  describe('Rate Limiting and Retry Logic', () => {
    beforeEach(() => {
      provider = new AnthropicProvider(mockConfig);
    });

    it('should calculate exponential backoff delay', () => {
      const delay1 = provider._calculateRetryDelay(1);
      const delay2 = provider._calculateRetryDelay(2);
      const delay3 = provider._calculateRetryDelay(3);

      expect(delay2).toBeGreaterThan(delay1);
      expect(delay3).toBeGreaterThan(delay2);
      expect(delay3).toBeLessThanOrEqual(30000); // Cap at 30 seconds
    });

    it('should use longer delay for rate limit errors', () => {
      const error = new Error('Rate limit');
      error.status = 429;
      error.type = 'rate_limit_error';

      const delay = provider._calculateRetryDelay(1, error);
      const normalDelay = provider._calculateRetryDelay(1);
      
      expect(delay).toBeGreaterThanOrEqual(normalDelay);
    });

    it('should identify rate limit errors correctly', () => {
      const rateLimitError1 = new Error('Rate limit');
      rateLimitError1.status = 429;

      const rateLimitError2 = new Error('rate limit exceeded');
      rateLimitError2.type = 'rate_limit_error';

      const normalError = new Error('Normal error');
      normalError.status = 400;

      expect(provider._isRateLimitError(rateLimitError1)).toBe(true);
      expect(provider._isRateLimitError(rateLimitError2)).toBe(true);
      expect(provider._isRateLimitError(normalError)).toBe(false);
    });

    it('should identify retryable errors correctly', () => {
      const retryableErrors = [
        { status: 408 },
        { status: 429 },
        { status: 500 },
        { status: 502 },
        { status: 503 },
        { status: 504 },
        { type: 'rate_limit_error' },
        { type: 'api_error' },
        { type: 'overloaded_error' },
        { code: 'ECONNRESET' },
        { code: 'ETIMEDOUT' }
      ];

      const nonRetryableError = { status: 400 };

      retryableErrors.forEach(error => {
        expect(provider._isRetryableError(error)).toBe(true);
      });

      expect(provider._isRetryableError(nonRetryableError)).toBe(false);
    });
  });

  describe('Token Optimization', () => {
    beforeEach(() => {
      provider = new AnthropicProvider(mockConfig);
    });

    it('should estimate token count', () => {
      const text = 'This is a test string with some words';
      const tokens = provider.estimateTokens(text);
      
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBe(Math.ceil(text.length / 3.5));
    });

    it('should optimize data for token limits', () => {
      const largeData = {
        github: {
          commits: Array(1000).fill({ message: 'test commit with some details', date: '2024-01-15T10:00:00Z', author: 'dev1' })
        },
        linear: {
          issues: Array(1000).fill({ title: 'test issue', description: 'test description', updatedAt: '2024-01-15T10:00:00Z' })
        }
      };

      const optimized = provider.optimizeDataForTokens(largeData, 1000);

      expect(optimized.github.commits.length).toBeLessThan(largeData.github.commits.length);
      expect(optimized.linear.issues.length).toBeLessThan(largeData.linear.issues.length);
      expect(optimized.github.commits.length).toBeGreaterThan(0);
      expect(optimized.linear.issues.length).toBeGreaterThan(0);
    });

    it('should not modify data within token limits', () => {
      const smallData = {
        commits: [{ message: 'test' }],
        issues: [{ title: 'test' }]
      };

      const optimized = provider.optimizeDataForTokens(smallData, 10000);

      expect(optimized).toEqual(smallData);
    });
  });

  describe('Provider Information', () => {
    beforeEach(() => {
      provider = new AnthropicProvider(mockConfig);
    });

    it('should return correct provider name', () => {
      expect(provider.getProviderName()).toBe('anthropic');
    });

    it('should return correct model', () => {
      expect(provider.getModel()).toBe('claude-3-sonnet-20240229');
    });

    it('should check availability', async () => {
      mockAnthropic.messages.create.mockResolvedValue({
        content: [{ text: 'test' }]
      });

      const available = await provider.isAvailable();
      expect(available).toBe(true);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      provider = new AnthropicProvider(mockConfig);
    });

    it('should handle empty response gracefully', async () => {
      mockAnthropic.messages.create.mockResolvedValue({});

      const teamData = { github: {}, linear: {}, slack: {} };
      const context = { dateRange: { start: '2024-01-01', end: '2024-01-07' } };

      await expect(provider.generateInsights(teamData, context))
        .rejects.toThrow('Invalid response from Anthropic');
    });

    it('should handle missing content gracefully', async () => {
      mockAnthropic.messages.create.mockResolvedValue({
        content: []
      });

      const teamData = { github: {}, linear: {}, slack: {} };
      const context = { dateRange: { start: '2024-01-01', end: '2024-01-07' } };

      await expect(provider.generateInsights(teamData, context))
        .rejects.toThrow('Invalid response from Anthropic');
    });

    it('should handle empty text content gracefully', async () => {
      mockAnthropic.messages.create.mockResolvedValue({
        content: [{}]
      });

      const teamData = { github: {}, linear: {}, slack: {} };
      const context = { dateRange: { start: '2024-01-01', end: '2024-01-07' } };

      await expect(provider.generateInsights(teamData, context))
        .rejects.toThrow('Empty response from Anthropic');
    });

    it('should handle incomplete JSON structure gracefully', async () => {
      const mockResponse = {
        content: [{
          text: JSON.stringify({
            wentWell: [{ title: 'Test' }]
            // Missing didntGoWell and actionItems
          })
        }]
      };

      mockAnthropic.messages.create.mockResolvedValue(mockResponse);

      const teamData = { github: {}, linear: {}, slack: {} };
      const context = { dateRange: { start: '2024-01-01', end: '2024-01-07' } };

      const result = await provider.generateInsights(teamData, context);
      
      // Should fall back to partial insights extraction
      expect(result.wentWell).toHaveLength(1);
      expect(result.wentWell[0].title).toBe('AI Analysis Available');
      expect(result.metadata.parseError).toBe(true);
    });
  });
});