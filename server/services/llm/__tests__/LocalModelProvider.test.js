import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LocalModelProvider } from '../LocalModelProvider.js';

// Mock fetch globally
global.fetch = vi.fn();

describe('LocalModelProvider', () => {
  let provider;
  let mockConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    
    mockConfig = {
      provider: 'local',
      model: 'llama2',
      endpoint: 'http://localhost:11434',
      timeout: 30000,
      maxTokens: 4000,
      temperature: 0.7,
      retryAttempts: 3,
      retryDelay: 2000
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Constructor and Configuration', () => {
    it('should create provider with valid config', () => {
      expect(() => {
        provider = new LocalModelProvider(mockConfig);
      }).not.toThrow();
      
      expect(provider.endpoint).toBe('http://localhost:11434');
      expect(provider.getModel()).toBe('llama2');
    });

    it('should use default endpoint if not provided', () => {
      const configWithoutEndpoint = { ...mockConfig };
      delete configWithoutEndpoint.endpoint;
      
      provider = new LocalModelProvider(configWithoutEndpoint);
      expect(provider.endpoint).toBe('http://localhost:11434');
    });

    it('should throw error for invalid endpoint URL', () => {
      const invalidConfig = { ...mockConfig, endpoint: 'not-a-url' };
      expect(() => {
        new LocalModelProvider(invalidConfig);
      }).toThrow('Invalid endpoint URL for local model provider');
    });

    it('should throw error for non-string model name', () => {
      const invalidConfig = { ...mockConfig, model: 123 };
      expect(() => {
        new LocalModelProvider(invalidConfig);
      }).toThrow('Model name must be a string');
    });

    it('should accept valid endpoint URLs', () => {
      const validEndpoints = [
        'http://localhost:11434',
        'https://my-server.com:8080',
        'http://192.168.1.100:11434'
      ];

      validEndpoints.forEach(endpoint => {
        const config = { ...mockConfig, endpoint };
        expect(() => {
          new LocalModelProvider(config);
        }).not.toThrow();
      });
    });
  });

  describe('validateConnection', () => {
    beforeEach(() => {
      provider = new LocalModelProvider(mockConfig);
    });

    it('should return true for successful connection with available model', async () => {
      // Mock successful /api/tags response
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          models: [
            { name: 'llama2:latest', size: 3825819519 },
            { name: 'codellama:7b', size: 3825819519 }
          ]
        })
      });

      // Mock successful test generation
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          response: 'test response'
        })
      });

      const result = await provider.validateConnection();
      expect(result).toBe(true);
      expect(fetch).toHaveBeenCalledTimes(2);
    });

    it('should return false when service is not running', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      });

      const result = await provider.validateConnection();
      expect(result).toBe(false);
    });

    it('should return false when model is not available', async () => {
      // Mock successful /api/tags response but without the requested model
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          models: [
            { name: 'codellama:7b', size: 3825819519 }
          ]
        })
      });

      const result = await provider.validateConnection();
      expect(result).toBe(false);
    });

    it('should return false on connection error', async () => {
      fetch.mockRejectedValueOnce(new Error('Connection refused'));

      const result = await provider.validateConnection();
      expect(result).toBe(false);
    });

    it('should handle model name with tag correctly', async () => {
      const configWithTag = { ...mockConfig, model: 'llama2:13b' };
      provider = new LocalModelProvider(configWithTag);

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          models: [
            { name: 'llama2:13b', size: 7365960935 }
          ]
        })
      });

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          response: 'test response'
        })
      });

      const result = await provider.validateConnection();
      expect(result).toBe(true);
    });
  });

  describe('discoverModels', () => {
    beforeEach(() => {
      provider = new LocalModelProvider(mockConfig);
    });

    it('should return list of available models', async () => {
      const mockModels = {
        models: [
          {
            name: 'llama2:latest',
            size: 3825819519,
            modified_at: '2024-01-15T10:00:00Z',
            digest: 'sha256:abc123'
          },
          {
            name: 'codellama:7b',
            size: 3825819519,
            modified_at: '2024-01-14T10:00:00Z',
            digest: 'sha256:def456'
          }
        ]
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockModels)
      });

      const models = await provider.discoverModels();
      
      expect(models).toHaveLength(2);
      expect(models[0]).toEqual({
        name: 'llama2:latest',
        size: 3825819519,
        modified: '2024-01-15T10:00:00Z',
        digest: 'sha256:abc123'
      });
    });

    it('should return empty array when no models available', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: [] })
      });

      const models = await provider.discoverModels();
      expect(models).toEqual([]);
    });

    it('should return empty array on service error', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      });

      const models = await provider.discoverModels();
      expect(models).toEqual([]);
    });

    it('should handle malformed response gracefully', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ invalid: 'response' })
      });

      const models = await provider.discoverModels();
      expect(models).toEqual([]);
    });
  });

  describe('isModelAvailable', () => {
    beforeEach(() => {
      provider = new LocalModelProvider(mockConfig);
    });

    it('should return true for available model', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          models: [
            { name: 'llama2:latest', size: 3825819519 }
          ]
        })
      });

      const available = await provider.isModelAvailable('llama2');
      expect(available).toBe(true);
    });

    it('should return true for model with matching prefix', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          models: [
            { name: 'llama2:13b', size: 7365960935 }
          ]
        })
      });

      const available = await provider.isModelAvailable('llama2');
      expect(available).toBe(true);
    });

    it('should return false for unavailable model', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          models: [
            { name: 'codellama:7b', size: 3825819519 }
          ]
        })
      });

      const available = await provider.isModelAvailable('llama2');
      expect(available).toBe(false);
    });

    it('should return false on error', async () => {
      fetch.mockRejectedValueOnce(new Error('Network error'));

      const available = await provider.isModelAvailable('llama2');
      expect(available).toBe(false);
    });
  });

  describe('generateInsights', () => {
    beforeEach(() => {
      provider = new LocalModelProvider(mockConfig);
    });

    it('should generate insights successfully', async () => {
      const mockResponse = {
        response: JSON.stringify({
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
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

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
        llmProvider: 'local',
        model: 'llama2'
      });

      expect(result.metadata).toMatchObject({
        provider: 'local',
        model: 'llama2',
        endpoint: 'http://localhost:11434'
      });
    });

    it('should handle malformed JSON response', async () => {
      const mockResponse = {
        response: 'Invalid JSON response from local model'
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const teamData = { github: {}, linear: {}, slack: {} };
      const context = { dateRange: { start: '2024-01-01', end: '2024-01-07' } };

      const result = await provider.generateInsights(teamData, context);

      expect(result.wentWell).toHaveLength(1);
      expect(result.wentWell[0].title).toBe('Local AI Analysis Available');
      expect(result.metadata.parseError).toBe(true);
    });

    it('should retry on retryable errors', async () => {
      const timeoutError = new Error('Request timeout after 30000ms');
      const successResponse = {
        response: JSON.stringify({
          wentWell: [],
          didntGoWell: [],
          actionItems: []
        })
      };

      fetch
        .mockRejectedValueOnce(timeoutError)
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(successResponse)
        });

      const teamData = { github: {}, linear: {}, slack: {} };
      const context = { dateRange: { start: '2024-01-01', end: '2024-01-07' } };

      const result = await provider.generateInsights(teamData, context);

      expect(fetch).toHaveBeenCalledTimes(2);
      expect(result).toHaveProperty('metadata');
    });

    it('should throw error after max retries', async () => {
      const error = new Error('ECONNREFUSED');

      fetch.mockRejectedValue(error);

      const teamData = { github: {}, linear: {}, slack: {} };
      const context = { dateRange: { start: '2024-01-01', end: '2024-01-07' } };

      await expect(provider.generateInsights(teamData, context))
        .rejects.toThrow('Failed to generate insights');

      expect(fetch).toHaveBeenCalledTimes(3); // Initial + 2 retries
    }, 15000);

    it('should sanitize sensitive data before processing', async () => {
      const mockResponse = {
        response: JSON.stringify({
          wentWell: [],
          didntGoWell: [],
          actionItems: []
        })
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

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

      // Verify the request was made (sanitization happens internally)
      expect(fetch).toHaveBeenCalledTimes(1);
      const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
      
      // The prompt should contain sanitized data
      expect(requestBody.prompt).toContain('[API_KEY]');
      expect(requestBody.prompt).toContain('[EMAIL]');
      expect(requestBody.prompt).not.toContain('sk-1234567890abcdef1234567890abcdef1234567890abcdef12');
      expect(requestBody.prompt).not.toContain('user@example.com');
    });

    it('should handle HTTP error responses', async () => {
      fetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: () => Promise.resolve('Server error details')
      });

      const teamData = { github: {}, linear: {}, slack: {} };
      const context = { dateRange: { start: '2024-01-01', end: '2024-01-07' } };

      await expect(provider.generateInsights(teamData, context))
        .rejects.toThrow('Failed to generate insights');
    });

    it('should handle incomplete JSON structure gracefully', async () => {
      const mockResponse = {
        response: JSON.stringify({
          wentWell: [{ title: 'Test' }]
          // Missing didntGoWell and actionItems
        })
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const teamData = { github: {}, linear: {}, slack: {} };
      const context = { dateRange: { start: '2024-01-01', end: '2024-01-07' } };

      const result = await provider.generateInsights(teamData, context);
      
      // Should fall back to partial insights extraction
      expect(result.wentWell).toHaveLength(1);
      expect(result.wentWell[0].title).toBe('Local AI Analysis Available');
      expect(result.metadata.parseError).toBe(true);
    });
  });

  describe('Service Management', () => {
    beforeEach(() => {
      provider = new LocalModelProvider(mockConfig);
    });

    it('should check if service is running', async () => {
      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ models: [] })
      });

      const running = await provider.isServiceRunning();
      expect(running).toBe(true);
    });

    it('should return false when service is not running', async () => {
      fetch.mockRejectedValueOnce(new Error('Connection refused'));

      const running = await provider.isServiceRunning();
      expect(running).toBe(false);
    });

    it('should get service information', async () => {
      const mockTags = {
        models: [
          { name: 'llama2:latest', size: 3825819519 }
        ]
      };

      const mockVersion = {
        version: '0.1.17'
      };

      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockTags)
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockVersion)
        });

      const info = await provider.getServiceInfo();

      expect(info).toEqual({
        endpoint: 'http://localhost:11434',
        running: true,
        models: [{ name: 'llama2:latest', size: 3825819519 }],
        version: '0.1.17'
      });
    });

    it('should handle service info errors gracefully', async () => {
      fetch.mockRejectedValue(new Error('Network error'));

      const info = await provider.getServiceInfo();

      expect(info).toEqual({
        endpoint: 'http://localhost:11434',
        running: false,
        models: [],
        version: null
      });
    });
  });

  describe('Error Handling and Retry Logic', () => {
    beforeEach(() => {
      provider = new LocalModelProvider(mockConfig);
    });

    it('should calculate exponential backoff delay', () => {
      const delay1 = provider._calculateRetryDelay(1);
      const delay2 = provider._calculateRetryDelay(2);
      const delay3 = provider._calculateRetryDelay(3);

      expect(delay2).toBeGreaterThan(delay1);
      expect(delay3).toBeGreaterThan(delay2);
      expect(delay3).toBeLessThanOrEqual(60000); // Cap at 60 seconds
    });

    it('should identify retryable errors correctly', () => {
      const retryableErrors = [
        new Error('timeout'),
        new Error('ECONNREFUSED'),
        new Error('ECONNRESET'),
        new Error('ETIMEDOUT'),
        new Error('500 Internal Server Error'),
        new Error('502 Bad Gateway'),
        new Error('503 Service Unavailable'),
        new Error('504 Gateway Timeout')
      ];

      const nonRetryableError = new Error('400 Bad Request');

      retryableErrors.forEach(error => {
        expect(provider._isRetryableError(error)).toBe(true);
      });

      expect(provider._isRetryableError(nonRetryableError)).toBe(false);
    });

    it('should handle request timeout correctly', async () => {
      // Mock a slow response that exceeds timeout
      fetch.mockImplementationOnce(() => 
        new Promise((resolve, reject) => {
          setTimeout(() => {
            const error = new Error('Request timeout after 30000ms');
            error.name = 'AbortError';
            reject(error);
          }, 100);
        })
      );

      const teamData = { github: {}, linear: {}, slack: {} };
      const context = { dateRange: { start: '2024-01-01', end: '2024-01-07' } };

      await expect(provider.generateInsights(teamData, context))
        .rejects.toThrow('Failed to generate insights');
    }, 10000);
  });

  describe('Token and Prompt Management', () => {
    beforeEach(() => {
      provider = new LocalModelProvider(mockConfig);
    });

    it('should estimate token count', () => {
      const text = 'This is a test string with some words';
      const tokens = provider.estimateTokens(text);
      
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBe(Math.ceil(text.length / 3.5));
    });

    it('should get prompt usage statistics', () => {
      const mockPrompt = {
        system: 'System prompt',
        user: 'User prompt',
        metadata: {
          estimatedTokens: 100,
          template: 'retro'
        }
      };

      const usage = provider.getPromptUsage(mockPrompt);
      expect(usage).toBeDefined();
    });
  });

  describe('Provider Information', () => {
    beforeEach(() => {
      provider = new LocalModelProvider(mockConfig);
    });

    it('should return correct provider name', () => {
      expect(provider.getProviderName()).toBe('local');
    });

    it('should return correct model', () => {
      expect(provider.getModel()).toBe('llama2');
    });

    it('should return correct endpoint', () => {
      expect(provider.getEndpoint()).toBe('http://localhost:11434');
    });

    it('should check availability', async () => {
      fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            models: [{ name: 'llama2:latest' }]
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            response: 'test'
          })
        });

      const available = await provider.isAvailable();
      expect(available).toBe(true);
    });
  });

  describe('Request Configuration', () => {
    beforeEach(() => {
      provider = new LocalModelProvider(mockConfig);
    });

    it('should make request with correct parameters', async () => {
      const mockResponse = {
        response: JSON.stringify({
          wentWell: [],
          didntGoWell: [],
          actionItems: []
        })
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const teamData = { github: {}, linear: {}, slack: {} };
      const context = { dateRange: { start: '2024-01-01', end: '2024-01-07' } };

      await provider.generateInsights(teamData, context);

      expect(fetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/generate',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: expect.stringContaining('"model":"llama2"'),
          signal: expect.any(AbortSignal)
        })
      );

      const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(requestBody).toMatchObject({
        model: 'llama2',
        stream: false,
        format: 'json',
        options: {
          temperature: 0.7,
          num_predict: 4000,
          top_p: 0.9,
          top_k: 40
        }
      });
    });

    it('should use custom model configuration', async () => {
      const customConfig = {
        ...mockConfig,
        model: 'codellama:13b',
        temperature: 0.5,
        maxTokens: 2000
      };

      provider = new LocalModelProvider(customConfig);

      const mockResponse = {
        response: JSON.stringify({
          wentWell: [],
          didntGoWell: [],
          actionItems: []
        })
      };

      fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse)
      });

      const teamData = { github: {}, linear: {}, slack: {} };
      const context = { dateRange: { start: '2024-01-01', end: '2024-01-07' } };

      await provider.generateInsights(teamData, context);

      const requestBody = JSON.parse(fetch.mock.calls[0][1].body);
      expect(requestBody.model).toBe('codellama:13b');
      expect(requestBody.options.temperature).toBe(0.5);
      expect(requestBody.options.num_predict).toBe(2000);
    });
  });
});