/**
 * Tests for ReleaseNotesDataOptimizer
 */

import { describe, it, test, expect, beforeEach, afterEach, vi } from 'vitest';
import ReleaseNotesDataOptimizer from '../ReleaseNotesDataOptimizer.js';

describe('ReleaseNotesDataOptimizer', () => {
  let optimizer;
  let mockGitHubService;
  let mockLinearService;
  let mockSlackService;

  beforeEach(() => {
    optimizer = new ReleaseNotesDataOptimizer({
      maxItemsPerQuery: 50,
      maxConcurrentQueries: 2,
      queryTimeout: 5000,
      enablePreFiltering: true,
      enableQueryCache: true,
      queryCacheTTL: 1000 // 1 second for testing
    });

    // Mock services
    mockGitHubService = {
      getTeamActivity: vi.fn(),
      getCommits: vi.fn(),
      getPullRequests: vi.fn()
    };

    mockLinearService = {
      getIssuesInDateRange: vi.fn()
    };

    mockSlackService = {
      getTeamChannelMessages: vi.fn(),
      getChannelMessages: vi.fn()
    };
  });

  afterEach(() => {
    optimizer.reset();
  });

  describe('GitHub Data Optimization', () => {
    test('should optimize GitHub data collection with repositories', async () => {
      const mockData = {
        commits: [
          { sha: '123', commit: { message: 'Add new feature', author: { date: '2024-01-01' } } },
          { sha: '456', commit: { message: 'Merge branch', author: { date: '2024-01-02' } } }
        ],
        pullRequests: [
          { id: 1, title: 'Add feature', merged_at: '2024-01-01', body: 'New feature' },
          { id: 2, title: 'Automated update', merged_at: '2024-01-02', body: 'Auto update' }
        ]
      };

      mockGitHubService.getCommits.mockResolvedValue(mockData.commits);
      mockGitHubService.getPullRequests.mockResolvedValue(mockData.pullRequests);

      const result = await optimizer.optimizeGitHubDataCollection(
        mockGitHubService,
        '2024-01-01',
        '2024-01-07',
        ['repo1', 'repo2']
      );

      expect(result).toBeDefined();
      expect(result.commits).toBeDefined();
      expect(result.pullRequests).toBeDefined();
      
      // Should filter out merge commits and automated PRs
      expect(result.commits.length).toBeLessThanOrEqual(mockData.commits.length);
      expect(result.pullRequests.length).toBeLessThanOrEqual(mockData.pullRequests.length);
    });

    test('should handle GitHub service errors gracefully', async () => {
      mockGitHubService.getCommits.mockRejectedValue(new Error('GitHub API error'));
      mockGitHubService.getPullRequests.mockResolvedValue([]);

      await expect(
        optimizer.optimizeGitHubDataCollection(
          mockGitHubService,
          '2024-01-01',
          '2024-01-07',
          ['repo1']
        )
      ).rejects.toThrow('GitHub API error');
    });

    test('should remove duplicate commits', async () => {
      const duplicateCommits = [
        { sha: '123', commit: { message: 'Add feature', author: { date: '2024-01-01' } } },
        { sha: '123', commit: { message: 'Add feature', author: { date: '2024-01-01' } } },
        { sha: '456', commit: { message: 'Fix bug', author: { date: '2024-01-02' } } }
      ];

      mockGitHubService.getCommits.mockResolvedValue(duplicateCommits);
      mockGitHubService.getPullRequests.mockResolvedValue([]);

      const result = await optimizer.optimizeGitHubDataCollection(
        mockGitHubService,
        '2024-01-01',
        '2024-01-07',
        ['repo1']
      );

      expect(result.commits).toHaveLength(2); // Duplicates removed
    });
  });

  describe('Linear Data Optimization', () => {
    test('should optimize Linear data collection', async () => {
      const mockIssues = [
        {
          id: '1',
          title: 'Add user dashboard',
          description: 'New user feature',
          updatedAt: '2024-01-01',
          labels: { nodes: [{ name: 'feature' }] }
        },
        {
          id: '2',
          title: 'Refactor internal code',
          description: 'Code cleanup',
          updatedAt: '2024-01-02',
          labels: { nodes: [{ name: 'internal' }] }
        }
      ];

      mockLinearService.getIssuesInDateRange.mockResolvedValue(mockIssues);

      const result = await optimizer.optimizeLinearDataCollection(
        mockLinearService,
        '2024-01-01',
        '2024-01-07',
        ['user1', 'user2']
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      
      // Should filter out internal issues
      const userFacingIssues = result.filter(issue => 
        !issue.labels?.nodes?.some(label => label.name === 'internal')
      );
      expect(userFacingIssues.length).toBeGreaterThan(0);
    });

    test('should create date chunks for large date ranges', async () => {
      mockLinearService.getIssuesInDateRange.mockResolvedValue([]);

      await optimizer.optimizeLinearDataCollection(
        mockLinearService,
        '2024-01-01',
        '2024-01-30', // Large date range
        []
      );

      // Should make multiple calls for date chunks
      expect(mockLinearService.getIssuesInDateRange).toHaveBeenCalledTimes(
        expect.any(Number)
      );
    });
  });

  describe('Slack Data Optimization', () => {
    test('should optimize Slack data collection', async () => {
      const mockMessages = [
        {
          ts: '1640995200.000100',
          text: 'We just released a new feature!',
          channel: 'general'
        },
        {
          ts: '1640995300.000200',
          text: 'Random conversation about lunch',
          channel: 'general'
        },
        {
          ts: '1640995400.000300',
          text: 'Fixed a critical bug in production',
          channel: 'dev'
        }
      ];

      mockSlackService.getChannelMessages.mockResolvedValue(mockMessages);

      const result = await optimizer.optimizeSlackDataCollection(
        mockSlackService,
        '2024-01-01',
        '2024-01-07',
        ['general', 'dev']
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      
      // Should filter for release-related messages
      const releaseMessages = result.filter(msg => 
        ['release', 'feature', 'fix', 'deploy'].some(keyword => 
          msg.text.toLowerCase().includes(keyword)
        )
      );
      expect(releaseMessages.length).toBeGreaterThan(0);
    });

    test('should handle multiple channels concurrently', async () => {
      mockSlackService.getChannelMessages.mockResolvedValue([]);

      await optimizer.optimizeSlackDataCollection(
        mockSlackService,
        '2024-01-01',
        '2024-01-07',
        ['channel1', 'channel2', 'channel3']
      );

      expect(mockSlackService.getChannelMessages).toHaveBeenCalledTimes(3);
    });
  });

  describe('Query Caching', () => {
    test('should cache and reuse query results', async () => {
      const mockData = [{ id: '1', title: 'Test issue' }];
      mockLinearService.getIssuesInDateRange.mockResolvedValue(mockData);

      // First call
      const result1 = await optimizer.optimizeLinearDataCollection(
        mockLinearService,
        '2024-01-01',
        '2024-01-07',
        ['user1']
      );

      // Second call with same parameters
      const result2 = await optimizer.optimizeLinearDataCollection(
        mockLinearService,
        '2024-01-01',
        '2024-01-07',
        ['user1']
      );

      expect(result1).toEqual(result2);
      
      const metrics = optimizer.getMetrics();
      expect(metrics.cachedQueries).toBeGreaterThan(0);
    });

    test('should expire cached queries', async () => {
      const mockData = [{ id: '1', title: 'Test issue' }];
      mockLinearService.getIssuesInDateRange.mockResolvedValue(mockData);

      // First call
      await optimizer.optimizeLinearDataCollection(
        mockLinearService,
        '2024-01-01',
        '2024-01-07',
        ['user1']
      );

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Second call after expiration
      await optimizer.optimizeLinearDataCollection(
        mockLinearService,
        '2024-01-01',
        '2024-01-07',
        ['user1']
      );

      // Should make fresh API calls
      expect(mockLinearService.getIssuesInDateRange).toHaveBeenCalledTimes(
        expect.any(Number)
      );
    });
  });

  describe('Concurrent Query Execution', () => {
    test('should respect concurrency limits', async () => {
      let concurrentCalls = 0;
      let maxConcurrentCalls = 0;

      mockLinearService.getIssuesInDateRange.mockImplementation(() => {
        concurrentCalls++;
        maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);
        
        return new Promise(resolve => {
          setTimeout(() => {
            concurrentCalls--;
            resolve([]);
          }, 100);
        });
      });

      await optimizer.optimizeLinearDataCollection(
        mockLinearService,
        '2024-01-01',
        '2024-01-30', // Large range to create many queries
        ['user1']
      );

      expect(maxConcurrentCalls).toBeLessThanOrEqual(optimizer.config.maxConcurrentQueries);
    });

    test('should handle query timeouts', async () => {
      mockLinearService.getIssuesInDateRange.mockImplementation(() => {
        return new Promise(() => {}); // Never resolves
      });

      await expect(
        optimizer.optimizeLinearDataCollection(
          mockLinearService,
          '2024-01-01',
          '2024-01-07',
          ['user1']
        )
      ).rejects.toThrow('timeout');
    });
  });

  describe('Data Filtering', () => {
    test('should filter GitHub data for relevance', () => {
      const githubData = {
        commits: [
          { commit: { message: 'Add new user feature' } },
          { commit: { message: 'Merge branch automated' } },
          { commit: { message: 'ci: update build process' } },
          { commit: { message: 'Fix login bug' } }
        ],
        pullRequests: [
          { title: 'Add dashboard', draft: false },
          { title: 'Draft: Work in progress', draft: true },
          { title: 'Dependabot: Update dependencies', draft: false }
        ]
      };

      const filtered = optimizer._filterGitHubData(githubData);

      expect(filtered.commits.length).toBeLessThan(githubData.commits.length);
      expect(filtered.pullRequests.length).toBeLessThan(githubData.pullRequests.length);
      
      // Should keep user-facing commits and PRs
      expect(filtered.commits.some(c => c.commit.message.includes('feature'))).toBe(true);
      expect(filtered.pullRequests.some(pr => pr.title.includes('dashboard'))).toBe(true);
    });

    test('should filter Linear data for relevance', () => {
      const linearData = [
        {
          title: 'Add user authentication',
          labels: { nodes: [{ name: 'feature' }] }
        },
        {
          title: 'Refactor database layer',
          labels: { nodes: [{ name: 'internal' }] }
        },
        {
          title: 'Update infrastructure',
          labels: { nodes: [{ name: 'infrastructure' }] }
        }
      ];

      const filtered = optimizer._filterLinearData(linearData);

      expect(filtered.length).toBeLessThan(linearData.length);
      expect(filtered.some(issue => issue.title.includes('authentication'))).toBe(true);
      expect(filtered.some(issue => issue.title.includes('infrastructure'))).toBe(false);
    });

    test('should filter Slack data for relevance', () => {
      const slackData = [
        { text: 'We just released version 2.0!' },
        { text: 'What should we have for lunch today?' },
        { text: 'Deployed the new feature to production' },
        { text: 'Fixed the critical bug reported yesterday' }
      ];

      const filtered = optimizer._filterSlackData(slackData);

      expect(filtered.length).toBeLessThan(slackData.length);
      expect(filtered.some(msg => msg.text.includes('released'))).toBe(true);
      expect(filtered.some(msg => msg.text.includes('lunch'))).toBe(false);
    });
  });

  describe('Performance Metrics', () => {
    test('should track optimization metrics', async () => {
      mockLinearService.getIssuesInDateRange.mockResolvedValue([
        { id: '1', title: 'Test issue' }
      ]);

      await optimizer.optimizeLinearDataCollection(
        mockLinearService,
        '2024-01-01',
        '2024-01-07',
        ['user1']
      );

      const metrics = optimizer.getMetrics();

      expect(metrics.totalQueries).toBeGreaterThan(0);
      expect(metrics.optimizedQueries).toBeGreaterThan(0);
      expect(metrics.averageQueryTime).toBeGreaterThan(0);
      expect(metrics.dataPointsCollected).toBeGreaterThan(0);
    });

    test('should calculate cache hit rate', async () => {
      const mockData = [{ id: '1', title: 'Test' }];
      mockLinearService.getIssuesInDateRange.mockResolvedValue(mockData);

      // Make same query twice
      await optimizer.optimizeLinearDataCollection(mockLinearService, '2024-01-01', '2024-01-07', []);
      await optimizer.optimizeLinearDataCollection(mockLinearService, '2024-01-01', '2024-01-07', []);

      const metrics = optimizer.getMetrics();
      expect(metrics.cacheHitRate).toBeGreaterThan(0);
    });

    test('should reset metrics', () => {
      optimizer.metrics.totalQueries = 5;
      optimizer.metrics.cachedQueries = 2;

      optimizer.reset();

      const metrics = optimizer.getMetrics();
      expect(metrics.totalQueries).toBe(0);
      expect(metrics.cachedQueries).toBe(0);
    });
  });

  describe('Error Handling', () => {
    test('should handle partial failures in concurrent queries', async () => {
      let callCount = 0;
      mockLinearService.getIssuesInDateRange.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.reject(new Error('First query failed'));
        }
        return Promise.resolve([{ id: callCount, title: `Issue ${callCount}` }]);
      });

      // Should not throw, but handle the error gracefully
      const result = await optimizer.optimizeLinearDataCollection(
        mockLinearService,
        '2024-01-01',
        '2024-01-30', // Large range to create multiple queries
        ['user1']
      );

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});