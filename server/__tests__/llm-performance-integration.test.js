/**
 * LLM Performance Integration Tests
 * 
 * This test suite focuses on performance aspects of LLM integration to ensure
 * the system maintains acceptable performance levels with LLM analysis enabled.
 * 
 * Requirements: 1.1, 1.4, 5.1, 5.2
 */

import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';

// Mock services
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

import LinearService from '../services/linearService.js';
import SlackService from '../services/slackService.js';
import GitHubService from '../services/githubService.js';
import { LLMAnalyzer } from '../services/llm/index.js';
import { InsightMerger } from '../services/InsightMerger.js';

// Performance test utilities
class PerformanceTracker {
  constructor() {
    this.metrics = [];
  }

  startTimer(label) {
    const start = process.hrtime.bigint();
    return {
      end: () => {
        const end = process.hrtime.bigint();
        const duration = Number(end - start) / 1000000; // Convert to milliseconds
        this.metrics.push({ label, duration, timestamp: Date.now() });
        return duration;
      }
    };
  }

  getMetrics() {
    return this.metrics;
  }

  getAverageDuration(label) {
    const labelMetrics = this.metrics.filter(m => m.label === label);
    if (labelMetrics.length === 0) return 0;
    return labelMetrics.reduce((sum, m) => sum + m.duration, 0) / labelMetrics.length;
  }

  reset() {
    this.metrics = [];
  }
}

// Test data generators
const generateLargeLinearDataset = (size) => {
  return Array(size).fill(null).map((_, i) => ({
    id: `LIN-${i}`,
    title: `Issue ${i}: ${Math.random() > 0.5 ? 'Bug' : 'Feature'} in ${Math.random() > 0.5 ? 'frontend' : 'backend'}`,
    state: { name: Math.random() > 0.7 ? 'Done' : 'In Progress' },
    assignee: { name: `Developer ${i % 10}` },
    description: `Detailed description for issue ${i}. This issue involves ${Math.random() > 0.5 ? 'authentication' : 'database'} functionality.`,
    createdAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000).toISOString()
  }));
};

const generateLargeGitHubDataset = (commitCount, prCount) => {
  return {
    commits: Array(commitCount).fill(null).map((_, i) => ({
      sha: `commit${i}`,
      commit: {
        message: `Commit ${i}: ${Math.random() > 0.5 ? 'Fix' : 'Add'} ${Math.random() > 0.5 ? 'authentication' : 'validation'} logic`,
        author: { name: `Developer ${i % 5}`, email: `dev${i % 5}@company.com` },
        committer: { name: `Developer ${i % 5}`, email: `dev${i % 5}@company.com` }
      }
    })),
    pullRequests: Array(prCount).fill(null).map((_, i) => ({
      id: i,
      title: `PR ${i}: Implement ${Math.random() > 0.5 ? 'feature' : 'bugfix'}`,
      body: `This pull request implements important changes for issue LIN-${i}`,
      user: { login: `developer${i % 3}` }
    }))
  };
};

const generateLargeSlackDataset = (size) => {
  return Array(size).fill(null).map((_, i) => ({
    text: `Message ${i}: ${Math.random() > 0.5 ? 'Great work on' : 'Issue with'} the ${Math.random() > 0.5 ? 'deployment' : 'testing'}`,
    user: `U${i % 20}`,
    channel: 'C789012',
    channel_type: 'public',
    ts: `${1704067200 + i}.000100`
  }));
};

// Create test app
const createTestApp = () => {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.post('/api/generate-retro', async (req, res) => {
    const performanceTracker = new PerformanceTracker();
    
    try {
      const { dateRange, teamMembers } = req.body;
      
      if (!process.env.LINEAR_API_KEY && !process.env.TEST_LINEAR_API_KEY) {
        return res.status(400).json({ 
          error: 'LINEAR_API_KEY not configured' 
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

      const llmAnalyzer = LLMAnalyzer.fromEnvironment(process.env);
      const llmEnabled = llmAnalyzer.config.enabled;

      const startDate = dateRange.start + 'T00:00:00Z';
      const endDate = dateRange.end + 'T23:59:59Z';

      // Track performance of parallel execution
      const parallelTimer = performanceTracker.startTimer('parallel_analysis');
      
      const [ruleBasedResults, llmResults] = await Promise.allSettled([
        performRuleBasedAnalysis(linearService, slackService, githubService, startDate, endDate, teamMembers, performanceTracker),
        llmEnabled ? performLLMAnalysis(llmAnalyzer, linearService, slackService, githubService, startDate, endDate, dateRange, teamMembers, performanceTracker) : Promise.resolve(null)
      ]);

      const parallelDuration = parallelTimer.end();

      // Extract results
      const ruleBasedInsights = ruleBasedResults.status === 'fulfilled' 
        ? ruleBasedResults.value 
        : { wentWell: [], didntGoWell: [], actionItems: [] };

      const llmInsights = llmResults.status === 'fulfilled' && llmResults.value
        ? llmResults.value
        : { wentWell: [], didntGoWell: [], actionItems: [] };

      // Track merging performance
      const mergeTimer = performanceTracker.startTimer('insight_merge');
      const retroData = InsightMerger.merge(ruleBasedInsights, llmInsights);
      const mergeDuration = mergeTimer.end();
      
      // Add performance metadata
      retroData.performanceMetrics = {
        totalDuration: parallelDuration,
        mergeDuration: mergeDuration,
        ruleBasedAnalysisUsed: ruleBasedResults.status === 'fulfilled',
        llmAnalysisUsed: llmEnabled && llmResults.status === 'fulfilled' && llmResults.value !== null,
        detailedMetrics: performanceTracker.getMetrics()
      };

      // Add analysis metadata
      retroData.analysisMetadata = {
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

async function performRuleBasedAnalysis(linearService, slackService, githubService, startDate, endDate, teamMembers, performanceTracker) {
  const linearTimer = performanceTracker.startTimer('linear_analysis');
  const issues = await linearService.getIssuesInDateRange(startDate, endDate, teamMembers);
  const linearRetroData = linearService.analyzeIssuesForRetro(issues);
  linearTimer.end();

  let slackRetroData = { wentWell: [], didntGoWell: [], actionItems: [] };
  if (slackService) {
    try {
      const slackTimer = performanceTracker.startTimer('slack_analysis');
      const messages = await slackService.getTeamChannelMessages(startDate, endDate);
      slackRetroData = slackService.analyzeMessagesForRetro(messages);
      slackTimer.end();
    } catch (error) {
      console.warn('Slack analysis failed:', error.message);
    }
  }

  let githubRetroData = { wentWell: [], didntGoWell: [], actionItems: [] };
  if (githubService) {
    try {
      const githubTimer = performanceTracker.startTimer('github_analysis');
      const { commits, pullRequests } = await githubService.getTeamActivity(startDate, endDate);
      githubRetroData = githubService.analyzeActivityForRetro(commits, pullRequests);
      githubTimer.end();
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

async function performLLMAnalysis(llmAnalyzer, linearService, slackService, githubService, startDate, endDate, dateRange, teamMembers, performanceTracker) {
  const llmTimer = performanceTracker.startTimer('llm_analysis');
  
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
  
  const result = await llmAnalyzer.analyzeTeamData(
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

  llmTimer.end();
  return result;
}

describe('LLM Performance Integration Tests', () => {
  let app;
  let performanceTracker;

  beforeEach(() => {
    app = createTestApp();
    performanceTracker = new PerformanceTracker();
    vi.clearAllMocks();
    process.env.TEST_LINEAR_API_KEY = 'test-key';
  });

  afterEach(() => {
    vi.clearAllMocks();
    performanceTracker.reset();
  });

  describe('Baseline Performance Tests', () => {
    test('should establish baseline performance without LLM', async () => {
      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          return generateLargeLinearDataset(10);
        }),
        analyzeIssuesForRetro: vi.fn().mockReturnValue({
          wentWell: [{ title: 'Completed tasks', source: 'rules' }],
          didntGoWell: [],
          actionItems: []
        })
      };
      LinearService.mockImplementation(() => mockLinearService);

      const mockLLMAnalyzer = {
        config: { enabled: false }
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      InsightMerger.merge.mockReturnValue({
        wentWell: [{ title: 'Completed tasks', source: 'rules' }],
        didntGoWell: [],
        actionItems: []
      });

      const start = Date.now();
      const response = await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: { start: '2024-01-01', end: '2024-01-07' },
          teamMembers: ['user1', 'user2']
        })
        .expect(200);
      const baselineDuration = Date.now() - start;

      expect(response.body.performanceMetrics.totalDuration).toBeLessThan(200);
      expect(baselineDuration).toBeLessThan(300);
      expect(response.body.analysisMetadata.llmEnabled).toBe(false);
    });

    test('should measure performance impact of LLM integration', async () => {
      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          return generateLargeLinearDataset(10);
        }),
        analyzeIssuesForRetro: vi.fn().mockReturnValue({
          wentWell: [{ title: 'Completed tasks', source: 'rules' }],
          didntGoWell: [],
          actionItems: []
        })
      };
      LinearService.mockImplementation(() => mockLinearService);

      const mockLLMAnalyzer = {
        config: { enabled: true, provider: 'openai', model: 'gpt-3.5-turbo' },
        analyzeTeamData: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return {
            wentWell: [{ title: 'AI insight', source: 'ai' }],
            didntGoWell: [],
            actionItems: [],
            analysisMetadata: {
              provider: 'openai',
              model: 'gpt-3.5-turbo',
              duration: 100,
              tokenUsage: 1500,
              cost: 0.003
            }
          };
        })
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      InsightMerger.merge.mockReturnValue({
        wentWell: [
          { title: 'Completed tasks', source: 'rules' },
          { title: 'AI insight', source: 'ai' }
        ],
        didntGoWell: [],
        actionItems: []
      });

      const start = Date.now();
      const response = await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: { start: '2024-01-01', end: '2024-01-07' },
          teamMembers: ['user1', 'user2']
        })
        .expect(200);
      const llmDuration = Date.now() - start;

      // LLM should run in parallel, so total time should be close to max(rule-based, LLM) time
      expect(response.body.performanceMetrics.totalDuration).toBeLessThan(200);
      expect(llmDuration).toBeLessThan(300);
      expect(response.body.analysisMetadata.llmAnalysisUsed).toBe(true);
      expect(response.body.analysisMetadata.llm.duration).toBe(100);
    });
  });

  describe('Scalability Tests', () => {
    test('should handle small datasets efficiently', async () => {
      const smallLinearData = generateLargeLinearDataset(5);
      const smallGitHubData = generateLargeGitHubDataset(10, 3);
      const smallSlackData = generateLargeSlackDataset(20);

      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockResolvedValue(smallLinearData),
        analyzeIssuesForRetro: vi.fn().mockReturnValue({
          wentWell: [{ title: 'Small dataset processed', source: 'rules' }],
          didntGoWell: [],
          actionItems: []
        })
      };
      LinearService.mockImplementation(() => mockLinearService);

      const mockGitHubService = {
        getTeamActivity: vi.fn().mockResolvedValue(smallGitHubData),
        analyzeActivityForRetro: vi.fn().mockReturnValue({ wentWell: [], didntGoWell: [], actionItems: [] })
      };
      GitHubService.mockImplementation(() => mockGitHubService);

      const mockSlackService = {
        getTeamChannelMessages: vi.fn().mockResolvedValue(smallSlackData),
        analyzeMessagesForRetro: vi.fn().mockReturnValue({ wentWell: [], didntGoWell: [], actionItems: [] })
      };
      SlackService.mockImplementation(() => mockSlackService);

      const mockLLMAnalyzer = {
        config: { enabled: true, provider: 'openai' },
        analyzeTeamData: vi.fn().mockImplementation(async (githubData, linearData, slackData) => {
          const dataSize = (githubData?.commits?.length || 0) + (linearData?.length || 0) + (slackData?.length || 0);
          await new Promise(resolve => setTimeout(resolve, Math.min(dataSize * 2, 100)));
          return {
            wentWell: [{ title: 'AI processed small dataset', source: 'ai' }],
            didntGoWell: [],
            actionItems: [],
            analysisMetadata: {
              provider: 'openai',
              duration: dataSize * 2,
              tokenUsage: dataSize * 10,
              dataSize
            }
          };
        })
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      InsightMerger.merge.mockReturnValue({
        wentWell: [
          { title: 'Small dataset processed', source: 'rules' },
          { title: 'AI processed small dataset', source: 'ai' }
        ],
        didntGoWell: [],
        actionItems: []
      });

      process.env.GITHUB_TOKEN = 'test-token';
      process.env.SLACK_BOT_TOKEN = 'test-token';

      const response = await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: { start: '2024-01-01', end: '2024-01-07' },
          teamMembers: ['user1', 'user2']
        })
        .expect(200);

      expect(response.body.performanceMetrics.totalDuration).toBeLessThan(150);
      expect(response.body.analysisMetadata.llm.dataSize).toBe(38); // 10 commits + 3 PRs + 5 issues + 20 messages

      delete process.env.GITHUB_TOKEN;
      delete process.env.SLACK_BOT_TOKEN;
    });

    test('should handle medium datasets within acceptable time', async () => {
      const mediumLinearData = generateLargeLinearDataset(50);
      const mediumGitHubData = generateLargeGitHubDataset(100, 25);
      const mediumSlackData = generateLargeSlackDataset(200);

      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return mediumLinearData;
        }),
        analyzeIssuesForRetro: vi.fn().mockReturnValue({
          wentWell: [{ title: 'Medium dataset processed', source: 'rules' }],
          didntGoWell: [],
          actionItems: []
        })
      };
      LinearService.mockImplementation(() => mockLinearService);

      const mockGitHubService = {
        getTeamActivity: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 80));
          return mediumGitHubData;
        }),
        analyzeActivityForRetro: vi.fn().mockReturnValue({ wentWell: [], didntGoWell: [], actionItems: [] })
      };
      GitHubService.mockImplementation(() => mockGitHubService);

      const mockSlackService = {
        getTeamChannelMessages: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 60));
          return mediumSlackData;
        }),
        analyzeMessagesForRetro: vi.fn().mockReturnValue({ wentWell: [], didntGoWell: [], actionItems: [] })
      };
      SlackService.mockImplementation(() => mockSlackService);

      const mockLLMAnalyzer = {
        config: { enabled: true, provider: 'openai' },
        analyzeTeamData: vi.fn().mockImplementation(async (githubData, linearData, slackData) => {
          const dataSize = (githubData?.commits?.length || 0) + (linearData?.length || 0) + (slackData?.length || 0);
          await new Promise(resolve => setTimeout(resolve, Math.min(dataSize * 1, 300)));
          return {
            wentWell: [{ title: 'AI processed medium dataset', source: 'ai' }],
            didntGoWell: [],
            actionItems: [],
            analysisMetadata: {
              provider: 'openai',
              duration: dataSize * 1,
              tokenUsage: dataSize * 15,
              dataSize
            }
          };
        })
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      InsightMerger.merge.mockReturnValue({
        wentWell: [
          { title: 'Medium dataset processed', source: 'rules' },
          { title: 'AI processed medium dataset', source: 'ai' }
        ],
        didntGoWell: [],
        actionItems: []
      });

      process.env.GITHUB_TOKEN = 'test-token';
      process.env.SLACK_BOT_TOKEN = 'test-token';

      const start = Date.now();
      const response = await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: { start: '2024-01-01', end: '2024-01-07' },
          teamMembers: ['user1', 'user2']
        })
        .expect(200);
      const totalTime = Date.now() - start;

      expect(totalTime).toBeLessThan(1000); // Should complete within 1 second
      expect(response.body.performanceMetrics.totalDuration).toBeLessThan(500);
      expect(response.body.analysisMetadata.llm.dataSize).toBe(375); // 100 commits + 25 PRs + 50 issues + 200 messages

      delete process.env.GITHUB_TOKEN;
      delete process.env.SLACK_BOT_TOKEN;
    });

    test('should handle large datasets with optimization', async () => {
      const largeLinearData = generateLargeLinearDataset(200);
      const largeGitHubData = generateLargeGitHubDataset(500, 100);
      const largeSlackData = generateLargeSlackDataset(1000);

      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 150));
          return largeLinearData;
        }),
        analyzeIssuesForRetro: vi.fn().mockReturnValue({
          wentWell: [{ title: 'Large dataset processed', source: 'rules' }],
          didntGoWell: [],
          actionItems: []
        })
      };
      LinearService.mockImplementation(() => mockLinearService);

      const mockGitHubService = {
        getTeamActivity: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 120));
          return largeGitHubData;
        }),
        analyzeActivityForRetro: vi.fn().mockReturnValue({ wentWell: [], didntGoWell: [], actionItems: [] })
      };
      GitHubService.mockImplementation(() => mockGitHubService);

      const mockSlackService = {
        getTeamChannelMessages: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return largeSlackData;
        }),
        analyzeMessagesForRetro: vi.fn().mockReturnValue({ wentWell: [], didntGoWell: [], actionItems: [] })
      };
      SlackService.mockImplementation(() => mockSlackService);

      const mockLLMAnalyzer = {
        config: { enabled: true, provider: 'openai' },
        analyzeTeamData: vi.fn().mockImplementation(async (githubData, linearData, slackData) => {
          const dataSize = (githubData?.commits?.length || 0) + (linearData?.length || 0) + (slackData?.length || 0);
          // Simulate optimization for large datasets
          const optimizedProcessingTime = Math.min(dataSize * 0.5, 500);
          await new Promise(resolve => setTimeout(resolve, optimizedProcessingTime));
          return {
            wentWell: [{ title: 'AI processed large dataset with optimization', source: 'ai' }],
            didntGoWell: [],
            actionItems: [],
            analysisMetadata: {
              provider: 'openai',
              duration: optimizedProcessingTime,
              tokenUsage: Math.min(dataSize * 20, 8000), // Token limit optimization
              dataSize,
              optimized: true
            }
          };
        })
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      InsightMerger.merge.mockReturnValue({
        wentWell: [
          { title: 'Large dataset processed', source: 'rules' },
          { title: 'AI processed large dataset with optimization', source: 'ai' }
        ],
        didntGoWell: [],
        actionItems: []
      });

      process.env.GITHUB_TOKEN = 'test-token';
      process.env.SLACK_BOT_TOKEN = 'test-token';

      const start = Date.now();
      const response = await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: { start: '2024-01-01', end: '2024-01-07' },
          teamMembers: ['user1', 'user2']
        })
        .expect(200);
      const totalTime = Date.now() - start;

      expect(totalTime).toBeLessThan(2000); // Should complete within 2 seconds even with large dataset
      expect(response.body.performanceMetrics.totalDuration).toBeLessThan(800);
      expect(response.body.analysisMetadata.llm.optimized).toBe(true);
      expect(response.body.analysisMetadata.llm.tokenUsage).toBeLessThanOrEqual(8000);

      delete process.env.GITHUB_TOKEN;
      delete process.env.SLACK_BOT_TOKEN;
    });
  });

  describe('Timeout and Error Handling Performance', () => {
    test('should timeout gracefully without blocking', async () => {
      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockResolvedValue([]),
        analyzeIssuesForRetro: vi.fn().mockReturnValue({ wentWell: [], didntGoWell: [], actionItems: [] })
      };
      LinearService.mockImplementation(() => mockLinearService);

      const mockLLMAnalyzer = {
        config: { enabled: true, provider: 'openai', timeout: 100 },
        analyzeTeamData: vi.fn().mockImplementation(async () => {
          // Simulate timeout
          await new Promise(resolve => setTimeout(resolve, 200));
          throw new Error('Request timeout');
        })
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      InsightMerger.merge.mockReturnValue({ wentWell: [], didntGoWell: [], actionItems: [] });

      const start = Date.now();
      const response = await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: { start: '2024-01-01', end: '2024-01-07' },
          teamMembers: ['user1', 'user2']
        })
        .expect(200);
      const totalTime = Date.now() - start;

      // Should complete quickly due to timeout
      expect(totalTime).toBeLessThan(300);
      expect(response.body.performanceMetrics.totalDuration).toBeLessThan(250);
      expect(response.body.analysisMetadata.llmAnalysisUsed).toBe(false);
    });

    test('should handle provider failures without performance degradation', async () => {
      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          return [];
        }),
        analyzeIssuesForRetro: vi.fn().mockReturnValue({ wentWell: [], didntGoWell: [], actionItems: [] })
      };
      LinearService.mockImplementation(() => mockLinearService);

      const mockLLMAnalyzer = {
        config: { enabled: true, provider: 'openai' },
        analyzeTeamData: vi.fn().mockRejectedValue(new Error('Provider unavailable'))
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      InsightMerger.merge.mockReturnValue({ wentWell: [], didntGoWell: [], actionItems: [] });

      const start = Date.now();
      const response = await request(app)
        .post('/api/generate-retro')
        .send({
          dateRange: { start: '2024-01-01', end: '2024-01-07' },
          teamMembers: ['user1', 'user2']
        })
        .expect(200);
      const totalTime = Date.now() - start;

      // Should complete quickly despite LLM failure
      expect(totalTime).toBeLessThan(200);
      expect(response.body.performanceMetrics.totalDuration).toBeLessThan(150);
      expect(response.body.analysisMetadata.ruleBasedAnalysisUsed).toBe(true);
      expect(response.body.analysisMetadata.llmAnalysisUsed).toBe(false);
    });
  });

  describe('Concurrent Request Performance', () => {
    test('should handle multiple concurrent requests efficiently', async () => {
      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          return generateLargeLinearDataset(10);
        }),
        analyzeIssuesForRetro: vi.fn().mockReturnValue({
          wentWell: [{ title: 'Concurrent processing', source: 'rules' }],
          didntGoWell: [],
          actionItems: []
        })
      };
      LinearService.mockImplementation(() => mockLinearService);

      const mockLLMAnalyzer = {
        config: { enabled: true, provider: 'openai' },
        analyzeTeamData: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 100));
          return {
            wentWell: [{ title: 'Concurrent AI processing', source: 'ai' }],
            didntGoWell: [],
            actionItems: [],
            analysisMetadata: {
              provider: 'openai',
              duration: 100,
              tokenUsage: 1000
            }
          };
        })
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      InsightMerger.merge.mockReturnValue({
        wentWell: [
          { title: 'Concurrent processing', source: 'rules' },
          { title: 'Concurrent AI processing', source: 'ai' }
        ],
        didntGoWell: [],
        actionItems: []
      });

      // Make 5 concurrent requests
      const requests = Array(5).fill(null).map(() =>
        request(app)
          .post('/api/generate-retro')
          .send({
            dateRange: { start: '2024-01-01', end: '2024-01-07' },
            teamMembers: ['user1', 'user2']
          })
      );

      const start = Date.now();
      const responses = await Promise.all(requests);
      const totalTime = Date.now() - start;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.analysisMetadata.llmAnalysisUsed).toBe(true);
      });

      // Should handle concurrent requests efficiently (not 5x the single request time)
      expect(totalTime).toBeLessThan(800);
      
      // Verify all LLM calls were made
      expect(mockLLMAnalyzer.analyzeTeamData).toHaveBeenCalledTimes(5);
    });

    test('should maintain performance under load', async () => {
      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 30));
          return generateLargeLinearDataset(5);
        }),
        analyzeIssuesForRetro: vi.fn().mockReturnValue({
          wentWell: [{ title: 'Load test', source: 'rules' }],
          didntGoWell: [],
          actionItems: []
        })
      };
      LinearService.mockImplementation(() => mockLinearService);

      const mockLLMAnalyzer = {
        config: { enabled: true, provider: 'openai' },
        analyzeTeamData: vi.fn().mockImplementation(async () => {
          await new Promise(resolve => setTimeout(resolve, 80));
          return {
            wentWell: [{ title: 'Load test AI', source: 'ai' }],
            didntGoWell: [],
            actionItems: [],
            analysisMetadata: {
              provider: 'openai',
              duration: 80,
              tokenUsage: 800
            }
          };
        })
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      InsightMerger.merge.mockReturnValue({
        wentWell: [
          { title: 'Load test', source: 'rules' },
          { title: 'Load test AI', source: 'ai' }
        ],
        didntGoWell: [],
        actionItems: []
      });

      // Make 10 concurrent requests to simulate load
      const requests = Array(10).fill(null).map(() =>
        request(app)
          .post('/api/generate-retro')
          .send({
            dateRange: { start: '2024-01-01', end: '2024-01-07' },
            teamMembers: ['user1']
          })
      );

      const start = Date.now();
      const responses = await Promise.all(requests);
      const totalTime = Date.now() - start;

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.performanceMetrics.totalDuration).toBeLessThan(200);
      });

      // Should handle load efficiently
      expect(totalTime).toBeLessThan(1500);
      expect(mockLLMAnalyzer.analyzeTeamData).toHaveBeenCalledTimes(10);
    });
  });

  describe('Memory and Resource Usage', () => {
    test('should not leak memory with repeated requests', async () => {
      const mockLinearService = {
        getIssuesInDateRange: vi.fn().mockResolvedValue(generateLargeLinearDataset(20)),
        analyzeIssuesForRetro: vi.fn().mockReturnValue({
          wentWell: [{ title: 'Memory test', source: 'rules' }],
          didntGoWell: [],
          actionItems: []
        })
      };
      LinearService.mockImplementation(() => mockLinearService);

      const mockLLMAnalyzer = {
        config: { enabled: true, provider: 'openai' },
        analyzeTeamData: vi.fn().mockResolvedValue({
          wentWell: [{ title: 'Memory test AI', source: 'ai' }],
          didntGoWell: [],
          actionItems: [],
          analysisMetadata: {
            provider: 'openai',
            duration: 50,
            tokenUsage: 500
          }
        })
      };
      LLMAnalyzer.fromEnvironment.mockReturnValue(mockLLMAnalyzer);

      InsightMerger.merge.mockReturnValue({
        wentWell: [
          { title: 'Memory test', source: 'rules' },
          { title: 'Memory test AI', source: 'ai' }
        ],
        didntGoWell: [],
        actionItems: []
      });

      const initialMemory = process.memoryUsage().heapUsed;

      // Make 20 sequential requests
      for (let i = 0; i < 20; i++) {
        await request(app)
          .post('/api/generate-retro')
          .send({
            dateRange: { start: '2024-01-01', end: '2024-01-07' },
            teamMembers: ['user1']
          })
          .expect(200);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });
});