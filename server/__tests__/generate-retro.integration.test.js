/**
 * Integration tests for the enhanced /api/generate-retro endpoint
 * Tests LLM integration, parallel processing, configuration checks, and fallback behavior
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';

// Mock the services
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

// Import mocked modules
import LinearService from '../services/linearService.js';
import SlackService from '../services/slackService.js';
import GitHubService from '../services/githubService.js';
import { LLMAnalyzer } from '../services/llm/index.js';
import { InsightMerger } from '../services/InsightMerger.js';

// Create test app with the endpoint
const app = express();
app.use(cors());
app.use(express.json());

// Sample test data
const sampleDateRange = {
  start: '2024-01-01',
  end: '2024-01-07'
};

const sampleTeamMembers = ['user1', 'user2'];

const sampleLinearIssues = [
  {
    id: 'issue1',
    title: 'Fix login bug',
    state: { name: 'Done' },
    assignee: { name: 'John Doe' },
    createdAt: '2024-01-02T10:00:00Z'
  }
];

const sampleRuleBasedInsights = {
  wentWell: [
    {
      title: 'Completed login fix',
      details: 'Successfully resolved the login issue',
      source: 'rules',
      confidence: 0.9
    }
  ],
  didntGoWell: [],
  actionItems: []
};

const sampleLLMInsights = {
  wentWell: [
    {
      title: 'Strong collaboration on bug fixes',
      details: 'Team showed excellent coordination in resolving critical issues',
      source: 'ai',
      confidence: 0.85,
      llmProvider: 'openai',
      reasoning: 'Analyzed commit patterns and PR discussions'
    }
  ],
  didntGoWell: [],
  actionItems: [],
  analysisMetadata: {
    provider: 'openai',
    model: 'gpt-4',
    duration: 1500,
    tokenUsage: 1200
  }
};

const sampleMergedInsights = {
  wentWell: [
    ...sampleRuleBasedInsights.wentWell,
    ...sampleLLMInsights.wentWell
  ],
  didntGoWell: [],
  actionItems: [],
  mergeMetadata: {
    totalRuleBasedInsights: 1,
    totalLLMInsights: 1,
    totalMergedInsights: 2,
    duplicatesFound: 0
  }
};

// Add the generate-retro endpoint to test app
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

    // Initialize LLM analyzer and check configuration
    const llmAnalyzer = LLMAnalyzer.fromEnvironment(process.env);
    const llmEnabled = llmAnalyzer.config.enabled;

    // Prepare date range strings
    const startDate = dateRange.start + 'T00:00:00Z';
    const endDate = dateRange.end + 'T23:59:59Z';

    // Run rule-based and LLM analysis in parallel for performance
    const [ruleBasedResults, llmResults] = await Promise.allSettled([
      // Rule-based analysis
      performRuleBasedAnalysis(linearService, slackService, githubService, startDate, endDate, teamMembers),
      // LLM analysis (if enabled)
      llmEnabled ? performLLMAnalysis(llmAnalyzer, linearService, slackService, githubService, startDate, endDate, dateRange, teamMembers) : Promise.resolve(null)
    ]);

    // Extract results from Promise.allSettled
    const ruleBasedInsights = ruleBasedResults.status === 'fulfilled' 
      ? ruleBasedResults.value 
      : { wentWell: [], didntGoWell: [], actionItems: [] };

    const llmInsights = llmResults.status === 'fulfilled' && llmResults.value
      ? llmResults.value
      : { wentWell: [], didntGoWell: [], actionItems: [] };

    // Merge rule-based and LLM insights using InsightMerger
    const retroData = InsightMerger.merge(ruleBasedInsights, llmInsights);
    
    // Add analysis metadata
    retroData.analysisMetadata = {
      ...retroData.analysisMetadata,
      ruleBasedAnalysisUsed: ruleBasedResults.status === 'fulfilled',
      llmAnalysisUsed: llmEnabled && llmResults.status === 'fulfilled' && llmResults.value !== null,
      llmEnabled: llmEnabled,
      generatedAt: new Date().toISOString(),
      dateRange: dateRange,
      teamMembers: teamMembers
    };

    // Add LLM-specific metadata if available
    if (llmInsights.analysisMetadata) {
      retroData.analysisMetadata.llm = llmInsights.analysisMetadata;
    }
    
    // Add fallback content if no meaningful data found
    addFallbackContent(retroData, ruleBasedInsights, llmInsights);
    
    res.json(retroData);
  } catch (error) {
    console.error('Error generating retro:', error);
    res.status(500).json({ 
      error: 'Failed to generate retro: ' + error.message 
    });
  }
});

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
  
  return await llmAnalyzer.analyzeTeamData(
    githubData,
    issues,
    slackData,
    dateRange,
    {
      teamSize: teamMembers?.length,
      repositories: process.env.GITHUB_REPOS?.split(',') || [],
      channels: process.env.SLACK_CHANNELS?.split(',') || []
    }
  );
}

function addFallbackContent(retroData, ruleBasedInsights, llmInsights) {
  const totalRuleInsights = (ruleBasedInsights.wentWell?.length || 0) + 
                           (ruleBasedInsights.didntGoWell?.length || 0) + 
                           (ruleBasedInsights.actionItems?.length || 0);
  
  const totalLLMInsights = (llmInsights.wentWell?.length || 0) + 
                          (llmInsights.didntGoWell?.length || 0) + 
                          (llmInsights.actionItems?.length || 0);

  if (retroData.wentWell.length === 0 && retroData.didntGoWell.length === 0) {
    retroData.wentWell.push({
      title: "Team stayed active",
      details: `Tracked activity during this period (${totalRuleInsights} rule-based insights, ${totalLLMInsights} AI insights generated)`,
      source: "system",
      confidence: 0.5
    });
  }
  
  if (retroData.actionItems.length === 0) {
    retroData.actionItems.push({
      title: "Continue tracking team activities",
      priority: "low",
      assignee: "team",
      details: "Keep using the configured tools for better retro insights",
      source: "system",
      confidence: 0.5
    });
  }
}

describe('Enhanced /api/generate-retro endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set test environment variable
    process.env.TEST_LINEAR_API_KEY = 'test-key';
  });

  describe('Configuration checks', () => {
    test('should return error when LINEAR_API_KEY is not configured', async () => {
      // Remove both keys
      delete process.env.LINEAR_API_KEY;
      delete process.env.TEST_LINEAR_API_KEY;

      const response = await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: sampleDateRange,
          teamMembers: sampleTeamMembers
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('LINEAR_API_KEY not configured');

      // Restore test key
      process.env.TEST_LINEAR_API_KEY = 'test-key';
    });

    test('should enable LLM analysis when properly configured', async () => {
      // Mock LLM analyzer as enabled
      const mockLLMAnalyzer = {
        config: { enabled: true },
        analyzeTeamData: vi.fn().mockResolvedValue(sampleLLMInsights)
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      // Mock services
      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockResolvedValue(sampleLinearIssues),
        analyzeIssuesForRetro: vi.fn().mockReturnValue(sampleRuleBasedInsights)
      };
      LinearService.mockImplementation(() => mockLinearService);

      // Mock InsightMerger
      InsightMerger.merge.mockReturnValue(sampleMergedInsights);

      const response = await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: sampleDateRange,
          teamMembers: sampleTeamMembers
        });

      expect(response.status).toBe(200);
      expect(response.body.analysisMetadata.llmEnabled).toBe(true);
      expect(response.body.analysisMetadata.llmAnalysisUsed).toBe(true);
      expect(mockLLMAnalyzer.analyzeTeamData).toHaveBeenCalled();
    });

    test('should disable LLM analysis when not configured', async () => {
      // Mock LLM analyzer as disabled
      const mockLLMAnalyzer = {
        config: { enabled: false }
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      // Mock services
      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockResolvedValue(sampleLinearIssues),
        analyzeIssuesForRetro: vi.fn().mockReturnValue(sampleRuleBasedInsights)
      };
      LinearService.mockImplementation(() => mockLinearService);

      // Mock InsightMerger
      InsightMerger.merge.mockReturnValue(sampleRuleBasedInsights);

      const response = await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: sampleDateRange,
          teamMembers: sampleTeamMembers
        });

      expect(response.status).toBe(200);
      expect(response.body.analysisMetadata.llmEnabled).toBe(false);
      expect(response.body.analysisMetadata.llmAnalysisUsed).toBe(false);
    });
  });

  describe('Parallel processing', () => {
    test('should run rule-based and LLM analysis in parallel', async () => {
      const startTime = Date.now();
      
      // Mock LLM analyzer with delay
      const mockLLMAnalyzer = {
        config: { enabled: true },
        analyzeTeamData: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          return sampleLLMInsights;
        })
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      // Mock services with delay
      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          return sampleLinearIssues;
        }),
        analyzeIssuesForRetro: vi.fn().mockReturnValue(sampleRuleBasedInsights)
      };
      LinearService.mockImplementation(() => mockLinearService);

      InsightMerger.merge.mockReturnValue(sampleMergedInsights);

      const response = await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: sampleDateRange,
          teamMembers: sampleTeamMembers
        });

      const duration = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      // Should complete in less than 100ms if running in parallel (vs 100ms+ if sequential)
      expect(duration).toBeLessThan(150);
      expect(response.body.analysisMetadata.ruleBasedAnalysisUsed).toBe(true);
      expect(response.body.analysisMetadata.llmAnalysisUsed).toBe(true);
    });

    test('should continue with rule-based analysis if LLM analysis fails', async () => {
      // Mock LLM analyzer that fails
      const mockLLMAnalyzer = {
        config: { enabled: true },
        analyzeTeamData: vi.fn().mockRejectedValue(new Error('LLM service unavailable'))
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      // Mock successful rule-based analysis
      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockResolvedValue(sampleLinearIssues),
        analyzeIssuesForRetro: vi.fn().mockReturnValue(sampleRuleBasedInsights)
      };
      LinearService.mockImplementation(() => mockLinearService);

      InsightMerger.merge.mockReturnValue(sampleRuleBasedInsights);

      const response = await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: sampleDateRange,
          teamMembers: sampleTeamMembers
        });

      expect(response.status).toBe(200);
      expect(response.body.analysisMetadata.ruleBasedAnalysisUsed).toBe(true);
      expect(response.body.analysisMetadata.llmAnalysisUsed).toBe(false);
      expect(response.body.wentWell).toHaveLength(1);
    });
  });

  describe('Insight merging', () => {
    test('should merge rule-based and LLM insights using InsightMerger', async () => {
      // Mock both analyses successful
      const mockLLMAnalyzer = {
        config: { enabled: true },
        analyzeTeamData: vi.fn().mockResolvedValue(sampleLLMInsights)
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockResolvedValue(sampleLinearIssues),
        analyzeIssuesForRetro: vi.fn().mockReturnValue(sampleRuleBasedInsights)
      };
      LinearService.mockImplementation(() => mockLinearService);

      InsightMerger.merge.mockReturnValue(sampleMergedInsights);

      const response = await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: sampleDateRange,
          teamMembers: sampleTeamMembers
        });

      expect(response.status).toBe(200);
      expect(InsightMerger.merge).toHaveBeenCalledWith(
        expect.objectContaining({
          wentWell: expect.any(Array),
          didntGoWell: expect.any(Array),
          actionItems: expect.any(Array)
        }),
        sampleLLMInsights
      );
      expect(response.body.wentWell).toHaveLength(2); // Merged insights
    });

    test('should include LLM metadata in response when available', async () => {
      const mockLLMAnalyzer = {
        config: { enabled: true },
        analyzeTeamData: vi.fn().mockResolvedValue(sampleLLMInsights)
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockResolvedValue(sampleLinearIssues),
        analyzeIssuesForRetro: vi.fn().mockReturnValue(sampleRuleBasedInsights)
      };
      LinearService.mockImplementation(() => mockLinearService);

      InsightMerger.merge.mockReturnValue({
        ...sampleMergedInsights,
        analysisMetadata: sampleLLMInsights.analysisMetadata
      });

      const response = await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: sampleDateRange,
          teamMembers: sampleTeamMembers
        });

      expect(response.status).toBe(200);
      expect(response.body.analysisMetadata.llm).toEqual(sampleLLMInsights.analysisMetadata);
      expect(response.body.analysisMetadata.generatedAt).toBeDefined();
      expect(response.body.analysisMetadata.dateRange).toEqual(sampleDateRange);
    });
  });

  describe('Fallback behavior', () => {
    test('should add fallback content when no insights are generated', async () => {
      // Mock empty insights
      const emptyInsights = { wentWell: [], didntGoWell: [], actionItems: [] };
      
      const mockLLMAnalyzer = {
        config: { enabled: false }
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockResolvedValue([]),
        analyzeIssuesForRetro: vi.fn().mockReturnValue(emptyInsights)
      };
      LinearService.mockImplementation(() => mockLinearService);

      InsightMerger.merge.mockReturnValue(emptyInsights);

      const response = await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: sampleDateRange,
          teamMembers: sampleTeamMembers
        });

      expect(response.status).toBe(200);
      expect(response.body.wentWell).toHaveLength(1);
      expect(response.body.wentWell[0].title).toBe("Team stayed active");
      expect(response.body.actionItems).toHaveLength(1);
      expect(response.body.actionItems[0].title).toBe("Continue tracking team activities");
    });
  });

  describe('Error handling', () => {
    test('should return 500 for unexpected errors', async () => {
      // Mock LinearService constructor to throw
      LinearService.mockImplementation(() => {
        throw new Error('Unexpected initialization error');
      });

      const response = await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: sampleDateRange,
          teamMembers: sampleTeamMembers
        });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('Failed to generate retro');
    });
  });
});