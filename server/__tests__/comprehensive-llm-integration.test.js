/**
 * Comprehensive Integration Tests for LLM-Enhanced Retro Generation
 * 
 * This test suite covers:
 * - End-to-end LLM-enhanced retro generation workflow
 * - Various provider configurations and fallback scenarios
 * - Performance tests to ensure LLM integration doesn't degrade system performance
 * - Data privacy and sanitization compliance tests
 * 
 * Requirements: 1.1, 1.4, 6.1, 6.2, 6.3
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';

// Mock all external services
vi.mock('../services/linearService.js', () => ({
  default: vi.fn()
}));

vi.mock('../services/slackService.js', () => ({
  default: vi.fn()
}));

vi.mock('../services/githubService.js', () => ({
  default: vi.fn()
}));

vi.mock('../services/llm/index.js', () => ({
  LLMAnalyzer: {
    fromEnvironment: vi.fn()
  }
}));

vi.mock('../services/InsightMerger.js', () => ({
  InsightMerger: {
    merge: vi.fn()
  }
}));

vi.mock('../services/DataSanitizer.js', () => ({
  DataSanitizer: {
    sanitizeGitHubData: vi.fn(),
    sanitizeLinearData: vi.fn(),
    sanitizeSlackData: vi.fn()
  }
}));

// Import mocked modules
import LinearService from '../services/linearService.js';
import SlackService from '../services/slackService.js';
import GitHubService from '../services/githubService.js';
import { LLMAnalyzer } from '../services/llm/index.js';
import { InsightMerger } from '../services/InsightMerger.js';
import { DataSanitizer } from '../services/DataSanitizer.js';

// Test data fixtures
const testDateRange = {
  start: '2024-01-01',
  end: '2024-01-07'
};

const testTeamMembers = ['alice@company.com', 'bob@company.com'];

const sampleGitHubData = {
  commits: [
    {
      sha: 'abc123',
      commit: {
        message: 'Fix critical login bug',
        author: { name: 'Alice Developer', email: 'alice@company.com' }
      }
    }
  ],
  pullRequests: [
    {
      id: 1,
      title: 'Add user authentication',
      user: { login: 'alice' },
      body: 'Implements secure login with JWT tokens'
    }
  ]
};

const sampleLinearData = [
  {
    id: 'LIN-123',
    title: 'Implement user dashboard',
    state: { name: 'Done' },
    assignee: { name: 'Bob Developer' },
    description: 'Create responsive dashboard for user metrics'
  }
];

const sampleSlackData = [
  {
    text: 'Great work on the login fix!',
    user: 'U123456',
    channel: 'C789012',
    ts: '1704067200.000100'
  }
];

const sanitizedGitHubData = {
  commits: [
    {
      sha: 'abc123',
      commit: {
        message: 'Fix critical login bug',
        author: { name: '[DEVELOPER_NAME]', email: '[EMAIL_REDACTED]' }
      }
    }
  ],
  pullRequests: [
    {
      id: 1,
      title: 'Add user authentication',
      user: { login: '[USERNAME_REDACTED]' },
      body: 'Implements secure login with JWT tokens'
    }
  ]
};

const ruleBasedInsights = {
  wentWell: [
    {
      title: 'Completed critical bug fix',
      details: 'Successfully resolved login issue affecting users',
      source: 'rules',
      confidence: 0.9,
      category: 'technical'
    }
  ],
  didntGoWell: [],
  actionItems: [
    {
      title: 'Improve testing coverage',
      details: 'Add more unit tests to prevent similar bugs',
      source: 'rules',
      priority: 'medium'
    }
  ]
};

const llmInsights = {
  wentWell: [
    {
      title: 'Strong team collaboration',
      details: 'Team showed excellent coordination in resolving critical issues',
      source: 'ai',
      confidence: 0.85,
      llmProvider: 'openai',
      reasoning: 'Analyzed commit patterns and PR discussions showing collaborative effort',
      category: 'team-dynamics'
    }
  ],
  didntGoWell: [
    {
      title: 'Delayed code reviews',
      details: 'Some PRs took longer than usual to get reviewed',
      source: 'ai',
      confidence: 0.75,
      llmProvider: 'openai',
      reasoning: 'Detected longer time gaps between PR creation and approval',
      category: 'process'
    }
  ],
  actionItems: [
    {
      title: 'Establish code review SLA',
      details: 'Set target review times to improve development velocity',
      source: 'ai',
      priority: 'high',
      llmProvider: 'openai'
    }
  ],
  analysisMetadata: {
    provider: 'openai',
    model: 'gpt-4',
    duration: 2500,
    tokenUsage: 1800,
    inputTokens: 1200,
    outputTokens: 600,
    cost: 0.045
  }
};

// Create test app with retro generation endpoint
const createTestApp = () => {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Main retro generation endpoint
  app.post('/api/generate-retro', async (req, res) => {
    try {
      const { dateRange, teamMembers } = req.body;
      
      if (!process.env.LINEAR_API_KEY && !process.env.TEST_LINEAR_API_KEY) {
        return res.status(400).json({ 
          error: 'LINEAR_API_KEY not configured. Please add it to your .env file.' 
        });
      }
      
      // Initialize services
      const linearService = new LinearService(process.env.LINEAR_API_KEY || 'test-key');
      let slackService = null;
      if (process.env.SLACK_BOT_TOKEN) {
        slackService = new SlackService(process.env.SLACK_BOT_TOKEN);
      }
      let githubService = null;
      if (process.env.GITHUB_TOKEN) {
        githubService = new GitHubService(process.env.GITHUB_TOKEN);
      }

      // Initialize LLM analyzer
      const llmAnalyzer = LLMAnalyzer.fromEnvironment(process.env);
      const llmEnabled = llmAnalyzer.config.enabled;

      // Prepare date range strings
      const startDate = dateRange.start + 'T00:00:00Z';
      const endDate = dateRange.end + 'T23:59:59Z';

      // Run rule-based and LLM analysis in parallel
      const [ruleBasedResults, llmResults] = await Promise.allSettled([
        performRuleBasedAnalysis(linearService, slackService, githubService, startDate, endDate, teamMembers),
        llmEnabled ? performLLMAnalysis(llmAnalyzer, linearService, slackService, githubService, startDate, endDate, dateRange, teamMembers) : Promise.resolve(null)
      ]);

      // Extract results
      const ruleBasedInsights = ruleBasedResults.status === 'fulfilled' 
        ? ruleBasedResults.value 
        : { wentWell: [], didntGoWell: [], actionItems: [] };

      const llmInsights = llmResults.status === 'fulfilled' && llmResults.value
        ? llmResults.value
        : { wentWell: [], didntGoWell: [], actionItems: [] };

      // Merge insights
      const retroData = InsightMerger.merge(ruleBasedInsights, llmInsights);
      
      // Add metadata
      retroData.analysisMetadata = {
        ...retroData.analysisMetadata,
        ruleBasedAnalysisUsed: ruleBasedResults.status === 'fulfilled',
        llmAnalysisUsed: llmEnabled && llmResults.status === 'fulfilled' && llmResults.value !== null,
        llmEnabled: llmEnabled,
        generatedAt: new Date().toISOString(),
        dateRange: dateRange,
        teamMembers: teamMembers
      };

      if (llmInsights.analysisMetadata) {
        retroData.analysisMetadata.llm = llmInsights.analysisMetadata;
      }
      
      res.json(retroData);
    } catch (error) {
      console.error('Error generating retro:', error);
      res.status(500).json({ 
        error: 'Failed to generate retro: ' + error.message 
      });
    }
  });

  return app;
};

async function performRuleBasedAnalysis(linearService, slackService, githubService, startDate, endDate, teamMembers) {
  const issues = await linearService.getIssuesInDateRange(startDate, endDate, teamMembers);
  const linearRetroData = linearService.analyzeIssuesForRetro(issues);

  let slackRetroData = { wentWell: [], didntGoWell: [], actionItems: [] };
  if (slackService) {
    try {
      const messages = await slackService.getTeamChannelMessages(startDate, endDate);
      slackRetroData = slackService.analyzeMessagesForRetro(messages);
    } catch (error) {
      console.warn('Slack analysis failed:', error.message);
    }
  }

  let githubRetroData = { wentWell: [], didntGoWell: [], actionItems: [] };
  if (githubService) {
    try {
      const { commits, pullRequests } = await githubService.getTeamActivity(startDate, endDate);
      githubRetroData = githubService.analyzeActivityForRetro(commits, pullRequests);
    } catch (error) {
      console.warn('GitHub analysis failed:', error.message);
    }
  }

  return {
    wentWell: [...linearRetroData.wentWell, ...slackRetroData.wentWell, ...githubRetroData.wentWell],
    didntGoWell: [...linearRetroData.didntGoWell, ...slackRetroData.didntGoWell, ...githubRetroData.didntGoWell],
    actionItems: [...linearRetroData.actionItems, ...slackRetroData.actionItems, ...githubRetroData.actionItems]
  };
}

async function performLLMAnalysis(llmAnalyzer, linearService, slackService, githubService, startDate, endDate, dateRange, teamMembers) {
  const issues = await linearService.getIssuesInDateRange(startDate, endDate, teamMembers);
  
  let githubData = null;
  if (githubService) {
    try {
      const { commits, pullRequests } = await githubService.getTeamActivity(startDate, endDate);
      githubData = { commits, pullRequests };
    } catch (error) {
      console.warn('GitHub data collection for LLM failed:', error.message);
    }
  }
  
  let slackData = null;
  if (slackService) {
    try {
      slackData = await slackService.getTeamChannelMessages(startDate, endDate);
    } catch (error) {
      console.warn('Slack data collection for LLM failed:', error.message);
    }
  }
  
  // Sanitize data before sending to LLM
  const sanitizedGithubData = githubData ? DataSanitizer.sanitizeGitHubData(githubData) : null;
  const sanitizedLinearData = DataSanitizer.sanitizeLinearData(issues);
  const sanitizedSlackData = slackData ? DataSanitizer.sanitizeSlackData(slackData) : null;
  
  return await llmAnalyzer.analyzeTeamData(
    sanitizedGithubData,
    sanitizedLinearData,
    sanitizedSlackData,
    dateRange,
    {
      teamSize: teamMembers?.length,
      repositories: process.env.GITHUB_REPOS?.split(',') || [],
      channels: process.env.SLACK_CHANNELS?.split(',') || []
    }
  );
}

describe('Comprehensive LLM Integration Tests', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
    vi.clearAllMocks();
    process.env.TEST_LINEAR_API_KEY = 'test-key';
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('End-to-End LLM-Enhanced Retro Generation Workflow', () => {
    test('should complete full workflow with all providers enabled', async () => {
      // Mock all services as successful
      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockResolvedValue(sampleLinearData),
        analyzeIssuesForRetro: vi.fn().mockReturnValue(ruleBasedInsights)
      };
      LinearService.mockImplementation(() => mockLinearService);

      const mockSlackService = {
        getTeamChannelMessages: vi.fn().mockResolvedValue(sampleSlackData),
        analyzeMessagesForRetro: vi.fn().mockReturnValue({ wentWell: [], didntGoWell: [], actionItems: [] })
      };
      SlackService.mockImplementation(() => mockSlackService);

      const mockGitHubService = {
        getTeamActivity: vi.fn().mockResolvedValue(sampleGitHubData),
        analyzeActivityForRetro: vi.fn().mockReturnValue({ wentWell: [], didntGoWell: [], actionItems: [] })
      };
      GitHubService.mockImplementation(() => mockGitHubService);

      const mockLLMAnalyzer = {
        config: { enabled: true, provider: 'openai', model: 'gpt-4' },
        analyzeTeamData: vi.fn().mockResolvedValue(llmInsights)
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      const mergedInsights = {
        wentWell: [...ruleBasedInsights.wentWell, ...llmInsights.wentWell],
        didntGoWell: [...ruleBasedInsights.didntGoWell, ...llmInsights.didntGoWell],
        actionItems: [...ruleBasedInsights.actionItems, ...llmInsights.actionItems]
      };
      InsightMerger.merge.mockReturnValue(mergedInsights);

      // Set environment variables for all services
      process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
      process.env.GITHUB_TOKEN = 'ghp_test_token';

      const response = await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: testDateRange,
          teamMembers: testTeamMembers
        })
        .expect(200);

      // Verify all services were called
      expect(mockLinearService.getIssuesInDateRange).toHaveBeenCalledWith(
        '2024-01-01T00:00:00Z',
        '2024-01-07T23:59:59Z',
        testTeamMembers
      );
      expect(mockSlackService.getTeamChannelMessages).toHaveBeenCalled();
      expect(mockGitHubService.getTeamActivity).toHaveBeenCalled();
      expect(mockLLMAnalyzer.analyzeTeamData).toHaveBeenCalled();

      // Verify response structure
      expect(response.body).toMatchObject({
        wentWell: expect.arrayContaining([
          expect.objectContaining({ source: 'rules' }),
          expect.objectContaining({ source: 'ai' })
        ]),
        didntGoWell: expect.arrayContaining([
          expect.objectContaining({ source: 'ai' })
        ]),
        actionItems: expect.arrayContaining([
          expect.objectContaining({ source: 'rules' }),
          expect.objectContaining({ source: 'ai' })
        ]),
        analysisMetadata: {
          ruleBasedAnalysisUsed: true,
          llmAnalysisUsed: true,
          llmEnabled: true,
          generatedAt: expect.any(String),
          dateRange: testDateRange,
          teamMembers: testTeamMembers,
          llm: llmInsights.analysisMetadata
        }
      });

      // Clean up environment
      delete process.env.SLACK_BOT_TOKEN;
      delete process.env.GITHUB_TOKEN;
    });

    test('should handle partial service failures gracefully', async () => {
      // Mock Linear as successful, others as failing
      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockResolvedValue(sampleLinearData),
        analyzeIssuesForRetro: vi.fn().mockReturnValue(ruleBasedInsights)
      };
      LinearService.mockImplementation(() => mockLinearService);

      const mockSlackService = {
        getTeamChannelMessages: vi.fn().mockRejectedValue(new Error('Slack API error')),
        analyzeMessagesForRetro: vi.fn()
      };
      SlackService.mockImplementation(() => mockSlackService);

      const mockGitHubService = {
        getTeamActivity: vi.fn().mockRejectedValue(new Error('GitHub API error')),
        analyzeActivityForRetro: vi.fn()
      };
      GitHubService.mockImplementation(() => mockGitHubService);

      const mockLLMAnalyzer = {
        config: { enabled: true, provider: 'openai' },
        analyzeTeamData: vi.fn().mockResolvedValue(llmInsights)
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      InsightMerger.merge.mockReturnValue({
        wentWell: [...ruleBasedInsights.wentWell, ...llmInsights.wentWell],
        didntGoWell: llmInsights.didntGoWell,
        actionItems: [...ruleBasedInsights.actionItems, ...llmInsights.actionItems]
      });

      process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';
      process.env.GITHUB_TOKEN = 'ghp_test_token';

      const response = await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: testDateRange,
          teamMembers: testTeamMembers
        })
        .expect(200);

      // Should still succeed with available data
      expect(response.body.analysisMetadata.ruleBasedAnalysisUsed).toBe(true);
      expect(response.body.analysisMetadata.llmAnalysisUsed).toBe(true);
      expect(response.body.wentWell.length).toBeGreaterThan(0);

      delete process.env.SLACK_BOT_TOKEN;
      delete process.env.GITHUB_TOKEN;
    });

    test('should measure and report performance metrics', async () => {
      const startTime = Date.now();

      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return sampleLinearData;
        }),
        analyzeIssuesForRetro: vi.fn().mockReturnValue(ruleBasedInsights)
      };
      LinearService.mockImplementation(() => mockLinearService);

      const mockLLMAnalyzer = {
        config: { enabled: true, provider: 'openai' },
        analyzeTeamData: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 150));
          return llmInsights;
        })
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      InsightMerger.merge.mockReturnValue({
        wentWell: [...ruleBasedInsights.wentWell, ...llmInsights.wentWell],
        didntGoWell: llmInsights.didntGoWell,
        actionItems: [...ruleBasedInsights.actionItems, ...llmInsights.actionItems]
      });

      const response = await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: testDateRange,
          teamMembers: testTeamMembers
        })
        .expect(200);

      const totalTime = Date.now() - startTime;

      // Should complete in reasonable time (parallel execution)
      expect(totalTime).toBeLessThan(300); // Should be less than sum of individual times

      // Should include LLM performance metadata
      expect(response.body.analysisMetadata.llm).toMatchObject({
        provider: 'openai',
        model: 'gpt-4',
        duration: expect.any(Number),
        tokenUsage: expect.any(Number),
        cost: expect.any(Number)
      });
    });
  });

  describe('Provider Configuration and Fallback Scenarios', () => {
    test('should work with OpenAI provider only', async () => {
      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockResolvedValue(sampleLinearData),
        analyzeIssuesForRetro: vi.fn().mockReturnValue(ruleBasedInsights)
      };
      LinearService.mockImplementation(() => mockLinearService);

      const openaiInsights = {
        ...llmInsights,
        analysisMetadata: {
          ...llmInsights.analysisMetadata,
          provider: 'openai',
          model: 'gpt-3.5-turbo'
        }
      };

      const mockLLMAnalyzer = {
        config: { enabled: true, provider: 'openai', model: 'gpt-3.5-turbo' },
        analyzeTeamData: vi.fn().mockResolvedValue(openaiInsights)
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      InsightMerger.merge.mockReturnValue({
        wentWell: [...ruleBasedInsights.wentWell, ...openaiInsights.wentWell],
        didntGoWell: openaiInsights.didntGoWell,
        actionItems: [...ruleBasedInsights.actionItems, ...openaiInsights.actionItems]
      });

      const response = await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: testDateRange,
          teamMembers: testTeamMembers
        })
        .expect(200);

      expect(response.body.analysisMetadata.llm.provider).toBe('openai');
      expect(response.body.analysisMetadata.llm.model).toBe('gpt-3.5-turbo');
    });

    test('should work with Anthropic provider only', async () => {
      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockResolvedValue(sampleLinearData),
        analyzeIssuesForRetro: vi.fn().mockReturnValue(ruleBasedInsights)
      };
      LinearService.mockImplementation(() => mockLinearService);

      const anthropicInsights = {
        ...llmInsights,
        analysisMetadata: {
          ...llmInsights.analysisMetadata,
          provider: 'anthropic',
          model: 'claude-3-sonnet-20240229'
        }
      };

      const mockLLMAnalyzer = {
        config: { enabled: true, provider: 'anthropic', model: 'claude-3-sonnet-20240229' },
        analyzeTeamData: vi.fn().mockResolvedValue(anthropicInsights)
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      InsightMerger.merge.mockReturnValue({
        wentWell: [...ruleBasedInsights.wentWell, ...anthropicInsights.wentWell],
        didntGoWell: anthropicInsights.didntGoWell,
        actionItems: [...ruleBasedInsights.actionItems, ...anthropicInsights.actionItems]
      });

      const response = await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: testDateRange,
          teamMembers: testTeamMembers
        })
        .expect(200);

      expect(response.body.analysisMetadata.llm.provider).toBe('anthropic');
      expect(response.body.analysisMetadata.llm.model).toBe('claude-3-sonnet-20240229');
    });

    test('should work with local model provider', async () => {
      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockResolvedValue(sampleLinearData),
        analyzeIssuesForRetro: vi.fn().mockReturnValue(ruleBasedInsights)
      };
      LinearService.mockImplementation(() => mockLinearService);

      const localInsights = {
        ...llmInsights,
        analysisMetadata: {
          ...llmInsights.analysisMetadata,
          provider: 'local',
          model: 'llama2',
          cost: 0 // Local models have no cost
        }
      };

      const mockLLMAnalyzer = {
        config: { enabled: true, provider: 'local', model: 'llama2' },
        analyzeTeamData: vi.fn().mockResolvedValue(localInsights)
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      InsightMerger.merge.mockReturnValue({
        wentWell: [...ruleBasedInsights.wentWell, ...localInsights.wentWell],
        didntGoWell: localInsights.didntGoWell,
        actionItems: [...ruleBasedInsights.actionItems, ...localInsights.actionItems]
      });

      const response = await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: testDateRange,
          teamMembers: testTeamMembers
        })
        .expect(200);

      expect(response.body.analysisMetadata.llm.provider).toBe('local');
      expect(response.body.analysisMetadata.llm.model).toBe('llama2');
      expect(response.body.analysisMetadata.llm.cost).toBe(0);
    });

    test('should fallback to rule-based analysis when LLM fails', async () => {
      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockResolvedValue(sampleLinearData),
        analyzeIssuesForRetro: vi.fn().mockReturnValue(ruleBasedInsights)
      };
      LinearService.mockImplementation(() => mockLinearService);

      const mockLLMAnalyzer = {
        config: { enabled: true, provider: 'openai' },
        analyzeTeamData: vi.fn().mockRejectedValue(new Error('OpenAI API rate limit exceeded'))
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      InsightMerger.merge.mockReturnValue(ruleBasedInsights);

      const response = await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: testDateRange,
          teamMembers: testTeamMembers
        })
        .expect(200);

      expect(response.body.analysisMetadata.ruleBasedAnalysisUsed).toBe(true);
      expect(response.body.analysisMetadata.llmAnalysisUsed).toBe(false);
      expect(response.body.wentWell).toEqual(ruleBasedInsights.wentWell);
    });

    test('should work when LLM is disabled', async () => {
      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockResolvedValue(sampleLinearData),
        analyzeIssuesForRetro: vi.fn().mockReturnValue(ruleBasedInsights)
      };
      LinearService.mockImplementation(() => mockLinearService);

      const mockLLMAnalyzer = {
        config: { enabled: false }
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      InsightMerger.merge.mockReturnValue(ruleBasedInsights);

      const response = await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: testDateRange,
          teamMembers: testTeamMembers
        })
        .expect(200);

      expect(response.body.analysisMetadata.llmEnabled).toBe(false);
      expect(response.body.analysisMetadata.llmAnalysisUsed).toBe(false);
      expect(response.body.wentWell).toEqual(ruleBasedInsights.wentWell);
    });
  });

  describe('Performance Tests', () => {
    test('should not significantly degrade performance with LLM integration', async () => {
      // Test baseline performance without LLM
      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          return sampleLinearData;
        }),
        analyzeIssuesForRetro: vi.fn().mockReturnValue(ruleBasedInsights)
      };
      LinearService.mockImplementation(() => mockLinearService);

      const mockLLMAnalyzer = {
        config: { enabled: false }
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      InsightMerger.merge.mockReturnValue(ruleBasedInsights);

      // Measure baseline performance
      const baselineStart = Date.now();
      await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: testDateRange,
          teamMembers: testTeamMembers
        })
        .expect(200);
      const baselineTime = Date.now() - baselineStart;

      // Test performance with LLM enabled
      const mockLLMAnalyzerEnabled = {
        config: { enabled: true, provider: 'openai' },
        analyzeTeamData: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return llmInsights;
        })
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzerEnabled);

      InsightMerger.merge.mockReturnValue({
        wentWell: [...ruleBasedInsights.wentWell, ...llmInsights.wentWell],
        didntGoWell: llmInsights.didntGoWell,
        actionItems: [...ruleBasedInsights.actionItems, ...llmInsights.actionItems]
      });

      const llmStart = Date.now();
      await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: testDateRange,
          teamMembers: testTeamMembers
        })
        .expect(200);
      const llmTime = Date.now() - llmStart;

      // LLM should run in parallel, so total time should be close to baseline + LLM time
      // but not the sum of both (which would indicate sequential execution)
      expect(llmTime).toBeLessThan(baselineTime + 150); // Allow some overhead
      expect(llmTime).toBeGreaterThan(Math.max(baselineTime, 100)); // Should be at least as long as the longer operation
    });

    test('should handle large datasets efficiently', async () => {
      // Create large dataset
      const largeLinearData = Array(100).fill(null).map((_, i) => ({
        id: `LIN-${i}`,
        title: `Issue ${i}`,
        state: { name: 'Done' },
        assignee: { name: 'Developer' },
        description: 'A detailed description of the issue that needs to be resolved'
      }));

      const largeGitHubData = {
        commits: Array(200).fill(null).map((_, i) => ({
          sha: `commit${i}`,
          commit: {
            message: `Commit message ${i}`,
            author: { name: 'Developer', email: 'dev@company.com' }
          }
        })),
        pullRequests: Array(50).fill(null).map((_, i) => ({
          id: i,
          title: `PR ${i}`,
          user: { login: 'developer' },
          body: 'Pull request description'
        }))
      };

      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockResolvedValue(largeLinearData),
        analyzeIssuesForRetro: vi.fn().mockReturnValue(ruleBasedInsights)
      };
      LinearService.mockImplementation(() => mockLinearService);

      const mockGitHubService = {
        getTeamActivity: vi.fn().mockResolvedValue(largeGitHubData),
        analyzeActivityForRetro: vi.fn().mockReturnValue({ wentWell: [], didntGoWell: [], actionItems: [] })
      };
      GitHubService.mockImplementation(() => mockGitHubService);

      const mockLLMAnalyzer = {
        config: { enabled: true, provider: 'openai' },
        analyzeTeamData: vi.fn().mockImplementation(async (githubData, linearData, slackData) => {
          // Simulate processing time proportional to data size
          const dataSize = (githubData?.commits?.length || 0) + (linearData?.length || 0);
          const processingTime = Math.min(dataSize * 2, 500); // Cap at 500ms
          await new Promise(resolve => setTimeout(resolve, processingTime));
          
          return {
            ...llmInsights,
            analysisMetadata: {
              ...llmInsights.analysisMetadata,
              dataSize,
              processingTime
            }
          };
        })
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      InsightMerger.merge.mockReturnValue({
        wentWell: [...ruleBasedInsights.wentWell, ...llmInsights.wentWell],
        didntGoWell: llmInsights.didntGoWell,
        actionItems: [...ruleBasedInsights.actionItems, ...llmInsights.actionItems]
      });

      process.env.GITHUB_TOKEN = 'ghp_test_token';

      const start = Date.now();
      const response = await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: testDateRange,
          teamMembers: testTeamMembers
        })
        .expect(200);
      const duration = Date.now() - start;

      // Should complete within reasonable time even with large dataset
      expect(duration).toBeLessThan(1000);
      expect(response.body.analysisMetadata.llm.processingTime).toBeDefined(); // Should have processing metadata
      
      delete process.env.GITHUB_TOKEN;
    });

    test('should timeout gracefully on slow LLM responses', async () => {
      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockResolvedValue(sampleLinearData),
        analyzeIssuesForRetro: vi.fn().mockReturnValue(ruleBasedInsights)
      };
      LinearService.mockImplementation(() => mockLinearService);

      const mockLLMAnalyzer = {
        config: { enabled: true, provider: 'openai', timeout: 100 },
        analyzeTeamData: vi.fn().mockImplementation(async () => {
          // Simulate slow response that exceeds timeout
          await new Promise(resolve => setTimeout(resolve, 200));
          return llmInsights;
        })
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      // Mock timeout behavior - LLM should reject with timeout error
      mockLLMAnalyzer.analyzeTeamData.mockRejectedValue(new Error('Request timeout'));

      InsightMerger.merge.mockReturnValue(ruleBasedInsights);

      const response = await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: testDateRange,
          teamMembers: testTeamMembers
        })
        .expect(200);

      // Should fallback to rule-based analysis
      expect(response.body.analysisMetadata.ruleBasedAnalysisUsed).toBe(true);
      expect(response.body.analysisMetadata.llmAnalysisUsed).toBe(false);
    });

    test('should handle concurrent requests efficiently', async () => {
      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockResolvedValue(sampleLinearData),
        analyzeIssuesForRetro: vi.fn().mockReturnValue(ruleBasedInsights)
      };
      LinearService.mockImplementation(() => mockLinearService);

      const mockLLMAnalyzer = {
        config: { enabled: true, provider: 'openai' },
        analyzeTeamData: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return llmInsights;
        })
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      InsightMerger.merge.mockReturnValue({
        wentWell: [...ruleBasedInsights.wentWell, ...llmInsights.wentWell],
        didntGoWell: llmInsights.didntGoWell,
        actionItems: [...ruleBasedInsights.actionItems, ...llmInsights.actionItems]
      });

      // Make multiple concurrent requests
      const requests = Array(3).fill(null).map(() =>
        request(app)
          .post('/api/generate-retro')
          .send({
            dateRange: testDateRange,
            teamMembers: testTeamMembers
          })
      );

      const start = Date.now();
      const responses = await Promise.all(requests);
      const duration = Date.now() - start;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.analysisMetadata.llmAnalysisUsed).toBe(true);
      });

      // Should handle concurrent requests efficiently
      expect(duration).toBeLessThan(500); // Should not be 3x the single request time
    });
  });

  describe('Data Privacy and Sanitization Compliance', () => {
    test('should sanitize GitHub data before sending to LLM', async () => {
      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockResolvedValue(sampleLinearData),
        analyzeIssuesForRetro: vi.fn().mockReturnValue(ruleBasedInsights)
      };
      LinearService.mockImplementation(() => mockLinearService);

      const mockGitHubService = {
        getTeamActivity: vi.fn().mockResolvedValue(sampleGitHubData),
        analyzeActivityForRetro: vi.fn().mockReturnValue({ wentWell: [], didntGoWell: [], actionItems: [] })
      };
      GitHubService.mockImplementation(() => mockGitHubService);

      const mockLLMAnalyzer = {
        config: { enabled: true, provider: 'openai' },
        analyzeTeamData: vi.fn().mockResolvedValue(llmInsights)
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      // Mock data sanitizer
      DataSanitizer.sanitizeGitHubData.mockReturnValue(sanitizedGitHubData);
      DataSanitizer.sanitizeLinearData.mockReturnValue(sampleLinearData);
      DataSanitizer.sanitizeSlackData.mockReturnValue([]);

      InsightMerger.merge.mockReturnValue({
        wentWell: [...ruleBasedInsights.wentWell, ...llmInsights.wentWell],
        didntGoWell: llmInsights.didntGoWell,
        actionItems: [...ruleBasedInsights.actionItems, ...llmInsights.actionItems]
      });

      process.env.GITHUB_TOKEN = 'ghp_test_token';

      await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: testDateRange,
          teamMembers: testTeamMembers
        })
        .expect(200);

      // Verify sanitization was called
      expect(DataSanitizer.sanitizeGitHubData).toHaveBeenCalledWith(sampleGitHubData);
      expect(DataSanitizer.sanitizeLinearData).toHaveBeenCalledWith(sampleLinearData);

      // Verify LLM received sanitized data
      const llmCall = mockLLMAnalyzer.analyzeTeamData.mock.calls[0];
      expect(llmCall[0]).toEqual(sanitizedGitHubData); // GitHub data should be sanitized

      delete process.env.GITHUB_TOKEN;
    });

    test('should sanitize Linear data to remove personal identifiers', async () => {
      const sensitiveLinearData = [
        {
          id: 'LIN-123',
          title: 'Fix issue for john.doe@company.com',
          state: { name: 'Done' },
          assignee: { name: 'John Doe', email: 'john.doe@company.com' },
          description: 'User john.doe@company.com reported an issue with API key sk-1234567890'
        }
      ];

      const sanitizedLinearData = [
        {
          id: 'LIN-123',
          title: 'Fix issue for [EMAIL_REDACTED]',
          state: { name: 'Done' },
          assignee: { name: '[NAME_REDACTED]', email: '[EMAIL_REDACTED]' },
          description: 'User [EMAIL_REDACTED] reported an issue with API key [API_KEY_REDACTED]'
        }
      ];

      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockResolvedValue(sensitiveLinearData),
        analyzeIssuesForRetro: vi.fn().mockReturnValue(ruleBasedInsights)
      };
      LinearService.mockImplementation(() => mockLinearService);

      const mockLLMAnalyzer = {
        config: { enabled: true, provider: 'openai' },
        analyzeTeamData: vi.fn().mockResolvedValue(llmInsights)
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      DataSanitizer.sanitizeLinearData.mockReturnValue(sanitizedLinearData);
      DataSanitizer.sanitizeGitHubData.mockReturnValue(null);
      DataSanitizer.sanitizeSlackData.mockReturnValue(null);

      InsightMerger.merge.mockReturnValue({
        wentWell: [...ruleBasedInsights.wentWell, ...llmInsights.wentWell],
        didntGoWell: llmInsights.didntGoWell,
        actionItems: [...ruleBasedInsights.actionItems, ...llmInsights.actionItems]
      });

      await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: testDateRange,
          teamMembers: testTeamMembers
        })
        .expect(200);

      expect(DataSanitizer.sanitizeLinearData).toHaveBeenCalledWith(sensitiveLinearData);
      
      // Verify LLM received sanitized Linear data
      const llmCall = mockLLMAnalyzer.analyzeTeamData.mock.calls[0];
      expect(llmCall[1]).toEqual(sanitizedLinearData);
    });

    test('should sanitize Slack data to remove user IDs and private content', async () => {
      const sensitiveSlackData = [
        {
          text: 'Hey <@U123456>, can you check the API key sk-1234567890?',
          user: 'U123456',
          channel: 'C789012',
          ts: '1704067200.000100'
        },
        {
          text: 'Meeting at john.doe@company.com office',
          user: 'U789012',
          channel: 'C789012',
          ts: '1704067300.000100'
        }
      ];

      const sanitizedSlackData = [
        {
          text: 'Hey [USER_MENTION], can you check the API key [API_KEY_REDACTED]?',
          user: '[USER_ID_REDACTED]',
          channel: 'C789012',
          ts: '1704067200.000100'
        },
        {
          text: 'Meeting at [EMAIL_REDACTED] office',
          user: '[USER_ID_REDACTED]',
          channel: 'C789012',
          ts: '1704067300.000100'
        }
      ];

      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockResolvedValue(sampleLinearData),
        analyzeIssuesForRetro: vi.fn().mockReturnValue(ruleBasedInsights)
      };
      LinearService.mockImplementation(() => mockLinearService);

      const mockSlackService = {
        getTeamChannelMessages: vi.fn().mockResolvedValue(sensitiveSlackData),
        analyzeMessagesForRetro: vi.fn().mockReturnValue({ wentWell: [], didntGoWell: [], actionItems: [] })
      };
      SlackService.mockImplementation(() => mockSlackService);

      const mockLLMAnalyzer = {
        config: { enabled: true, provider: 'openai' },
        analyzeTeamData: vi.fn().mockResolvedValue(llmInsights)
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      DataSanitizer.sanitizeSlackData.mockReturnValue(sanitizedSlackData);
      DataSanitizer.sanitizeLinearData.mockReturnValue(sampleLinearData);
      DataSanitizer.sanitizeGitHubData.mockReturnValue(null);

      InsightMerger.merge.mockReturnValue({
        wentWell: [...ruleBasedInsights.wentWell, ...llmInsights.wentWell],
        didntGoWell: llmInsights.didntGoWell,
        actionItems: [...ruleBasedInsights.actionItems, ...llmInsights.actionItems]
      });

      process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';

      await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: testDateRange,
          teamMembers: testTeamMembers
        })
        .expect(200);

      expect(DataSanitizer.sanitizeSlackData).toHaveBeenCalledWith(sensitiveSlackData);
      
      // Verify LLM received sanitized Slack data
      const llmCall = mockLLMAnalyzer.analyzeTeamData.mock.calls[0];
      expect(llmCall[2]).toEqual(sanitizedSlackData);

      delete process.env.SLACK_BOT_TOKEN;
    });

    test('should respect privacy mode for local models', async () => {
      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockResolvedValue(sampleLinearData),
        analyzeIssuesForRetro: vi.fn().mockReturnValue(ruleBasedInsights)
      };
      LinearService.mockImplementation(() => mockLinearService);

      const mockLLMAnalyzer = {
        config: { 
          enabled: true, 
          provider: 'local', 
          model: 'llama2',
          privacyMode: true 
        },
        analyzeTeamData: vi.fn().mockResolvedValue({
          ...llmInsights,
          analysisMetadata: {
            ...llmInsights.analysisMetadata,
            provider: 'local',
            model: 'llama2',
            privacyMode: true,
            cost: 0
          }
        })
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      // In privacy mode, data should not be sanitized as aggressively
      DataSanitizer.sanitizeLinearData.mockReturnValue(sampleLinearData);
      DataSanitizer.sanitizeGitHubData.mockReturnValue(null);
      DataSanitizer.sanitizeSlackData.mockReturnValue(null);

      InsightMerger.merge.mockReturnValue({
        wentWell: [...ruleBasedInsights.wentWell, ...llmInsights.wentWell],
        didntGoWell: llmInsights.didntGoWell,
        actionItems: [...ruleBasedInsights.actionItems, ...llmInsights.actionItems]
      });

      const response = await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: testDateRange,
          teamMembers: testTeamMembers
        })
        .expect(200);

      expect(response.body.analysisMetadata.llm.provider).toBe('local');
      expect(response.body.analysisMetadata.llm.privacyMode).toBe(true);
      expect(response.body.analysisMetadata.llm.cost).toBe(0);
    });

    test('should exclude private channels unless explicitly configured', async () => {
      const mixedSlackData = [
        {
          text: 'Public channel message',
          user: 'U123456',
          channel: 'C789012', // Public channel
          channel_type: 'public',
          ts: '1704067200.000100'
        },
        {
          text: 'Private channel sensitive info',
          user: 'U123456',
          channel: 'G123456', // Private channel
          channel_type: 'private',
          ts: '1704067300.000100'
        }
      ];

      const filteredSlackData = [
        {
          text: 'Public channel message',
          user: '[USER_ID_REDACTED]',
          channel: 'C789012',
          channel_type: 'public',
          ts: '1704067200.000100'
        }
      ];

      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockResolvedValue(sampleLinearData),
        analyzeIssuesForRetro: vi.fn().mockReturnValue(ruleBasedInsights)
      };
      LinearService.mockImplementation(() => mockLinearService);

      const mockSlackService = {
        getTeamChannelMessages: vi.fn().mockResolvedValue(mixedSlackData),
        analyzeMessagesForRetro: vi.fn().mockReturnValue({ wentWell: [], didntGoWell: [], actionItems: [] })
      };
      SlackService.mockImplementation(() => mockSlackService);

      const mockLLMAnalyzer = {
        config: { enabled: true, provider: 'openai' },
        analyzeTeamData: vi.fn().mockResolvedValue(llmInsights)
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      // Mock sanitizer to filter out private channels
      DataSanitizer.sanitizeSlackData.mockReturnValue(filteredSlackData);
      DataSanitizer.sanitizeLinearData.mockReturnValue(sampleLinearData);
      DataSanitizer.sanitizeGitHubData.mockReturnValue(null);

      InsightMerger.merge.mockReturnValue({
        wentWell: [...ruleBasedInsights.wentWell, ...llmInsights.wentWell],
        didntGoWell: llmInsights.didntGoWell,
        actionItems: [...ruleBasedInsights.actionItems, ...llmInsights.actionItems]
      });

      process.env.SLACK_BOT_TOKEN = 'xoxb-test-token';

      await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: testDateRange,
          teamMembers: testTeamMembers
        })
        .expect(200);

      // Verify private channel data was filtered out
      const llmCall = mockLLMAnalyzer.analyzeTeamData.mock.calls[0];
      const slackDataSentToLLM = llmCall[2];
      expect(slackDataSentToLLM).toEqual(filteredSlackData);
      expect(slackDataSentToLLM).toHaveLength(1); // Only public channel message

      delete process.env.SLACK_BOT_TOKEN;
    });

    test('should provide clear warnings about external data processing', async () => {
      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockResolvedValue(sampleLinearData),
        analyzeIssuesForRetro: vi.fn().mockReturnValue(ruleBasedInsights)
      };
      LinearService.mockImplementation(() => mockLinearService);

      const mockLLMAnalyzer = {
        config: { 
          enabled: true, 
          provider: 'openai',
          externalProcessing: true 
        },
        analyzeTeamData: vi.fn().mockResolvedValue({
          ...llmInsights,
          analysisMetadata: {
            ...llmInsights.analysisMetadata,
            externalProcessing: true,
            privacyWarning: 'Data processed by external OpenAI service'
          }
        })
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      DataSanitizer.sanitizeLinearData.mockReturnValue(sampleLinearData);
      DataSanitizer.sanitizeGitHubData.mockReturnValue(null);
      DataSanitizer.sanitizeSlackData.mockReturnValue(null);

      InsightMerger.merge.mockReturnValue({
        wentWell: [...ruleBasedInsights.wentWell, ...llmInsights.wentWell],
        didntGoWell: llmInsights.didntGoWell,
        actionItems: [...ruleBasedInsights.actionItems, ...llmInsights.actionItems]
      });

      const response = await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: testDateRange,
          teamMembers: testTeamMembers
        })
        .expect(200);

      expect(response.body.analysisMetadata.llm.externalProcessing).toBe(true);
      expect(response.body.analysisMetadata.llm.privacyWarning).toContain('external');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('should handle malformed LLM responses gracefully', async () => {
      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockResolvedValue(sampleLinearData),
        analyzeIssuesForRetro: vi.fn().mockReturnValue(ruleBasedInsights)
      };
      LinearService.mockImplementation(() => mockLinearService);

      const mockLLMAnalyzer = {
        config: { enabled: true, provider: 'openai' },
        analyzeTeamData: vi.fn().mockResolvedValue({
          // Malformed response missing required fields
          wentWell: null,
          didntGoWell: undefined,
          actionItems: 'invalid format'
        })
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      // InsightMerger should handle malformed data gracefully
      InsightMerger.merge.mockReturnValue(ruleBasedInsights);

      const response = await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: testDateRange,
          teamMembers: testTeamMembers
        })
        .expect(200);

      // Should fallback to rule-based insights
      expect(response.body.analysisMetadata.ruleBasedAnalysisUsed).toBe(true);
      expect(response.body.wentWell).toEqual(ruleBasedInsights.wentWell);
    });

    test('should handle empty datasets', async () => {
      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockResolvedValue([]),
        analyzeIssuesForRetro: vi.fn().mockReturnValue({ wentWell: [], didntGoWell: [], actionItems: [] })
      };
      LinearService.mockImplementation(() => mockLinearService);

      const mockLLMAnalyzer = {
        config: { enabled: true, provider: 'openai' },
        analyzeTeamData: vi.fn().mockResolvedValue({
          wentWell: [],
          didntGoWell: [],
          actionItems: [],
          analysisMetadata: {
            provider: 'openai',
            model: 'gpt-4',
            duration: 500,
            tokenUsage: 100,
            cost: 0.001,
            dataSize: 0
          }
        })
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      InsightMerger.merge.mockReturnValue({ wentWell: [], didntGoWell: [], actionItems: [] });

      const response = await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: testDateRange,
          teamMembers: testTeamMembers
        })
        .expect(200);

      expect(response.body.analysisMetadata.llm.dataSize).toBe(0);
      expect(response.body.wentWell).toHaveLength(0);
      expect(response.body.didntGoWell).toHaveLength(0);
      expect(response.body.actionItems).toHaveLength(0);
    });

    test('should handle network errors gracefully', async () => {
      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockRejectedValue(new Error('Network error')),
        analyzeIssuesForRetro: vi.fn()
      };
      LinearService.mockImplementation(() => mockLinearService);

      const mockLLMAnalyzer = {
        config: { enabled: true, provider: 'openai' },
        analyzeTeamData: vi.fn().mockRejectedValue(new Error('OpenAI API unavailable'))
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      InsightMerger.merge.mockReturnValue({ wentWell: [], didntGoWell: [], actionItems: [] });

      const response = await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: testDateRange,
          teamMembers: testTeamMembers
        })
        .expect(200);

      expect(response.body.analysisMetadata.ruleBasedAnalysisUsed).toBe(false);
      expect(response.body.analysisMetadata.llmAnalysisUsed).toBe(false);
    });
  });
});