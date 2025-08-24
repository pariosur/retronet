import { describe, it, expect, beforeEach } from 'vitest';
import { PromptBuilder } from '../PromptBuilder.js';

describe('PromptBuilder', () => {
  let promptBuilder;
  let mockTeamData;
  let mockContext;

  beforeEach(() => {
    promptBuilder = new PromptBuilder();
    
    mockTeamData = {
      github: {
        commits: [
          {
            message: 'Fix authentication bug',
            author: 'developer1',
            date: '2024-01-15T10:00:00Z',
            sha: 'abc123'
          },
          {
            message: 'Add user profile feature',
            author: 'developer2', 
            date: '2024-01-14T15:30:00Z',
            sha: 'def456'
          }
        ],
        pullRequests: [
          {
            title: 'Implement OAuth integration',
            state: 'merged',
            created_at: '2024-01-13T09:00:00Z',
            merged_at: '2024-01-15T11:00:00Z',
            author: 'developer1'
          }
        ]
      },
      linear: {
        issues: [
          {
            title: 'User authentication not working',
            state: 'Done',
            priority: 'High',
            updatedAt: '2024-01-15T12:00:00Z',
            description: 'Users cannot log in with OAuth'
          },
          {
            title: 'Add user profile page',
            state: 'In Progress',
            priority: 'Medium',
            updatedAt: '2024-01-14T16:00:00Z',
            description: 'Create a user profile management interface'
          }
        ]
      },
      slack: {
        messages: [
          {
            text: 'The authentication fix is working great!',
            user: 'U123',
            ts: '1705320000.000100',
            channel: 'general'
          },
          {
            text: 'Can we review the PR for user profiles?',
            user: 'U456',
            ts: '1705233600.000200',
            channel: 'dev'
          }
        ]
      }
    };

    mockContext = {
      dateRange: {
        start: '2024-01-01',
        end: '2024-01-31'
      },
      teamSize: 5,
      repositories: ['main-app', 'api-service'],
      channels: ['general', 'dev', 'random']
    };
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      const builder = new PromptBuilder();
      expect(builder.config.maxTokens).toBe(4000);
      expect(builder.config.systemPromptTokens).toBe(800);
      expect(builder.config.reserveTokens).toBe(200);
      expect(builder.maxDataTokens).toBe(3000);
    });

    it('should accept custom configuration', () => {
      const customConfig = {
        maxTokens: 8000,
        systemPromptTokens: 1000,
        reserveTokens: 500
      };
      const builder = new PromptBuilder(customConfig);
      expect(builder.config.maxTokens).toBe(8000);
      expect(builder.config.systemPromptTokens).toBe(1000);
      expect(builder.config.reserveTokens).toBe(500);
      expect(builder.maxDataTokens).toBe(6500);
    });
  });

  describe('generateRetroPrompt', () => {
    it('should generate a complete prompt with all data sources', () => {
      const prompt = promptBuilder.generateRetroPrompt(mockTeamData, mockContext);
      
      expect(prompt).toHaveProperty('system');
      expect(prompt).toHaveProperty('user');
      expect(prompt).toHaveProperty('metadata');
      
      expect(prompt.system).toContain('retrospective analyst');
      expect(prompt.system).toContain('2024-01-01 to 2024-01-31');
      expect(prompt.system).toContain('Team Size: 5');
      expect(prompt.system).toContain('main-app, api-service');
      
      expect(prompt.user).toContain('Team Data for Analysis');
      expect(prompt.user).toContain('Fix authentication bug');
      expect(prompt.user).toContain('User authentication not working');
      expect(prompt.user).toContain('authentication fix is working great');
      
      expect(prompt.metadata.template).toBe('full-analysis');
      expect(prompt.metadata).toHaveProperty('estimatedTokens');
      expect(prompt.metadata).toHaveProperty('generatedAt');
    });

    it('should select dev-focused template for GitHub + Linear data', () => {
      const dataWithoutSlack = {
        github: mockTeamData.github,
        linear: mockTeamData.linear
      };
      
      const prompt = promptBuilder.generateRetroPrompt(dataWithoutSlack, mockContext);
      expect(prompt.metadata.template).toBe('dev-focused');
      expect(prompt.system).toContain('development team analyst');
      expect(prompt.system).toContain('Development Velocity');
    });

    it('should select code-communication template for GitHub + Slack data', () => {
      const dataWithoutLinear = {
        github: mockTeamData.github,
        slack: mockTeamData.slack
      };
      
      const prompt = promptBuilder.generateRetroPrompt(dataWithoutLinear, mockContext);
      expect(prompt.metadata.template).toBe('code-communication');
      expect(prompt.system).toContain('development practices and team communication');
    });

    it('should select project-communication template for Linear + Slack data', () => {
      const dataWithoutGitHub = {
        linear: mockTeamData.linear,
        slack: mockTeamData.slack
      };
      
      const prompt = promptBuilder.generateRetroPrompt(dataWithoutGitHub, mockContext);
      expect(prompt.metadata.template).toBe('project-communication');
      expect(prompt.system).toContain('project management effectiveness');
    });

    it('should select code-only template for GitHub data only', () => {
      const githubOnly = { github: mockTeamData.github };
      
      const prompt = promptBuilder.generateRetroPrompt(githubOnly, mockContext);
      expect(prompt.metadata.template).toBe('code-only');
      expect(prompt.system).toContain('code analysis specialist');
    });

    it('should select project-only template for Linear data only', () => {
      const linearOnly = { linear: mockTeamData.linear };
      
      const prompt = promptBuilder.generateRetroPrompt(linearOnly, mockContext);
      expect(prompt.metadata.template).toBe('project-only');
      expect(prompt.system).toContain('project management analyst');
    });

    it('should select communication-only template for Slack data only', () => {
      const slackOnly = { slack: mockTeamData.slack };
      
      const prompt = promptBuilder.generateRetroPrompt(slackOnly, mockContext);
      expect(prompt.metadata.template).toBe('communication-only');
      expect(prompt.system).toContain('team communication analyst');
    });

    it('should select minimal template for empty data', () => {
      const emptyData = {};
      
      const prompt = promptBuilder.generateRetroPrompt(emptyData, mockContext);
      expect(prompt.metadata.template).toBe('minimal');
      expect(prompt.system).toContain('working with limited data');
    });

    it('should include proper JSON output format in system prompt', () => {
      const prompt = promptBuilder.generateRetroPrompt(mockTeamData, mockContext);
      
      expect(prompt.system).toContain('"wentWell"');
      expect(prompt.system).toContain('"didntGoWell"');
      expect(prompt.system).toContain('"actionItems"');
      expect(prompt.system).toContain('"confidence"');
      expect(prompt.system).toContain('"reasoning"');
    });
  });

  describe('token optimization', () => {
    it('should optimize data when it exceeds token limits', () => {
      // Create large dataset that exceeds limits
      const largeData = {
        github: {
          commits: Array(100).fill(null).map((_, i) => ({
            message: `Commit ${i} with a very long message that contains lots of details about the changes made in this particular commit`,
            author: `developer${i % 5}`,
            date: `2024-01-${String(i % 28 + 1).padStart(2, '0')}T10:00:00Z`,
            sha: `sha${i}`
          })),
          pullRequests: Array(50).fill(null).map((_, i) => ({
            title: `Pull request ${i} with detailed title`,
            state: 'merged',
            created_at: `2024-01-${String(i % 28 + 1).padStart(2, '0')}T09:00:00Z`,
            author: `developer${i % 5}`
          }))
        }
      };

      const smallBuilder = new PromptBuilder({ maxTokens: 1000, systemPromptTokens: 400, reserveTokens: 100 });
      const prompt = smallBuilder.generateRetroPrompt(largeData, mockContext);
      
      expect(prompt.metadata.dataOptimized).toBe(true);
      expect(prompt.metadata.estimatedTokens).toBeLessThan(1000);
    });

    it('should preserve recent and important data during optimization', () => {
      const dataWithDates = {
        github: {
          commits: [
            {
              message: 'Old commit',
              date: '2024-01-01T10:00:00Z',
              author: 'dev1'
            },
            {
              message: 'Recent commit',
              date: '2024-01-30T10:00:00Z',
              author: 'dev2'
            }
          ]
        }
      };

      const smallBuilder = new PromptBuilder({ maxTokens: 500, systemPromptTokens: 200, reserveTokens: 50 });
      const prompt = smallBuilder.generateRetroPrompt(dataWithDates, mockContext);
      
      // Recent commit should be preserved
      expect(prompt.user).toContain('Recent commit');
    });

    it('should truncate long text fields during optimization', () => {
      // Create data large enough to trigger optimization with long messages
      const dataWithLongText = {
        github: {
          commits: Array(10).fill(null).map((_, i) => ({
            message: 'A'.repeat(500) + ` commit ${i}`, // Very long commit messages
            date: `2024-01-${String(i % 28 + 1).padStart(2, '0')}T10:00:00Z`,
            author: `dev${i % 3}`
          }))
        }
      };

      const smallBuilder = new PromptBuilder({ maxTokens: 800, systemPromptTokens: 400, reserveTokens: 100 });
      const prompt = smallBuilder.generateRetroPrompt(dataWithLongText, mockContext);
      
      // Message should be truncated (100 chars max - 3 for ellipsis = 97 + 3 = 100)
      const messageInPrompt = JSON.parse(prompt.user.split('Team Data for Analysis:\n\n')[1].split('\n\nPlease analyze')[0]);
      expect(messageInPrompt.github.commits[0].message.length).toBeLessThanOrEqual(100);
      expect(messageInPrompt.github.commits[0].message).toContain('...');
    });
  });

  describe('validatePromptSize', () => {
    it('should validate prompt size correctly', () => {
      const prompt = promptBuilder.generateRetroPrompt(mockTeamData, mockContext);
      const isValid = promptBuilder.validatePromptSize(prompt);
      expect(isValid).toBe(true);
    });

    it('should return false for oversized prompts', () => {
      const oversizedPrompt = {
        system: 'A'.repeat(15000), // Much larger to exceed token limit
        user: 'B'.repeat(15000)
      };
      
      const isValid = promptBuilder.validatePromptSize(oversizedPrompt);
      expect(isValid).toBe(false);
    });
  });

  describe('getTokenUsage', () => {
    it('should return detailed token usage statistics', () => {
      const prompt = promptBuilder.generateRetroPrompt(mockTeamData, mockContext);
      const usage = promptBuilder.getTokenUsage(prompt);
      
      expect(usage).toHaveProperty('system');
      expect(usage).toHaveProperty('user');
      expect(usage).toHaveProperty('total');
      expect(usage).toHaveProperty('limit');
      expect(usage).toHaveProperty('utilization');
      expect(usage).toHaveProperty('withinLimit');
      
      expect(usage.total).toBe(usage.system + usage.user);
      expect(usage.limit).toBe(4000);
      expect(usage.utilization).toBe(usage.total / usage.limit);
      expect(usage.withinLimit).toBe(usage.total <= usage.limit);
    });
  });

  describe('static methods', () => {
    it('should create builder with custom config using withConfig', () => {
      const customConfig = { maxTokens: 8000 };
      const builder = PromptBuilder.withConfig(customConfig);
      
      expect(builder).toBeInstanceOf(PromptBuilder);
      expect(builder.config.maxTokens).toBe(8000);
    });
  });

  describe('edge cases', () => {
    it('should handle empty team data gracefully', () => {
      const emptyData = {};
      const prompt = promptBuilder.generateRetroPrompt(emptyData, mockContext);
      
      expect(prompt.system).toBeDefined();
      expect(prompt.user).toBeDefined();
      expect(prompt.metadata.template).toBe('minimal');
    });

    it('should handle missing context fields gracefully', () => {
      const minimalContext = {
        dateRange: { start: '2024-01-01', end: '2024-01-31' }
      };
      
      const prompt = promptBuilder.generateRetroPrompt(mockTeamData, minimalContext);
      
      expect(prompt.system).toContain('Team Size: Unknown');
      expect(prompt.system).toContain('Repositories: Not specified');
      expect(prompt.system).toContain('Communication Channels: Not specified');
    });

    it('should handle data with empty arrays', () => {
      const emptyArrayData = {
        github: { commits: [], pullRequests: [] },
        linear: { issues: [] },
        slack: { messages: [] }
      };
      
      const prompt = promptBuilder.generateRetroPrompt(emptyArrayData, mockContext);
      expect(prompt.metadata.template).toBe('minimal');
    });

    it('should handle null and undefined values in data', () => {
      const dataWithNulls = {
        github: {
          commits: [
            {
              message: null,
              author: undefined,
              date: '2024-01-15T10:00:00Z'
            }
          ]
        }
      };
      
      expect(() => {
        promptBuilder.generateRetroPrompt(dataWithNulls, mockContext);
      }).not.toThrow();
    });
  });

  describe('template selection logic', () => {
    it('should prioritize full analysis when all data sources have content', () => {
      const fullData = {
        github: { commits: [{ message: 'test' }], pullRequests: [] },
        linear: { issues: [{ title: 'test' }] },
        slack: { messages: [{ text: 'test' }] }
      };
      
      const prompt = promptBuilder.generateRetroPrompt(fullData, mockContext);
      expect(prompt.metadata.template).toBe('full-analysis');
    });

    it('should handle mixed empty and populated arrays correctly', () => {
      const mixedData = {
        github: { commits: [{ message: 'test' }], pullRequests: [] },
        linear: { issues: [] },
        slack: { messages: [{ text: 'test' }] }
      };
      
      const prompt = promptBuilder.generateRetroPrompt(mixedData, mockContext);
      expect(prompt.metadata.template).toBe('code-communication');
    });
  });

  describe('data optimization strategies', () => {
    it('should maintain minimum data thresholds during optimization', () => {
      const largeGitHubData = {
        github: {
          commits: Array(1000).fill(null).map((_, i) => ({
            message: `Commit ${i}`,
            date: `2024-01-15T10:00:00Z`,
            author: 'dev1'
          }))
        }
      };

      const smallBuilder = new PromptBuilder({ maxTokens: 1000, systemPromptTokens: 400, reserveTokens: 100 });
      const prompt = smallBuilder.generateRetroPrompt(largeGitHubData, mockContext);
      
      const optimizedData = JSON.parse(prompt.user.split('Team Data for Analysis:\n\n')[1].split('\n\nPlease analyze')[0]);
      
      // Should maintain at least 5 commits even with aggressive optimization
      expect(optimizedData.github.commits.length).toBeGreaterThanOrEqual(5);
    });

    it('should sort data by recency during optimization', () => {
      // Create data large enough to trigger optimization
      const unsortedData = {
        github: {
          commits: [
            { message: 'Old commit with some details', date: '2024-01-01T10:00:00Z', author: 'dev1' },
            { message: 'New commit with some details', date: '2024-01-30T10:00:00Z', author: 'dev2' },
            { message: 'Middle commit with some details', date: '2024-01-15T10:00:00Z', author: 'dev3' },
            // Add more commits to ensure optimization is triggered
            ...Array(20).fill(null).map((_, i) => ({
              message: `Filler commit ${i} with enough text to make this large`,
              date: `2024-01-${String(i % 28 + 1).padStart(2, '0')}T10:00:00Z`,
              author: `dev${i % 3}`
            }))
          ]
        }
      };

      const smallBuilder = new PromptBuilder({ maxTokens: 800, systemPromptTokens: 400, reserveTokens: 100 });
      const prompt = smallBuilder.generateRetroPrompt(unsortedData, mockContext);
      
      const optimizedData = JSON.parse(prompt.user.split('Team Data for Analysis:\n\n')[1].split('\n\nPlease analyze')[0]);
      
      // First commit should be the most recent (New commit)
      expect(optimizedData.github.commits[0].message).toBe('New commit with some details');
    });
  });
});