/**
 * Release Notes Error Handling Tests
 * Tests comprehensive error handling, graceful degradation, and user feedback
 */

import { vi } from 'vitest';
import ReleaseNotesService from '../services/ReleaseNotesService.js';
import { ReleaseNotesErrorHandler, ReleaseNotesError } from '../services/ReleaseNotesErrorHandler.js';
import { ReleaseNotesProgressTracker } from '../services/ReleaseNotesProgressTracker.js';

// Mock the data services
vi.mock('../services/githubService.js');
vi.mock('../services/linearService.js');
vi.mock('../services/slackService.js');

describe('Release Notes Error Handling', () => {
  let releaseNotesService;
  let mockProgressTracker;

  beforeEach(() => {
    releaseNotesService = new ReleaseNotesService({
      githubToken: 'test-token',
      linearApiKey: 'test-key',
      slackBotToken: 'test-token'
    });

    mockProgressTracker = {
      startStep: vi.fn(),
      completeStep: vi.fn(),
      updateDataSourceProgress: vi.fn(),
      handleDataSourceFailure: vi.fn(),
      handleAIFailure: vi.fn(),
      fail: vi.fn()
    };
  });

  describe('ReleaseNotesErrorHandler', () => {
    test('should categorize GitHub connection errors correctly', () => {
      const error = new Error('GitHub API connection failed');
      const releaseNotesError = ReleaseNotesErrorHandler.createError(error, 'github');

      expect(releaseNotesError).toBeInstanceOf(ReleaseNotesError);
      expect(releaseNotesError.type).toBe('DATA_SOURCE_UNAVAILABLE');
      expect(releaseNotesError.details.source).toBe('github');
      expect(releaseNotesError.recoverable).toBe(true);
    });

    test('should categorize Linear API errors correctly', () => {
      const error = new Error('Linear API key invalid');
      const releaseNotesError = ReleaseNotesErrorHandler.createError(error, 'linear');

      expect(releaseNotesError.type).toBe('DATA_SOURCE_UNAVAILABLE');
      expect(releaseNotesError.details.source).toBe('linear');
    });

    test('should categorize timeout errors correctly', () => {
      const error = new Error('Request timed out after 30000ms');
      const releaseNotesError = ReleaseNotesErrorHandler.createError(error, 'data_collection');

      expect(releaseNotesError.type).toBe('TIMEOUT');
      expect(releaseNotesError.recoverable).toBe(true);
    });

    test('should provide user-friendly error messages', () => {
      const error = new Error('GitHub API rate limit exceeded');
      const releaseNotesError = ReleaseNotesErrorHandler.createError(error, 'github');
      const userFriendlyError = ReleaseNotesErrorHandler.getUserFriendlyError(releaseNotesError);

      expect(userFriendlyError.title).toBe('Data Source Unavailable');
      expect(userFriendlyError.fallback).toBe('Continue with available data sources');
      expect(userFriendlyError.actions).toContainEqual(
        expect.objectContaining({ type: 'retry' })
      );
    });

    test('should handle data source failures with graceful degradation', () => {
      const sourceErrors = [
        { details: { source: 'github' } },
        { details: { source: 'linear' } }
      ];
      const availableSources = { github: true, linear: true, slack: true };

      const result = ReleaseNotesErrorHandler.handleDataSourceFailures(sourceErrors, availableSources);

      expect(result.canContinue).toBe(true);
      expect(result.degradationInfo.workingSources).toBe(1);
      expect(result.degradationInfo.failedSources).toEqual(['github', 'linear']);
    });

    test('should prevent continuation when all sources fail', () => {
      const sourceErrors = [
        { details: { source: 'github' } },
        { details: { source: 'linear' } },
        { details: { source: 'slack' } }
      ];
      const availableSources = { github: true, linear: true, slack: true };

      const result = ReleaseNotesErrorHandler.handleDataSourceFailures(sourceErrors, availableSources);

      expect(result.canContinue).toBe(false);
      expect(result.error).toBeInstanceOf(ReleaseNotesError);
      expect(result.error.type).toBe('ALL_SOURCES_FAILED');
    });
  });

  describe('Data Source Error Handling', () => {
    test('should handle GitHub service failure gracefully', async () => {
      // Mock GitHub service to throw an error
      releaseNotesService.githubService.getTeamActivity = vi.fn().mockRejectedValue(
        new Error('GitHub API connection failed')
      );

      // Mock other services to succeed
      releaseNotesService.linearService.getIssuesInDateRange = vi.fn().mockResolvedValue([]);
      releaseNotesService.slackService.getTeamChannelMessages = vi.fn().mockResolvedValue([]);

      const dateRange = { start: '2024-01-01', end: '2024-01-07' };
      const options = { progressTracker: mockProgressTracker };

      const result = await releaseNotesService.generateReleaseNotes(dateRange, options);

      expect(result).toBeDefined();
      expect(result.metadata.errors).toBeGreaterThan(0);
      expect(result.metadata.degradationInfo).toBeDefined();
      expect(mockProgressTracker.handleDataSourceFailure).toHaveBeenCalledWith(
        'github',
        expect.any(Object)
      );
    });

    test('should handle partial data source failures', async () => {
      // Mock GitHub and Linear to fail, Slack to succeed
      releaseNotesService.githubService.getTeamActivity = vi.fn().mockRejectedValue(
        new Error('GitHub timeout')
      );
      releaseNotesService.linearService.getIssuesInDateRange = vi.fn().mockRejectedValue(
        new Error('Linear API error')
      );
      releaseNotesService.slackService.getTeamChannelMessages = vi.fn().mockResolvedValue([
        { text: 'Released new feature', ts: '1640995200' }
      ]);

      const dateRange = { start: '2024-01-01', end: '2024-01-07' };
      const options = { progressTracker: mockProgressTracker };

      const result = await releaseNotesService.generateReleaseNotes(dateRange, options);

      expect(result).toBeDefined();
      expect(result.metadata.errors).toBe(2);
      expect(result.metadata.degradationInfo.failedSources).toEqual(['github', 'linear']);
      expect(result.metadata.degradationInfo.availableSources).toEqual(['slack']);
    });

    test('should fail when all data sources are unavailable', async () => {
      // Mock all services to fail
      releaseNotesService.githubService.getTeamActivity = vi.fn().mockRejectedValue(
        new Error('GitHub unavailable')
      );
      releaseNotesService.linearService.getIssuesInDateRange = vi.fn().mockRejectedValue(
        new Error('Linear unavailable')
      );
      releaseNotesService.slackService.getTeamChannelMessages = vi.fn().mockRejectedValue(
        new Error('Slack unavailable')
      );

      const dateRange = { start: '2024-01-01', end: '2024-01-07' };
      const options = { progressTracker: mockProgressTracker };

      await expect(releaseNotesService.generateReleaseNotes(dateRange, options))
        .rejects.toThrow('No data sources are available');

      expect(mockProgressTracker.fail).toHaveBeenCalled();
    });
  });

  describe('LLM Error Handling', () => {
    test('should fallback to rule-based analysis when LLM fails', async () => {
      // Mock data services to succeed
      releaseNotesService.githubService.getTeamActivity = vi.fn().mockResolvedValue({
        commits: [{ sha: '123', commit: { message: 'Add new feature' } }]
      });
      releaseNotesService.linearService.getIssuesInDateRange = vi.fn().mockResolvedValue([]);
      releaseNotesService.slackService.getTeamChannelMessages = vi.fn().mockResolvedValue([]);

      // Mock LLM analyzer to fail
      releaseNotesService.llmAnalyzer = {
        config: { enabled: true },
        analyzeForReleaseNotes: vi.fn().mockRejectedValue(new Error('LLM API timeout'))
      };

      const dateRange = { start: '2024-01-01', end: '2024-01-07' };
      const options = { progressTracker: mockProgressTracker };

      const result = await releaseNotesService.generateReleaseNotes(dateRange, options);

      expect(result).toBeDefined();
      expect(result.metadata.generationMethod).toBe('rule-based');
      expect(mockProgressTracker.handleAIFailure).toHaveBeenCalled();
    });

    test('should retry LLM analysis on transient failures', async () => {
      // Mock data services
      releaseNotesService.githubService.getTeamActivity = vi.fn().mockResolvedValue({
        commits: [{ sha: '123', commit: { message: 'Fix bug' } }]
      });
      releaseNotesService.linearService.getIssuesInDateRange = vi.fn().mockResolvedValue([]);
      releaseNotesService.slackService.getTeamChannelMessages = vi.fn().mockResolvedValue([]);

      // Mock LLM analyzer to fail first time, succeed second time
      const mockAnalyzer = {
        config: { enabled: true },
        analyzeForReleaseNotes: vi.fn()
          .mockRejectedValueOnce(new Error('Network timeout'))
          .mockResolvedValueOnce({
            categorizedChanges: {
              newFeatures: [],
              improvements: [],
              fixes: [{ title: 'Bug fix', description: 'Fixed an issue' }]
            },
            metadata: { provider: 'openai', model: 'gpt-4', duration: 1000 }
          })
      };

      releaseNotesService.llmAnalyzer = mockAnalyzer;

      const dateRange = { start: '2024-01-01', end: '2024-01-07' };
      const options = { progressTracker: mockProgressTracker };

      const result = await releaseNotesService.generateReleaseNotes(dateRange, options);

      expect(result).toBeDefined();
      expect(result.metadata.generationMethod).toBe('llm-enhanced');
      expect(mockAnalyzer.analyzeForReleaseNotes).toHaveBeenCalledTimes(2);
    });
  });

  describe('Progress Tracking', () => {
    test('should track progress through all steps', async () => {
      const progressTracker = new ReleaseNotesProgressTracker('test-session');
      progressTracker.initialize();

      // Mock successful data collection
      releaseNotesService.githubService.getTeamActivity = vi.fn().mockResolvedValue({});
      releaseNotesService.linearService.getIssuesInDateRange = vi.fn().mockResolvedValue([]);
      releaseNotesService.slackService.getTeamChannelMessages = vi.fn().mockResolvedValue([]);

      const dateRange = { start: '2024-01-01', end: '2024-01-07' };
      const options = { progressTracker };

      await releaseNotesService.generateReleaseNotes(dateRange, options);

      const status = progressTracker.getStatus();
      expect(status.completed).toBe(true);
      expect(status.progress.percentage).toBe(100);
    });

    test('should handle data source progress updates', () => {
      const progressTracker = new ReleaseNotesProgressTracker('test-session');
      progressTracker.initialize();

      // Start data collection step
      progressTracker.startStep(1);

      // Update data source progress
      progressTracker.updateDataSourceProgress('github', 'completed', { dataPoints: 10 });
      progressTracker.updateDataSourceProgress('linear', 'failed', { error: 'API error' });
      progressTracker.updateDataSourceProgress('slack', 'completed', { dataPoints: 5 });

      const status = progressTracker.getStatus();
      expect(status.dataSourceStatus.github.status).toBe('completed');
      expect(status.dataSourceStatus.linear.status).toBe('failed');
      expect(status.dataSourceStatus.slack.status).toBe('completed');
    });
  });

  describe('Input Validation', () => {
    test('should validate date range format', async () => {
      const invalidDateRange = { start: 'invalid-date', end: '2024-01-07' };

      await expect(releaseNotesService.generateReleaseNotes(invalidDateRange))
        .rejects.toThrow('Invalid date format');
    });

    test('should validate date range logic', async () => {
      const invalidDateRange = { start: '2024-01-07', end: '2024-01-01' };

      await expect(releaseNotesService.generateReleaseNotes(invalidDateRange))
        .rejects.toThrow('Start date must be before end date');
    });

    test('should require both start and end dates', async () => {
      const incompleteRange = { start: '2024-01-01' };

      await expect(releaseNotesService.generateReleaseNotes(incompleteRange))
        .rejects.toThrow('Date range with start and end dates is required');
    });
  });

  describe('Fallback Generation', () => {
    test('should generate fallback release notes with partial data', async () => {
      const partialData = {
        slack: [{ text: 'Released feature X', ts: '1640995200' }]
      };
      const dateRange = { start: '2024-01-01', end: '2024-01-07' };
      const errors = [
        { source: 'github', message: 'GitHub unavailable' },
        { source: 'linear', message: 'Linear timeout' }
      ];

      const fallbackDocument = releaseNotesService._generateFallbackReleaseNotes(
        partialData,
        dateRange,
        errors
      );

      expect(fallbackDocument).toBeDefined();
      expect(fallbackDocument.metadata.generationMethod).toBe('fallback');
      expect(fallbackDocument.metadata.failedSources).toEqual(['github', 'linear']);
      expect(fallbackDocument.metadata.availableSources).toEqual(['slack']);
    });
  });
});