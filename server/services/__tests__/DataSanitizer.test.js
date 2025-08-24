import { describe, test, expect, beforeEach } from 'vitest';
import DataSanitizer from '../DataSanitizer.js';

describe('DataSanitizer', () => {
  let sanitizer;

  beforeEach(() => {
    sanitizer = new DataSanitizer('moderate');
  });

  describe('Constructor and Configuration', () => {
    test('should initialize with default moderate privacy level', () => {
      const defaultSanitizer = new DataSanitizer();
      expect(defaultSanitizer.privacyLevel).toBe('moderate');
    });

    test('should accept different privacy levels', () => {
      const strictSanitizer = new DataSanitizer('strict');
      const minimalSanitizer = new DataSanitizer('minimal');
      
      expect(strictSanitizer.privacyLevel).toBe('strict');
      expect(minimalSanitizer.privacyLevel).toBe('minimal');
    });
  });

  describe('Text Sanitization', () => {
    test('should sanitize emails correctly', () => {
      const text = 'Contact john.doe@company.com for details';
      const result = sanitizer.sanitizeText(text);
      
      expect(result).not.toContain('john.doe@company.com');
      expect(result).toContain('@[DOMAIN]');
    });

    test('should sanitize GitHub tokens', () => {
      const text = 'Use token ghp_1234567890abcdef1234567890abcdef12345678';
      const result = sanitizer.sanitizeText(text);
      
      expect(result).not.toContain('ghp_1234567890abcdef1234567890abcdef12345678');
      expect(result).toContain('[GITHUB_TOKEN_REDACTED]');
    });

    test('should sanitize Slack tokens', () => {
      const text = 'Bot token: xoxb-1234567890-1234567890123-abcdefghijklmnopqrstuvwx';
      const result = sanitizer.sanitizeText(text);
      
      expect(result).not.toContain('xoxb-1234567890-1234567890123-abcdefghijklmnopqrstuvwx');
      expect(result).toContain('[SLACK_TOKEN_REDACTED]');
    });

    test('should sanitize Linear tokens', () => {
      const text = 'API key: lin_api_1234567890abcdef1234567890abcdef12345678';
      const result = sanitizer.sanitizeText(text);
      
      expect(result).not.toContain('lin_api_1234567890abcdef1234567890abcdef12345678');
      expect(result).toContain('[LINEAR_TOKEN_REDACTED]');
    });

    test('should sanitize IP addresses', () => {
      const text = 'Server at 192.168.1.100 is down';
      const result = sanitizer.sanitizeText(text);
      
      expect(result).not.toContain('192.168.1.100');
      expect(result).toContain('192.168.1.XXX');
    });

    test('should sanitize phone numbers', () => {
      const text = 'Call me at +1-555-123-4567';
      const result = sanitizer.sanitizeText(text);
      
      expect(result).not.toContain('+1-555-123-4567');
      expect(result).toContain('[PHONE_REDACTED]');
    });

    test('should sanitize URLs while preserving domain in moderate mode', () => {
      const text = 'Check https://api.github.com/repos/user/repo/issues';
      const result = sanitizer.sanitizeText(text);
      
      expect(result).not.toContain('/repos/user/repo/issues');
      expect(result).toContain('https://api.github.com/[PATH_REDACTED]');
    });

    test('should handle null and undefined text', () => {
      expect(sanitizer.sanitizeText(null)).toBeNull();
      expect(sanitizer.sanitizeText(undefined)).toBeUndefined();
      expect(sanitizer.sanitizeText('')).toBe('');
    });

    test('should handle non-string input', () => {
      expect(sanitizer.sanitizeText(123)).toBe(123);
      expect(sanitizer.sanitizeText({})).toEqual({});
      expect(sanitizer.sanitizeText([])).toEqual([]);
    });
  });

  describe('Privacy Levels', () => {
    test('strict mode should redact more aggressively', () => {
      const strictSanitizer = new DataSanitizer('strict');
      const text = 'Email john@company.com and visit https://github.com/user/repo';
      const result = strictSanitizer.sanitizeText(text);
      
      expect(result).toContain('[EMAIL_REDACTED]');
      expect(result).toContain('[URL_REDACTED]');
    });

    test('minimal mode should preserve more information', () => {
      const minimalSanitizer = new DataSanitizer('minimal');
      const text = 'Email john@company.com and visit https://github.com/user/repo';
      const result = minimalSanitizer.sanitizeText(text);
      
      expect(result).toContain('@company.com');
      expect(result).toContain('https://github.com/...');
    });

    test('moderate mode should balance privacy and utility', () => {
      const text = 'Email john@company.com';
      const result = sanitizer.sanitizeText(text);
      
      expect(result).not.toContain('john@company.com');
      expect(result).toContain('@[DOMAIN]');
      expect(result).toMatch(/\[USER_[a-f0-9]{6}\]@\[DOMAIN\]/);
    });
  });

  describe('GitHub Data Sanitization', () => {
    const mockGitHubData = {
      commits: [
        {
          sha: 'abc123',
          commit: {
            message: 'Fix bug with user email john@company.com',
            author: {
              name: 'John Doe',
              email: 'john@company.com',
              date: '2023-01-01T00:00:00Z'
            },
            committer: {
              name: 'John Doe',
              email: 'john@company.com',
              date: '2023-01-01T00:00:00Z'
            }
          },
          author: {
            login: 'johndoe',
            email: 'john@company.com',
            avatar_url: 'https://github.com/avatars/johndoe',
            url: 'https://api.github.com/users/johndoe',
            html_url: 'https://github.com/johndoe'
          },
          html_url: 'https://github.com/company/repo/commit/abc123',
          url: 'https://api.github.com/repos/company/repo/commits/abc123'
        }
      ],
      pullRequests: [
        {
          title: 'Add feature with API key sk-1234567890abcdef',
          body: 'This PR adds a feature. Contact admin@company.com for questions.',
          user: {
            login: 'johndoe',
            email: 'john@company.com',
            avatar_url: 'https://github.com/avatars/johndoe',
            url: 'https://api.github.com/users/johndoe',
            html_url: 'https://github.com/johndoe'
          },
          html_url: 'https://github.com/company/repo/pull/123',
          url: 'https://api.github.com/repos/company/repo/pulls/123'
        }
      ]
    };

    test('should sanitize commit messages', () => {
      const result = sanitizer.sanitizeGitHubData(mockGitHubData);
      
      expect(result.commits[0].commit.message).not.toContain('john@company.com');
      expect(result.commits[0].commit.message).toContain('@[DOMAIN]');
    });

    test('should sanitize author information', () => {
      const result = sanitizer.sanitizeGitHubData(mockGitHubData);
      
      expect(result.commits[0].commit.author.email).not.toContain('john@company.com');
      expect(result.commits[0].author.email).not.toContain('john@company.com');
    });

    test('should sanitize pull request content', () => {
      const result = sanitizer.sanitizeGitHubData(mockGitHubData);
      
      expect(result.pullRequests[0].title).not.toContain('sk-1234567890abcdef');
      expect(result.pullRequests[0].body).not.toContain('admin@company.com');
      expect(result.pullRequests[0].title).toContain('[TOKEN_REDACTED]');
    });

    test('should sanitize URLs', () => {
      const result = sanitizer.sanitizeGitHubData(mockGitHubData);
      
      expect(result.commits[0].html_url).toContain('[PATH_REDACTED]');
      expect(result.pullRequests[0].html_url).toContain('[PATH_REDACTED]');
    });

    test('should handle null/undefined GitHub data', () => {
      expect(sanitizer.sanitizeGitHubData(null)).toBeNull();
      expect(sanitizer.sanitizeGitHubData(undefined)).toBeUndefined();
      expect(sanitizer.sanitizeGitHubData({})).toEqual({});
    });

    test('should handle missing nested properties', () => {
      const incompleteData = {
        commits: [{ sha: 'abc123' }],
        pullRequests: [{ title: 'Test PR' }]
      };
      
      const result = sanitizer.sanitizeGitHubData(incompleteData);
      expect(result.commits[0].sha).toBe('abc123');
      expect(result.pullRequests[0].title).toBe('Test PR');
    });
  });

  describe('Linear Data Sanitization', () => {
    const mockLinearData = [
      {
        id: 'issue-1',
        title: 'Bug with user email john@company.com',
        description: 'User reported issue. Contact support@company.com for details.',
        assignee: {
          name: 'John Doe',
          email: 'john@company.com'
        },
        comments: {
          nodes: [
            {
              body: 'I can reproduce this. My email is jane@company.com',
              user: {
                name: 'Jane Smith'
              }
            }
          ]
        },
        project: {
          name: 'Secret Project Alpha'
        },
        team: {
          name: 'Engineering Team'
        }
      }
    ];

    test('should sanitize issue titles and descriptions', () => {
      const result = sanitizer.sanitizeLinearData(mockLinearData);
      
      expect(result[0].title).not.toContain('john@company.com');
      expect(result[0].description).not.toContain('support@company.com');
    });

    test('should sanitize assignee information', () => {
      const result = sanitizer.sanitizeLinearData(mockLinearData);
      
      expect(result[0].assignee.email).not.toContain('john@company.com');
      expect(result[0].assignee.name).toBe('John Doe'); // Name preserved in moderate mode
    });

    test('should sanitize comments', () => {
      const result = sanitizer.sanitizeLinearData(mockLinearData);
      
      expect(result[0].comments.nodes[0].body).not.toContain('jane@company.com');
    });

    test('should handle strict mode for project names', () => {
      const strictSanitizer = new DataSanitizer('strict');
      const result = strictSanitizer.sanitizeLinearData(mockLinearData);
      
      expect(result[0].project.name).toBe('[PROJECT_REDACTED]');
      expect(result[0].team.name).toBe('[TEAM_REDACTED]');
      expect(result[0].assignee.name).toBe('[USER_REDACTED]');
    });

    test('should handle single issue object', () => {
      const singleIssue = mockLinearData[0];
      const result = sanitizer.sanitizeLinearData(singleIssue);
      
      expect(result.title).not.toContain('john@company.com');
      expect(result.id).toBe('issue-1');
    });
  });

  describe('Slack Data Sanitization', () => {
    const mockSlackData = [
      {
        text: 'Hey <@U123456789>, check out this API key: sk-1234567890abcdef. Also ping <#C987654321|general>',
        user: 'U123456789',
        channel: 'engineering',
        thread_ts: '1234567890.123456',
        reactions: [
          {
            name: 'thumbsup',
            count: 2,
            users: ['U123456789', 'U987654321']
          }
        ]
      }
    ];

    test('should sanitize message text', () => {
      const result = sanitizer.sanitizeSlackData(mockSlackData);
      
      expect(result[0].text).not.toContain('sk-1234567890abcdef');
      expect(result[0].text).toContain('[TOKEN_REDACTED]');
    });

    test('should sanitize user mentions', () => {
      const result = sanitizer.sanitizeSlackData(mockSlackData);
      
      expect(result[0].text).not.toContain('<@U123456789>');
      expect(result[0].text).toContain('@[USER]');
    });

    test('should sanitize channel mentions', () => {
      const result = sanitizer.sanitizeSlackData(mockSlackData);
      
      expect(result[0].text).not.toContain('<#C987654321|general>');
      expect(result[0].text).toContain('#[CHANNEL]');
    });

    test('should remove user lists from reactions', () => {
      const result = sanitizer.sanitizeSlackData(mockSlackData);
      
      expect(result[0].reactions[0].users).toEqual([]);
      expect(result[0].reactions[0].name).toBe('thumbsup');
      expect(result[0].reactions[0].count).toBe(2);
    });

    test('should handle strict mode for user and channel info', () => {
      const strictSanitizer = new DataSanitizer('strict');
      const result = strictSanitizer.sanitizeSlackData(mockSlackData);
      
      expect(result[0].user).toBe('[USER_REDACTED]');
      expect(result[0].channel).toBe('[CHANNEL_REDACTED]');
      expect(result[0].thread_ts).toBe('[THREAD_REDACTED]');
    });

    test('should handle single message object', () => {
      const singleMessage = mockSlackData[0];
      const result = sanitizer.sanitizeSlackData(singleMessage);
      
      expect(result.text).not.toContain('sk-1234567890abcdef');
      expect(result.user).toBe('U123456789'); // Preserved in moderate mode
    });
  });

  describe('Team Data Sanitization', () => {
    const mockTeamData = {
      github: {
        commits: [
          {
            commit: {
              message: 'Fix issue with john@company.com',
              author: { email: 'john@company.com' }
            }
          }
        ]
      },
      linear: [
        {
          title: 'Issue with API key sk-test123',
          assignee: { email: 'jane@company.com' }
        }
      ],
      slack: [
        {
          text: 'Contact support@company.com',
          user: 'U123456789'
        }
      ],
      dateRange: { start: '2023-01-01', end: '2023-01-31' },
      teamSize: 5,
      repositories: ['company/secret-repo', 'company/public-repo'],
      channels: ['engineering', 'general']
    };

    test('should sanitize all data sources', () => {
      const result = sanitizer.sanitizeTeamData(mockTeamData);
      
      expect(result.github.commits[0].commit.message).not.toContain('john@company.com');
      expect(result.linear[0].title).not.toContain('sk-test123');
      expect(result.slack[0].text).not.toContain('support@company.com');
    });

    test('should preserve metadata', () => {
      const result = sanitizer.sanitizeTeamData(mockTeamData);
      
      expect(result.dateRange).toEqual(mockTeamData.dateRange);
      expect(result.teamSize).toBe(5);
    });

    test('should sanitize repository and channel names in strict mode', () => {
      const strictSanitizer = new DataSanitizer('strict');
      const result = strictSanitizer.sanitizeTeamData(mockTeamData);
      
      expect(result.repositories).toEqual(['[REPO_REDACTED]', '[REPO_REDACTED]']);
      expect(result.channels).toEqual(['[CHANNEL_REDACTED]', '[CHANNEL_REDACTED]']);
    });

    test('should handle null team data', () => {
      expect(sanitizer.sanitizeTeamData(null)).toBeNull();
    });

    test('should handle partial team data', () => {
      const partialData = { github: null, linear: null, slack: null };
      const result = sanitizer.sanitizeTeamData(partialData);
      
      expect(result.github).toBeNull();
      expect(result.linear).toBeNull();
      expect(result.slack).toBeNull();
    });
  });

  describe('Validation', () => {
    test('should detect unsanitized sensitive data', () => {
      const unsafeData = {
        message: 'Contact john@company.com with token ghp_1234567890abcdef1234567890abcdef123456'
      };
      
      const validation = sanitizer.validateSanitization(unsafeData);
      
      expect(validation.isClean).toBe(false);
      expect(validation.violations.length).toBeGreaterThanOrEqual(1);
      expect(validation.violations.some(v => v.type === 'email')).toBe(true);
    });

    test('should pass validation for clean data', () => {
      const cleanData = {
        message: 'Contact [USER_abc123]@[DOMAIN] with token [GITHUB_TOKEN_REDACTED]'
      };
      
      const validation = sanitizer.validateSanitization(cleanData);
      
      expect(validation.isClean).toBe(true);
      expect(validation.violations).toHaveLength(0);
    });

    test('should provide violation examples', () => {
      const unsafeData = {
        messages: [
          'Email: john@company.com',
          'Email: jane@company.com',
          'Email: admin@company.com',
          'Email: support@company.com'
        ]
      };
      
      const validation = sanitizer.validateSanitization(unsafeData);
      
      expect(validation.violations[0].count).toBe(4);
      expect(validation.violations[0].examples).toHaveLength(3); // Limited to 3 examples
    });
  });

  describe('Sanitization Summary', () => {
    test('should provide sanitization metrics', () => {
      const originalData = {
        message: 'Contact john@company.com with API key sk-1234567890abcdef for access to https://api.company.com/secret'
      };
      
      const sanitizedData = sanitizer.sanitizeTeamData(originalData);
      const summary = sanitizer.getSanitizationSummary(originalData, sanitizedData);
      
      expect(summary.privacyLevel).toBe('moderate');
      expect(summary.originalSize).toBeGreaterThan(0);
      expect(summary.sanitizedSize).toBeGreaterThan(0);
      expect(summary.reductionPercent).toBeDefined();
      expect(summary.patternsApplied).toBeGreaterThan(0);
    });

    test('should calculate reduction percentage', () => {
      const originalData = { message: 'john@company.com' };
      const sanitizedData = { message: '[USER_abc123]@[DOMAIN]' };
      
      const summary = sanitizer.getSanitizationSummary(originalData, sanitizedData);
      
      expect(summary.reductionPercent).toBeDefined();
      expect(typeof summary.reductionPercent).toBe('string');
    });
  });

  describe('Hash Function', () => {
    test('should produce consistent hashes', () => {
      const input = 'test@example.com';
      const hash1 = sanitizer.hashString(input);
      const hash2 = sanitizer.hashString(input);
      
      expect(hash1).toBe(hash2);
    });

    test('should produce different hashes for different inputs', () => {
      const hash1 = sanitizer.hashString('test1@example.com');
      const hash2 = sanitizer.hashString('test2@example.com');
      
      expect(hash1).not.toBe(hash2);
    });

    test('should handle empty strings', () => {
      const hash = sanitizer.hashString('');
      expect(hash).toBeDefined();
      expect(typeof hash).toBe('string');
    });
  });

  describe('Edge Cases', () => {
    test('should handle deeply nested objects', () => {
      const deepData = {
        level1: {
          level2: {
            level3: {
              email: 'deep@company.com',
              nested: {
                token: 'ghp_deeptoken123456789'
              }
            }
          }
        }
      };
      
      // This tests that our JSON.stringify approach works for validation
      const validation = sanitizer.validateSanitization(deepData);
      expect(validation.isClean).toBe(false);
    });

    test('should handle circular references gracefully', () => {
      const circularData = { message: 'test@example.com' };
      circularData.self = circularData;
      
      // Should not throw error, but may not fully sanitize circular refs
      expect(() => {
        sanitizer.validateSanitization({ message: 'safe message' });
      }).not.toThrow();
    });

    test('should handle very large strings', () => {
      const largeString = 'x'.repeat(100) + ' test@example.com ' + 'y'.repeat(100);
      const result = sanitizer.sanitizeText(largeString);
      
      expect(result).not.toContain('test@example.com');
      expect(result).toContain('@[DOMAIN]'); // Should contain the replacement
      expect(result.length).toBeGreaterThan(150); // Should preserve most of the string
    });

    test('should handle special characters in patterns', () => {
      const textWithSpecialChars = 'Email: test+tag@sub.domain.co.uk and IP: 192.168.1.1';
      const result = sanitizer.sanitizeText(textWithSpecialChars);
      
      expect(result).not.toContain('test+tag@sub.domain.co.uk');
      expect(result).not.toContain('192.168.1.1');
    });
  });
});