/**
 * Integration tests for LLMAnalyzer
 * Tests the complete LLM analysis pipeline including data preparation,
 * prompt generation, LLM calling, and response processing
 */

import { vi, describe, test, expect, beforeEach } from 'vitest';
import { LLMAnalyzer } from '../LLMAnalyzer.js';
import { LLMServiceFactory } from '../LLMServiceFactory.js';
import { PromptBuilder } from '../PromptBuilder.js';
import ResponseParser from '../ResponseParser.js';
import DataSanitizer from '../../DataSanitizer.js';

// Mock the dependencies
vi.mock('../LLMServiceFactory.js');
vi.mock('../PromptBuilder.js');
vi.mock('../ResponseParser.js');
vi.mock('../../DataSanitizer.js');

describe('LLMAnalyzer', () => {
  let mockProvider;
  let mockPromptBuilder;
  let mockDataSanitizer;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock LLM provider
    mockProvider = {
      generateInsights: vi.fn(),
      validateConnection: vi.fn(),
      getModel: vi.fn().mockReturnValue('gpt-3.5-turbo')
    };

    // Mock prompt builder
    mockPromptBuilder = {
      generateRetroPrompt: vi.fn(),
      validatePromptSize: vi.fn().mockReturnValue(true),
      getTokenUsage: vi.fn().mockReturnValue({
        total: 1000,
        system: 500,
        user: 500,
        utilization: 0.25
      })
    };

    // Mock data sanitizer
    mockDataSanitizer = {
      sanitizeTeamData: vi.fn(),
      validateSanitization: vi.fn().mockReturnValue({ isClean: true })
    };

    // Setup factory mock
    LLMServiceFactory.createProvider.mockReturnValue(mockProvider);
    
    // Setup constructor mocks
    PromptBuilder.mockImplementation(() => mockPromptBuilder);
    DataSanitizer.mockImplementation(() => mockDataSanitizer);
  });

  describe('Constructor and Initialization', () => {
    test('should initialize with default configuration', () => {
      const analyzer = new LLMAnalyzer();
      
      expect(analyzer.config.timeout).toBe(30000);
      expect(analyzer.config.retryAttempts).toBe(3);
      expect(analyzer.config.privacyLevel).toBe('moderate');
      expect(analyzer.config.enabled).toBe(true);
    });

    test('should initialize with custom configuration', () => {
      const config = {
        provider: 'openai',
        apiKey: 'test-key',
        timeout: 60000,
        retryAttempts: 5,
        privacyLevel: 'strict'
      };

      const analyzer = new LLMAnalyzer(config);
      
      expect(analyzer.config.timeout).toBe(60000);
      expect(analyzer.config.retryAttempts).toBe(5);
      expect(analyzer.config.privacyLevel).toBe('strict');
    });

    test('should initialize components when provider is configured', () => {
      const config = {
        provider: 'openai',
        apiKey: 'test-key',
        enabled: true
      };

      new LLMAnalyzer(config);
      
      expect(LLMServiceFactory.createProvider).toHaveBeenCalledWith(expect.objectContaining(config));
      expect(PromptBuilder).toHaveBeenCalled();
      expect(DataSanitizer).toHaveBeenCalledWith('moderate');
    });

    test('should not initialize components when disabled', () => {
      const config = { enabled: false };
      const analyzer = new LLMAnalyzer(config);
      
      expect(analyzer.provider).toBeNull();
      expect(LLMServiceFactory.createProvider).not.toHaveBeenCalled();
    });

    test('should handle initialization errors gracefully', () => {
      LLMServiceFactory.createProvider.mockImplementation(() => {
        throw new Error('Invalid configuration');
      });

      const config = { provider: 'openai', apiKey: 'invalid' };
      const analyzer = new LLMAnalyzer(config);
      
      expect(analyzer.config.enabled).toBe(false);
      expect(analyzer.provider).toBeNull();
    });
  });

  describe('analyzeTeamData', () => {
    let analyzer;
    let sampleData;

    beforeEach(() => {
      analyzer = new LLMAnalyzer({
        provider: 'openai',
        apiKey: 'test-key',
        enabled: true
      });

      sampleData = {
        github: {
          commits: [
            { commit: { message: 'Fix bug in user auth' }, author: { login: 'dev1' } }
          ],
          pullRequests: [
            { title: 'Add new feature', body: 'Implements user dashboard' }
          ]
        },
        linear: [
          { title: 'Bug fix', description: 'Fixed authentication issue' }
        ],
        slack: [
          { text: 'Great work on the release!', user: 'user1' }
        ]
      };

      // Setup successful mocks
      mockDataSanitizer.sanitizeTeamData.mockReturnValue(sampleData);
      mockPromptBuilder.generateRetroPrompt.mockReturnValue({
        system: 'You are a retro analyst...',
        user: 'Analyze this data...'
      });
      mockProvider.generateInsights.mockResolvedValue(JSON.stringify({
        wentWell: [{ title: 'Good deployment', details: 'Smooth release process' }],
        didntGoWell: [{ title: 'Bug found', details: 'Authentication issue' }],
        actionItems: [{ title: 'Improve testing', details: 'Add more unit tests' }]
      }));
      ResponseParser.parseResponse.mockReturnValue({
        wentWell: [{ title: 'Good deployment', details: 'Smooth release process' }],
        didntGoWell: [{ title: 'Bug found', details: 'Authentication issue' }],
        actionItems: [{ title: 'Improve testing', details: 'Add more unit tests' }]
      });
    });

    test('should return null when LLM is disabled', async () => {
      analyzer.config.enabled = false;
      
      const result = await analyzer.analyzeTeamData(
        sampleData.github,
        sampleData.linear,
        sampleData.slack,
        { start: '2024-01-01', end: '2024-01-07' }
      );
      
      expect(result).toBeNull();
    });

    test('should successfully analyze team data', async () => {
      const dateRange = { start: '2024-01-01', end: '2024-01-07' };
      const context = { teamSize: 5, repositories: ['repo1'] };
      
      const result = await analyzer.analyzeTeamData(
        sampleData.github,
        sampleData.linear,
        sampleData.slack,
        dateRange,
        context
      );
      
      expect(result).toBeDefined();
      expect(result.wentWell).toHaveLength(1);
      expect(result.didntGoWell).toHaveLength(1);
      expect(result.actionItems).toHaveLength(1);
      expect(result.analysisMetadata).toBeDefined();
      expect(result.analysisMetadata.provider).toBe('openai');
    });

    test('should sanitize data before analysis', async () => {
      await analyzer.analyzeTeamData(
        sampleData.github,
        sampleData.linear,
        sampleData.slack,
        { start: '2024-01-01', end: '2024-01-07' }
      );
      
      expect(mockDataSanitizer.sanitizeTeamData).toHaveBeenCalledWith({
        github: sampleData.github,
        linear: { issues: sampleData.linear },
        slack: { messages: sampleData.slack }
      });
    });

    test('should generate prompt with correct context', async () => {
      const dateRange = { start: '2024-01-01', end: '2024-01-07' };
      const context = { teamSize: 5, repositories: ['repo1'], channels: ['general'] };
      
      await analyzer.analyzeTeamData(
        sampleData.github,
        sampleData.linear,
        sampleData.slack,
        dateRange,
        context
      );
      
      expect(mockPromptBuilder.generateRetroPrompt).toHaveBeenCalledWith(
        sampleData,
        expect.objectContaining({
          dateRange,
          teamSize: 5,
          repositories: ['repo1'],
          channels: ['general']
        })
      );
    });

    test('should add metadata to insights', async () => {
      const result = await analyzer.analyzeTeamData(
        sampleData.github,
        sampleData.linear,
        sampleData.slack,
        { start: '2024-01-01', end: '2024-01-07' }
      );
      
      expect(result.wentWell[0]).toMatchObject({
        source: 'ai',
        llmProvider: 'openai',
        llmModel: 'gpt-3.5-turbo',
        confidence: expect.any(Number),
        metadata: expect.objectContaining({
          analysisTime: expect.any(Number),
          tokenUsage: expect.any(Object)
        })
      });
    });

    test('should handle empty data gracefully', async () => {
      const result = await analyzer.analyzeTeamData(
        null,
        [],
        null,
        { start: '2024-01-01', end: '2024-01-07' }
      );
      
      expect(result).toBeDefined();
      expect(mockPromptBuilder.generateRetroPrompt).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object)
      );
    });

    test('should return null on LLM failure', async () => {
      mockProvider.generateInsights.mockRejectedValue(new Error('API Error'));
      
      const result = await analyzer.analyzeTeamData(
        sampleData.github,
        sampleData.linear,
        sampleData.slack,
        { start: '2024-01-01', end: '2024-01-07' }
      );
      
      expect(result).toBeNull();
    });

    test('should handle data sanitization failure', async () => {
      mockDataSanitizer.sanitizeTeamData.mockImplementation(() => {
        throw new Error('Sanitization failed');
      });
      
      const result = await analyzer.analyzeTeamData(
        sampleData.github,
        sampleData.linear,
        sampleData.slack,
        { start: '2024-01-01', end: '2024-01-07' }
      );
      
      // Should still work with original data
      expect(result).toBeDefined();
      expect(mockPromptBuilder.generateRetroPrompt).toHaveBeenCalled();
    });

    test('should handle response parsing failure', async () => {
      ResponseParser.parseResponse.mockImplementation(() => {
        throw new Error('Parsing failed');
      });
      
      const result = await analyzer.analyzeTeamData(
        sampleData.github,
        sampleData.linear,
        sampleData.slack,
        { start: '2024-01-01', end: '2024-01-07' }
      );
      
      expect(result).toBeNull();
    });
  });

  describe('Retry Logic and Timeout Handling', () => {
    let analyzer;

    beforeEach(() => {
      analyzer = new LLMAnalyzer({
        provider: 'openai',
        apiKey: 'test-key',
        timeout: 1000,
        retryAttempts: 3,
        retryDelay: 100
      });

      mockDataSanitizer.sanitizeTeamData.mockReturnValue({});
      mockPromptBuilder.generateRetroPrompt.mockReturnValue({
        system: 'test',
        user: 'test'
      });
    });

    test('should retry on transient failures', async () => {
      mockProvider.generateInsights
        .mockRejectedValueOnce(new Error('Rate limit'))
        .mockRejectedValueOnce(new Error('Temporary error'))
        .mockResolvedValueOnce('{"wentWell":[],"didntGoWell":[],"actionItems":[]}');

      ResponseParser.parseResponse.mockReturnValue({
        wentWell: [],
        didntGoWell: [],
        actionItems: []
      });

      const result = await analyzer.analyzeTeamData(
        {},
        [],
        [],
        { start: '2024-01-01', end: '2024-01-07' }
      );

      expect(mockProvider.generateInsights).toHaveBeenCalledTimes(3);
      expect(result).toBeDefined();
    });

    test('should not retry on non-retryable errors', async () => {
      mockProvider.generateInsights.mockRejectedValue(new Error('Unauthorized'));

      const result = await analyzer.analyzeTeamData(
        {},
        [],
        [],
        { start: '2024-01-01', end: '2024-01-07' }
      );

      expect(mockProvider.generateInsights).toHaveBeenCalledTimes(1);
      expect(result).toBeNull();
    });

    test('should handle timeout', async () => {
      // Mock a long-running request
      mockProvider.generateInsights.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 2000))
      );

      const result = await analyzer.analyzeTeamData(
        {},
        [],
        [],
        { start: '2024-01-01', end: '2024-01-07' }
      );

      expect(result).toBeNull();
    });

    test('should fail after max retry attempts', async () => {
      mockProvider.generateInsights.mockRejectedValue(new Error('Persistent error'));

      const result = await analyzer.analyzeTeamData(
        {},
        [],
        [],
        { start: '2024-01-01', end: '2024-01-07' }
      );

      expect(mockProvider.generateInsights).toHaveBeenCalledTimes(3);
      expect(result).toBeNull();
    });
  });

  describe('testConfiguration', () => {
    test('should return failure when disabled', async () => {
      const analyzer = new LLMAnalyzer({ enabled: false });
      
      const result = await analyzer.testConfiguration();
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('disabled');
    });

    test('should return failure when provider not initialized', async () => {
      const analyzer = new LLMAnalyzer({ enabled: true });
      analyzer.provider = null;
      
      const result = await analyzer.testConfiguration();
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('not initialized');
    });

    test('should test provider connectivity', async () => {
      const analyzer = new LLMAnalyzer({
        provider: 'openai',
        apiKey: 'test-key'
      });

      mockProvider.validateConnection.mockResolvedValue(true);
      mockProvider.generateInsights.mockResolvedValue('{"test": "success"}');
      
      const result = await analyzer.testConfiguration();
      
      expect(mockProvider.validateConnection).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    test('should handle connection failure', async () => {
      const analyzer = new LLMAnalyzer({
        provider: 'openai',
        apiKey: 'test-key'
      });

      mockProvider.validateConnection.mockResolvedValue(false);
      
      const result = await analyzer.testConfiguration();
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('connection failed');
    });

    test('should test with minimal prompt', async () => {
      const analyzer = new LLMAnalyzer({
        provider: 'openai',
        apiKey: 'test-key'
      });

      mockProvider.validateConnection.mockResolvedValue(true);
      mockProvider.generateInsights.mockResolvedValue('{"test": "success"}');
      
      const result = await analyzer.testConfiguration();
      
      expect(mockProvider.generateInsights).toHaveBeenCalledWith(
        expect.stringContaining('test assistant'),
        expect.stringContaining('test JSON')
      );
      expect(result.success).toBe(true);
    });
  });

  describe('Static Factory Methods', () => {
    test('should create from environment variables', () => {
      const env = {
        LLM_PROVIDER: 'openai',
        OPENAI_API_KEY: 'test-key',
        LLM_ENABLED: 'true'
      };

      LLMServiceFactory.createConfigFromEnv.mockReturnValue({
        provider: 'openai',
        apiKey: 'test-key',
        enabled: true
      });

      const analyzer = LLMAnalyzer.fromEnvironment(env);
      
      expect(LLMServiceFactory.createConfigFromEnv).toHaveBeenCalledWith(env);
      expect(analyzer).toBeInstanceOf(LLMAnalyzer);
    });

    test('should create disabled analyzer when no config found', () => {
      LLMServiceFactory.createConfigFromEnv.mockReturnValue(null);

      const analyzer = LLMAnalyzer.fromEnvironment({});
      
      expect(analyzer.config.enabled).toBe(false);
    });

    test('should create with custom config', () => {
      const config = { provider: 'openai', apiKey: 'test' };
      const analyzer = LLMAnalyzer.withConfig(config);
      
      expect(analyzer.config.provider).toBe('openai');
      expect(analyzer.config.apiKey).toBe('test');
    });
  });

  describe('Configuration Management', () => {
    test('should get current status', () => {
      const analyzer = new LLMAnalyzer({
        provider: 'openai',
        apiKey: 'test-key',
        enabled: true
      });

      const status = analyzer.getStatus();
      
      expect(status).toMatchObject({
        enabled: true,
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        privacyLevel: 'moderate',
        initialized: true,
        components: {
          provider: true,
          promptBuilder: true,
          dataSanitizer: true
        }
      });
    });

    test('should update configuration', () => {
      const analyzer = new LLMAnalyzer({ enabled: false });
      
      analyzer.updateConfiguration({
        provider: 'openai',
        apiKey: 'new-key',
        enabled: true
      });
      
      expect(analyzer.config.provider).toBe('openai');
      expect(analyzer.config.apiKey).toBe('new-key');
      expect(analyzer.config.enabled).toBe(true);
    });

    test('should reinitialize components on config update', () => {
      const analyzer = new LLMAnalyzer({ enabled: false });
      
      // Clear previous calls
      vi.clearAllMocks();
      
      analyzer.updateConfiguration({
        provider: 'openai',
        apiKey: 'new-key',
        enabled: true
      });
      
      expect(LLMServiceFactory.createProvider).toHaveBeenCalled();
    });
  });
});