import { describe, it, expect, beforeEach, vi } from 'vitest';
import ReleaseNotesService from '../ReleaseNotesService.js';

// Mock the service dependencies
vi.mock('../githubService.js', () => ({
  default: vi.fn().mockImplementation(() => ({
    getTeamActivity: vi.fn().mockResolvedValue({
      commits: [],
      pullRequests: []
    })
  }))
}));

vi.mock('../linearService.js', () => ({
  default: vi.fn().mockImplementation(() => ({
    getIssuesInDateRange: vi.fn().mockResolvedValue([])
  }))
}));

vi.mock('../slackService.js', () => ({
  default: vi.fn().mockImplementation(() => ({
    getTeamChannelMessages: vi.fn().mockResolvedValue([])
  }))
}));

describe('ReleaseNotesService', () => {
  let service;
  let mockConfig;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Mock environment variables
    process.env.GITHUB_TOKEN = 'mock-github-token';
    process.env.LINEAR_API_KEY = 'mock-linear-key';
    process.env.SLACK_BOT_TOKEN = 'mock-slack-token';

    mockConfig = {
      githubToken: 'mock-github-token',
      linearApiKey: 'mock-linear-key',
      slackBotToken: 'mock-slack-token',
      confidenceThreshold: 0.7,
      maxEntriesPerCategory: 20
    };

    service = new ReleaseNotesService(mockConfig);
  });

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      expect(service.config.confidenceThreshold).toBe(0.7);
      expect(service.config.maxEntriesPerCategory).toBe(20);
    });

    it('should initialize services when tokens are provided', () => {
      expect(service.githubService).toBeTruthy();
      expect(service.linearService).toBeTruthy();
      expect(service.slackService).toBeTruthy();
    });

    it('should handle missing tokens gracefully', () => {
      // Temporarily clear environment variables
      const originalGithubToken = process.env.GITHUB_TOKEN;
      const originalLinearKey = process.env.LINEAR_API_KEY;
      const originalSlackToken = process.env.SLACK_BOT_TOKEN;
      
      delete process.env.GITHUB_TOKEN;
      delete process.env.LINEAR_API_KEY;
      delete process.env.SLACK_BOT_TOKEN;
      
      const configWithoutTokens = {};
      const serviceWithoutTokens = new ReleaseNotesService(configWithoutTokens);
      
      expect(serviceWithoutTokens.githubService).toBeNull();
      expect(serviceWithoutTokens.linearService).toBeNull();
      expect(serviceWithoutTokens.slackService).toBeNull();
      
      // Restore environment variables
      process.env.GITHUB_TOKEN = originalGithubToken;
      process.env.LINEAR_API_KEY = originalLinearKey;
      process.env.SLACK_BOT_TOKEN = originalSlackToken;
    });
  });

  describe('generateReleaseNotes', () => {
    const mockDateRange = {
      start: '2024-01-01',
      end: '2024-01-31'
    };

    it('should generate release notes successfully with empty data', async () => {
      const result = await service.generateReleaseNotes(mockDateRange);

      expect(result).toBeDefined();
      expect(result.id).toBeDefined();
      expect(result.title).toContain('Release Notes');
      expect(result.dateRange).toEqual(mockDateRange);
      expect(result.entries).toBeDefined();
      expect(result.entries.newFeatures).toEqual([]);
      expect(result.entries.improvements).toEqual([]);
      expect(result.entries.fixes).toEqual([]);
      expect(result.metadata).toBeDefined();
    });

    it('should validate date range', async () => {
      const invalidDateRange = {
        start: '2024-01-31',
        end: '2024-01-01' // End before start
      };

      await expect(service.generateReleaseNotes(invalidDateRange))
        .rejects.toThrow('Start date must be before end date');
    });

    it('should handle missing date range', async () => {
      await expect(service.generateReleaseNotes({}))
        .rejects.toThrow('Date range with start and end dates is required');
    });

    it('should handle invalid date format', async () => {
      const invalidDateRange = {
        start: 'invalid-date',
        end: '2024-01-31'
      };

      await expect(service.generateReleaseNotes(invalidDateRange))
        .rejects.toThrow('Invalid date format in date range');
    });
  });

  describe('identifyUserFacingChanges', () => {
    it('should identify user-facing changes from GitHub commits', async () => {
      const mockRawData = {
        github: {
          commits: [
            {
              sha: 'abc123',
              commit: {
                message: 'Add new user dashboard feature',
                author: { date: '2024-01-15T10:00:00Z' }
              }
            },
            {
              sha: 'def456',
              commit: {
                message: 'Refactor internal API structure', // Should be filtered out
                author: { date: '2024-01-16T10:00:00Z' }
              }
            }
          ],
          pullRequests: []
        }
      };

      const changes = await service.identifyUserFacingChanges(mockRawData);

      expect(changes).toHaveLength(1);
      expect(changes[0].title).toBe('Add new user dashboard feature');
      expect(changes[0].source).toBe('github');
      expect(changes[0].sourceType).toBe('commit');
    });

    it('should identify user-facing changes from Linear issues', async () => {
      const mockRawData = {
        linear: [
          {
            id: 'issue-1',
            title: 'Implement user profile editing',
            description: 'Allow users to edit their profile information',
            state: { name: 'Done', type: 'completed' },
            updatedAt: '2024-01-15T10:00:00Z',
            labels: { nodes: [{ name: 'feature' }] },
            priority: 2
          },
          {
            id: 'issue-2',
            title: 'Internal code cleanup',
            description: 'Refactor internal components',
            state: { name: 'Done', type: 'completed' },
            updatedAt: '2024-01-16T10:00:00Z',
            labels: { nodes: [{ name: 'internal' }] }, // Should be filtered out
            priority: 1
          }
        ]
      };

      const changes = await service.identifyUserFacingChanges(mockRawData);

      expect(changes).toHaveLength(1);
      expect(changes[0].title).toBe('Implement user profile editing');
      expect(changes[0].source).toBe('linear');
      expect(changes[0].sourceType).toBe('issue');
    });

    it('should handle empty raw data', async () => {
      const changes = await service.identifyUserFacingChanges({});
      expect(changes).toEqual([]);
    });
  });

  describe('categorizeChanges', () => {
    it('should categorize changes correctly', async () => {
      const mockChanges = [
        {
          id: 'change-1',
          title: 'Add new feature for users',
          description: 'New functionality',
          confidence: 0.9
        },
        {
          id: 'change-2',
          title: 'Fix login bug',
          description: 'Resolved issue with login',
          confidence: 0.8
        },
        {
          id: 'change-3',
          title: 'Improve dashboard performance',
          description: 'Made dashboard faster',
          confidence: 0.7
        }
      ];

      const categorized = await service.categorizeChanges(mockChanges);

      expect(categorized.newFeatures).toHaveLength(1);
      expect(categorized.fixes).toHaveLength(1);
      expect(categorized.improvements).toHaveLength(1);

      expect(categorized.newFeatures[0].title).toBe('Add new feature for users');
      expect(categorized.fixes[0].title).toBe('Fix login bug');
      expect(categorized.improvements[0].title).toBe('Improve dashboard performance');
    });

    it('should handle empty changes array', async () => {
      const categorized = await service.categorizeChanges([]);

      expect(categorized.newFeatures).toEqual([]);
      expect(categorized.improvements).toEqual([]);
      expect(categorized.fixes).toEqual([]);
    });
  });

  describe('translateToUserLanguage', () => {
    it('should translate technical descriptions to user-friendly language', async () => {
      const mockCategorizedChanges = {
        newFeatures: [
          {
            id: 'change-1',
            title: 'feat: Add user authentication API',
            description: 'Implement OAuth2 authentication service',
            category: 'newFeatures'
          }
        ],
        improvements: [],
        fixes: []
      };

      const translated = await service.translateToUserLanguage(mockCategorizedChanges);

      expect(translated.newFeatures).toHaveLength(1);
      expect(translated.newFeatures[0].userFriendlyTitle).toBe('Add user authentication API');
      expect(translated.newFeatures[0].userFriendlyDescription).toBeDefined();
      expect(translated.newFeatures[0].userValue).toBe('Adds new functionality to enhance your workflow');
      expect(translated.newFeatures[0].translationConfidence).toBe(0.8);
    });
  });

  describe('getServiceStatus', () => {
    it('should return correct service status', () => {
      const status = service.getServiceStatus();

      expect(status.github).toBe(true);
      expect(status.linear).toBe(true);
      expect(status.slack).toBe(true);
      expect(status.config.confidenceThreshold).toBe(0.7);
      expect(status.config.maxEntriesPerCategory).toBe(20);
    });
  });

  describe('private helper methods', () => {
    it('should identify bug fixes correctly', () => {
      expect(service._isBugFix('fix login issue', '', [])).toBe(true);
      expect(service._isBugFix('resolve crash bug', '', [])).toBe(true);
      expect(service._isBugFix('add new feature', '', [])).toBe(false);
      expect(service._isBugFix('', '', ['bug'])).toBe(true);
    });

    it('should identify new features correctly', () => {
      expect(service._isNewFeature('add new dashboard', '', [])).toBe(true);
      expect(service._isNewFeature('implement user profiles', '', [])).toBe(true);
      expect(service._isNewFeature('fix bug', '', [])).toBe(false);
      expect(service._isNewFeature('', '', ['feature'])).toBe(true);
    });

    it('should generate user-friendly titles', () => {
      expect(service._generateUserFriendlyTitle({ title: 'feat: add new feature' }))
        .toBe('Add new feature');
      expect(service._generateUserFriendlyTitle({ title: 'fix: resolve login issue' }))
        .toBe('Resolve login issue');
      expect(service._generateUserFriendlyTitle({ title: 'WIP: work in progress' }))
        .toBe('Work in progress');
    });

    it('should assess PR impact correctly', () => {
      expect(service._assessPRImpact({ additions: 600, deletions: 100 })).toBe('high');
      expect(service._assessPRImpact({ additions: 200, deletions: 50 })).toBe('medium');
      expect(service._assessPRImpact({ additions: 50, deletions: 10 })).toBe('low');
    });
  });
});