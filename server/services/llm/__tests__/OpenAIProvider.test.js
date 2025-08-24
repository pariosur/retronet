import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenAIProvider } from '../OpenAIProvider.js';

// Mock the OpenAI module
vi.mock('openai', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: vi.fn()
        }
      }
    }))
  };
});

describe('OpenAIProvider', () => {
  let provider;
  let mockOpenAI;
  let mockConfig;

  beforeEach(async () => {
    // Reset mocks
    vi.clearAllMocks();
    
    mockConfig = {
      provider: 'openai',
      apiKey: 'sk-test123456789012345678901234567890123456789012345678',
      model: 'gpt-3.5-turbo',
      timeout: 30000,
      maxTokens: 4000,
      temperature: 0.7,
      retryAttempts: 3,
      retryDelay: 1000
    };

    // Get the mocked OpenAI constructor
    const OpenAI = await import('openai');
    mockOpenAI = {
      chat: {
        completions: {
          create: vi.fn()
        }
      }
    };
    OpenAI.default.mockReturnValue(mockOpenAI);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor and Configuration', () => {
    it('should create provider with valid config', () => {
      expect(() => {
        provider = new OpenAIProvider(mockConfig);
      }).not.toThrow();
    });

    it('should throw error for invalid API key', () => {
      const invalidConfig = { ...mockConfig, apiKey: 'invalid-key' };
      expect(() => {
        new OpenAIProvider(invalidConfig);
      }).toThrow('Valid OpenAI API key is required');
    });

    it('should throw error for unsupported model', () => {
      const invalidConfig = { ...mockConfig, model: 'unsupported-model' };
      expect(() => {
        new OpenAIProvider(invalidConfig);
      }).toThrow('Unsupported OpenAI model');
    });

    it('should accept supported models', () => {
      const supportedModels = [
        'gpt-4',
        'gpt-4-turbo',
        'gpt-4-turbo-preview',
        'gpt-3.5-turbo',
        'gpt-3.5-turbo-16k'
      ];

      supportedModels.forEach(model => {
        const config = { ...mockConfig, model };
        expect(() => {
          new OpenAIProvider(config);
        }).not.toThrow();
      });
    });
  });

  describe('validateConnection', () => {
    beforeEach(() => {
      provider = new OpenAIProvider(mockConfig);
    });

    it('should return true for successful connection', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'test' } }]
      });

      const result = await provider.validateConnection();
      expect(result).toBe(true);
      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledWith({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 1,
        temperature: 0
      });
    });

    it('should return false for failed connection', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API Error'));

      const result = await provider.validateConnection();
      expect(result).toBe(false);
    });

    it('should return false for invalid response', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: []
      });

      const result = await provider.validateConnection();
      expect(result).toBe(false);
    });
  });

  describe('generateInsights', () => {
    beforeEach(() => {
      provider = new OpenAIProvider(mockConfig);
    });

    it('should generate insights successfully', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
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
          }
        }],
        usage: { total_tokens: 150 }
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

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
        llmProvider: 'openai',
        model: 'gpt-3.5-turbo'
      });

      expect(result.metadata).toMatchObject({
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        tokensUsed: 150
      });
    });

    it('should handle malformed JSON response', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: 'Invalid JSON response from AI'
          }
        }],
        usage: { total_tokens: 50 }
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const teamData = { github: {}, linear: {}, slack: {} };
      const context = { dateRange: { start: '2024-01-01', end: '2024-01-07' } };

      const result = await provider.generateInsights(teamData, context);

      expect(result.wentWell).toHaveLength(1);
      expect(result.wentWell[0].title).toBe('AI Analysis Available');
      expect(result.metadata.parseError).toBe(true);
    });

    it('should retry on rate limit errors', async () => {
      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.status = 429;
      rateLimitError.headers = { 'retry-after': '1' };

      const successResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              wentWell: [],
              didntGoWell: [],
              actionItems: []
            })
          }
        }],
        usage: { total_tokens: 100 }
      };

      mockOpenAI.chat.completions.create
        .mockRejectedValueOnce(rateLimitError)
        .mockResolvedValueOnce(successResponse);

      const teamData = { github: {}, linear: {}, slack: {} };
      const context = { dateRange: { start: '2024-01-01', end: '2024-01-07' } };

      const result = await provider.generateInsights(teamData, context);

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(2);
      expect(result).toHaveProperty('metadata');
    });

    it('should throw error after max retries', async () => {
      const error = new Error('Persistent error');
      error.status = 500;

      mockOpenAI.chat.completions.create.mockRejectedValue(error);

      const teamData = { github: {}, linear: {}, slack: {} };
      const context = { dateRange: { start: '2024-01-01', end: '2024-01-07' } };

      await expect(provider.generateInsights(teamData, context))
        .rejects.toThrow('Failed to generate insights');

      expect(mockOpenAI.chat.completions.create).toHaveBeenCalledTimes(3); // Initial + 2 retries
    });

    it('should sanitize sensitive data before sending', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              wentWell: [],
              didntGoWell: [],
              actionItems: []
            })
          }
        }],
        usage: { total_tokens: 100 }
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const teamData = {
        github: {
          commits: [{
            message: 'Fix bug with API key sk-1234567890abcdef1234567890abcdef1234567890abcdef12',
            author: 'user@example.com'
          }]
        },
        linear: { issues: [] },
        slack: { messages: [] }
      };

      const context = { dateRange: { start: '2024-01-01', end: '2024-01-07' } };

      await provider.generateInsights(teamData, context);

      const callArgs = mockOpenAI.chat.completions.create.mock.calls[0][0];
      const userMessage = callArgs.messages.find(m => m.role === 'user');
      
      expect(userMessage.content).toContain('[API_KEY]');
      expect(userMessage.content).toContain('[EMAIL]');
      expect(userMessage.content).not.toContain('sk-1234567890abcdef1234567890abcdef1234567890abcdef12');
      expect(userMessage.content).not.toContain('user@example.com');
    });
  });

  describe('Rate Limiting and Retry Logic', () => {
    beforeEach(() => {
      provider = new OpenAIProvider(mockConfig);
    });

    it('should calculate exponential backoff delay', () => {
      const delay1 = provider._calculateRetryDelay(1);
      const delay2 = provider._calculateRetryDelay(2);
      const delay3 = provider._calculateRetryDelay(3);

      expect(delay2).toBeGreaterThan(delay1);
      expect(delay3).toBeGreaterThan(delay2);
      expect(delay3).toBeLessThanOrEqual(30000); // Cap at 30 seconds
    });

    it('should use retry-after header for rate limit errors', () => {
      const error = new Error('Rate limit');
      error.status = 429;
      error.headers = { 'retry-after': '5' };

      const delay = provider._calculateRetryDelay(1, error);
      expect(delay).toBe(5000); // 5 seconds in milliseconds
    });

    it('should identify rate limit errors correctly', () => {
      const rateLimitError1 = new Error('Rate limit');
      rateLimitError1.status = 429;

      const rateLimitError2 = new Error('rate limit exceeded');
      rateLimitError2.code = 'rate_limit_exceeded';

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
      provider = new OpenAIProvider(mockConfig);
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
      provider = new OpenAIProvider(mockConfig);
    });

    it('should return correct provider name', () => {
      expect(provider.getProviderName()).toBe('openai');
    });

    it('should return correct model', () => {
      expect(provider.getModel()).toBe('gpt-3.5-turbo');
    });

    it('should check availability', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: { content: 'test' } }]
      });

      const available = await provider.isAvailable();
      expect(available).toBe(true);
    });
  });

  describe('Error Handling', () => {
    beforeEach(() => {
      provider = new OpenAIProvider(mockConfig);
    });

    it('should handle empty response gracefully', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({});

      const teamData = { github: {}, linear: {}, slack: {} };
      const context = { dateRange: { start: '2024-01-01', end: '2024-01-07' } };

      await expect(provider.generateInsights(teamData, context))
        .rejects.toThrow('Invalid response from OpenAI');
    });

    it('should handle missing content gracefully', async () => {
      mockOpenAI.chat.completions.create.mockResolvedValue({
        choices: [{ message: {} }]
      });

      const teamData = { github: {}, linear: {}, slack: {} };
      const context = { dateRange: { start: '2024-01-01', end: '2024-01-07' } };

      await expect(provider.generateInsights(teamData, context))
        .rejects.toThrow('Empty response from OpenAI');
    });

    it('should handle incomplete JSON structure gracefully', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              wentWell: [{ title: 'Test' }]
              // Missing didntGoWell and actionItems
            })
          }
        }]
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

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