/**
 * Integration tests for ReleaseNotesService with LLM integration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import ReleaseNotesService from '../services/ReleaseNotesService.js';

// Mock the LLM analyzer
vi.mock('../services/llm/ReleaseNotesAnalyzer.js', () => ({
  ReleaseNotesAnalyzer: {
    fromEnvironment: vi.fn(() => ({
      config: { enabled: true, provider: 'openai', model: 'gpt-4' },
      analyzeForReleaseNotes: vi.fn(async () => ({
        categorizedChanges: {
          newFeatures: [
            {
              title: 'New Analytics Dashboard',
              description: 'View your data insights in a beautiful new dashboard',
              userValue: 'Better understanding of your data trends',
              confidence: 0.9,
              category: 'newFeatures'
            }
          ],
          improvements: [
            {
              title: 'Faster Page Loading',
              description: 'Pages now load 50% faster for better user experience',
              userValue: 'Reduced waiting time and improved productivity',
              confidence: 0.85,
              category: 'improvements'
            }
          ],
          fixes: [
            {
              title: 'Login Issue Resolved',
              description: 'Fixed issue where users couldn\'t log in with special characters',
              userValue: 'More reliable access to your account',
              confidence: 0.95,
              category: 'fixes'
            }
          ]
        },
        metadata: {
          provider: 'openai',
          model: 'gpt-4',
          duration: 1500,
          analysisType: 'release-notes'
        }
      })),
      getStatus: vi.fn(() => ({
        enabled: true,
        provider: 'openai',
        model: 'gpt-4'
      }))
    }))
  }
}));

// Mock the data services
vi.mock('../services/githubService.js', () => ({
  default: class MockGitHubService {
    async getTeamActivity() {
      return {
        commits: [
          {
            sha: 'abc123',
            commit: {
              message: 'Add analytics dashboard feature',
              author: { date: '2024-01-15T10:00:00Z' }
            }
          }
        ],
        pullRequests: [
          {
            id: 1,
            title: 'Feature: Analytics Dashboard',
            body: 'Adds new analytics dashboard for users',
            merged_at: '2024-01-15T12:00:00Z',
            additions: 150,
            deletions: 20
          }
        ]
      };
    }
  }
}));

vi.mock('../services/linearService.js', () => ({
  default: class MockLinearService {
    async getIssuesInDateRange() {
      return [
        {
          id: 'LIN-123',
          title: 'Implement analytics dashboard',
          description: 'Create dashboard for user analytics',
          state: { name: 'Done', type: 'completed' },
          updatedAt: '2024-01-15T14:00:00Z',
          priority: 3
        }
      ];
    }
  }
}));

vi.mock('../services/slackService.js', () => ({
  default: class MockSlackService {
    async getTeamChannelMessages() {
      return [
        {
          ts: '1705320000.123456',
          text: 'Shipped the new analytics dashboard! Users love it.',
          channel: 'general'
        }
      ];
    }
  }
}));

describe('ReleaseNotesService LLM Integration', () => {
  let service;
  let mockDateRange;

  beforeEach(() => {
    // Set up environment to enable LLM
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.LLM_PROVIDER = 'openai';
    process.env.LLM_MODEL = 'gpt-4';
    process.env.LLM_ENABLED = 'true';

    service = new ReleaseNotesService({
      githubToken: 'test-github-token',
      linearApiKey: 'test-linear-key',
      slackBotToken: 'test-slack-token'
    });

    mockDateRange = {
      start: '2024-01-01',
      end: '2024-01-31'
    };
  });

  describe('LLM-enhanced release notes generation', () => {
    it('should use LLM analyzer when available', async () => {
      const result = await service.generateReleaseNotes(mockDateRange);

      expect(result).toBeDefined();
      expect(result.metadata.generationMethod).toBe('llm-enhanced');
      expect(result.metadata.aiGenerated).toBeGreaterThan(0);
      expect(result.metadata.llmProvider).toBe('openai');
      expect(result.metadata.llmModel).toBe('gpt-4');
    });

    it('should generate categorized changes using LLM', async () => {
      const result = await service.generateReleaseNotes(mockDateRange);

      expect(result.entries.newFeatures).toHaveLength(1);
      expect(result.entries.improvements).toHaveLength(1);
      expect(result.entries.fixes).toHaveLength(1);

      // Verify LLM-generated content
      expect(result.entries.newFeatures[0].title).toBe('New Analytics Dashboard');
      expect(result.entries.newFeatures[0].userValue).toBe('Better understanding of your data trends');
      
      expect(result.entries.improvements[0].title).toBe('Faster Page Loading');
      expect(result.entries.improvements[0].userValue).toBe('Reduced waiting time and improved productivity');
      
      expect(result.entries.fixes[0].title).toBe('Login Issue Resolved');
      expect(result.entries.fixes[0].userValue).toBe('More reliable access to your account');
    });

    it('should include LLM metadata in the result', async () => {
      const result = await service.generateReleaseNotes(mockDateRange);

      expect(result.metadata).toMatchObject({
        generationMethod: 'llm-enhanced',
        llmProvider: 'openai',
        llmModel: 'gpt-4',
        analysisTime: expect.any(Number)
      });
    });

    it('should fall back to rule-based analysis if LLM fails', async () => {
      // Mock LLM failure
      service.llmAnalyzer.analyzeForReleaseNotes = vi.fn().mockRejectedValue(new Error('LLM failed'));

      const result = await service.generateReleaseNotes(mockDateRange);

      expect(result).toBeDefined();
      expect(result.metadata.generationMethod).toBe('rule-based');
      expect(result.metadata.aiGenerated).toBe(0);
    });

    it('should include LLM status in service status', () => {
      const status = service.getServiceStatus();

      expect(status.llmAnalyzer).toBe(true);
      expect(status.llmStatus).toBeDefined();
      expect(status.llmStatus.enabled).toBe(true);
      expect(status.llmStatus.provider).toBe('openai');
    });
  });

  describe('LLM analyzer initialization', () => {
    it('should initialize LLM analyzer when environment is configured', () => {
      expect(service.llmAnalyzer).toBeDefined();
      expect(service.llmAnalyzer.config.enabled).toBe(true);
    });

    it('should handle LLM analyzer initialization failure gracefully', async () => {
      // Import and mock the analyzer to throw an error
      const { ReleaseNotesAnalyzer } = await import('../services/llm/ReleaseNotesAnalyzer.js');
      const originalFromEnvironment = ReleaseNotesAnalyzer.fromEnvironment;
      
      ReleaseNotesAnalyzer.fromEnvironment = vi.fn(() => {
        throw new Error('Failed to initialize');
      });

      const serviceWithFailedLLM = new ReleaseNotesService({
        githubToken: 'test-token'
      });

      expect(serviceWithFailedLLM.llmAnalyzer).toBeNull();
      
      // Restore original function
      ReleaseNotesAnalyzer.fromEnvironment = originalFromEnvironment;
    });
  });

  describe('Hybrid analysis workflow', () => {
    it('should combine LLM insights with rule-based fallbacks', async () => {
      // Mock partial LLM failure (returns some results but not complete)
      service.llmAnalyzer.analyzeForReleaseNotes = vi.fn(async () => ({
        categorizedChanges: {
          newFeatures: [
            {
              title: 'New Feature from LLM',
              description: 'LLM-generated description',
              confidence: 0.9
            }
          ],
          improvements: [], // Empty - should not cause issues
          fixes: []
        },
        metadata: {
          provider: 'openai',
          model: 'gpt-4',
          duration: 1000
        }
      }));

      const result = await service.generateReleaseNotes(mockDateRange);

      expect(result).toBeDefined();
      expect(result.entries.newFeatures).toHaveLength(1);
      expect(result.metadata.generationMethod).toBe('llm-enhanced');
    });

    it('should handle empty LLM results gracefully', async () => {
      // Mock LLM returning empty results
      service.llmAnalyzer.analyzeForReleaseNotes = vi.fn(async () => ({
        categorizedChanges: {
          newFeatures: [],
          improvements: [],
          fixes: []
        },
        metadata: {
          provider: 'openai',
          model: 'gpt-4',
          duration: 500
        }
      }));

      const result = await service.generateReleaseNotes(mockDateRange);

      expect(result).toBeDefined();
      expect(result.entries.newFeatures).toHaveLength(0);
      expect(result.entries.improvements).toHaveLength(0);
      expect(result.entries.fixes).toHaveLength(0);
      expect(result.metadata.generationMethod).toBe('llm-enhanced');
    });
  });
});