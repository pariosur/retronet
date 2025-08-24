/**
 * Data Privacy and Sanitization Compliance Tests
 * 
 * This test suite specifically focuses on data privacy and sanitization compliance
 * to ensure sensitive information is properly handled before being sent to LLM providers.
 * 
 * Requirements: 6.1, 6.2, 6.3
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import DataSanitizer from '../services/DataSanitizer.js';

describe('Data Privacy and Sanitization Compliance', () => {
  let sanitizer;

  beforeEach(() => {
    vi.clearAllMocks();
    sanitizer = new DataSanitizer('moderate');
  });

  describe('GitHub Data Sanitization', () => {
    test('should remove email addresses from commit data', () => {
      const githubData = {
        commits: [
          {
            sha: 'abc123',
            commit: {
              message: 'Fix bug reported by john.doe@company.com',
              author: { 
                name: 'John Doe', 
                email: 'john.doe@company.com' 
              },
              committer: {
                name: 'John Doe',
                email: 'john.doe@company.com'
              }
            }
          }
        ],
        pullRequests: []
      };

      const sanitized = sanitizer.sanitizeGitHubData(githubData);

      expect(sanitized.commits[0].commit.message).not.toContain('john.doe@company.com');
      expect(sanitized.commits[0].commit.author.email).toBe('[EMAIL_REDACTED]');
      expect(sanitized.commits[0].commit.committer.email).toBe('[EMAIL_REDACTED]');
    });

    test('should remove API keys and tokens from commit messages', () => {
      const githubData = {
        commits: [
          {
            sha: 'abc123',
            commit: {
              message: 'Update config with API key sk-1234567890abcdef and token ghp_abcdef123456',
              author: { name: 'Developer', email: 'dev@company.com' }
            }
          }
        ],
        pullRequests: []
      };

      const sanitized = sanitizer.sanitizeGitHubData(githubData);

      expect(sanitized.commits[0].commit.message).not.toContain('sk-1234567890abcdef');
      expect(sanitized.commits[0].commit.message).not.toContain('ghp_abcdef123456');
      expect(sanitized.commits[0].commit.message).toContain('[API_KEY_REDACTED]');
      expect(sanitized.commits[0].commit.message).toContain('[TOKEN_REDACTED]');
    });

    test('should sanitize pull request descriptions', () => {
      const githubData = {
        commits: [],
        pullRequests: [
          {
            id: 1,
            title: 'Add authentication for user@example.com',
            body: 'This PR adds auth using secret key: sk-test123 and connects to database at user:password@localhost',
            user: { login: 'developer', email: 'dev@company.com' }
          }
        ]
      };

      const sanitized = sanitizer.sanitizeGitHubData(githubData);

      expect(sanitized.pullRequests[0].title).not.toContain('user@example.com');
      expect(sanitized.pullRequests[0].body).not.toContain('sk-test123');
      expect(sanitized.pullRequests[0].body).not.toContain('user:password@localhost');
      expect(sanitized.pullRequests[0].user.email).toBe('[EMAIL_REDACTED]');
    });

    test('should preserve non-sensitive technical information', () => {
      const githubData = {
        commits: [
          {
            sha: 'abc123',
            commit: {
              message: 'Fix bug in authentication module - updated login flow',
              author: { name: 'Developer', email: 'dev@company.com' }
            }
          }
        ],
        pullRequests: [
          {
            id: 1,
            title: 'Improve error handling in API endpoints',
            body: 'This PR improves error handling by adding try-catch blocks and better logging',
            user: { login: 'developer' }
          }
        ]
      };

      const sanitized = sanitizer.sanitizeGitHubData(githubData);

      expect(sanitized.commits[0].commit.message).toContain('authentication module');
      expect(sanitized.commits[0].commit.message).toContain('login flow');
      expect(sanitized.pullRequests[0].title).toContain('error handling');
      expect(sanitized.pullRequests[0].body).toContain('try-catch blocks');
    });
  });

  describe('Linear Data Sanitization', () => {
    test('should remove email addresses from issue data', () => {
      const linearData = [
        {
          id: 'LIN-123',
          title: 'Bug reported by customer@example.com',
          description: 'User john.doe@company.com cannot login',
          assignee: { 
            name: 'Jane Developer', 
            email: 'jane@company.com' 
          },
          creator: {
            name: 'John Reporter',
            email: 'john@company.com'
          }
        }
      ];

      const sanitized = sanitizer.sanitizeLinearData(linearData);

      expect(sanitized[0].title).not.toContain('customer@example.com');
      expect(sanitized[0].description).not.toContain('john.doe@company.com');
      expect(sanitized[0].assignee.email).toBe('[EMAIL_REDACTED]');
      expect(sanitized[0].creator.email).toBe('[EMAIL_REDACTED]');
    });

    test('should remove API keys and credentials from issue descriptions', () => {
      const linearData = [
        {
          id: 'LIN-123',
          title: 'API integration issue',
          description: 'Cannot connect using API key sk-1234567890 and database password mySecretPass123',
          assignee: { name: 'Developer' }
        }
      ];

      const sanitized = sanitizer.sanitizeLinearData(linearData);

      expect(sanitized[0].description).not.toContain('sk-1234567890');
      expect(sanitized[0].description).not.toContain('mySecretPass123');
      expect(sanitized[0].description).toContain('[API_KEY_REDACTED]');
      expect(sanitized[0].description).toContain('[PASSWORD_REDACTED]');
    });

    test('should sanitize phone numbers and personal identifiers', () => {
      const linearData = [
        {
          id: 'LIN-123',
          title: 'Contact user at +1-555-123-4567',
          description: 'User SSN: 123-45-6789, Phone: (555) 987-6543',
          assignee: { name: 'Developer' }
        }
      ];

      const sanitized = sanitizer.sanitizeLinearData(linearData);

      expect(sanitized[0].title).not.toContain('+1-555-123-4567');
      expect(sanitized[0].description).not.toContain('123-45-6789');
      expect(sanitized[0].description).not.toContain('(555) 987-6543');
      expect(sanitized[0].title).toContain('[PHONE_REDACTED]');
      expect(sanitized[0].description).toContain('[SSN_REDACTED]');
    });

    test('should preserve technical issue details', () => {
      const linearData = [
        {
          id: 'LIN-123',
          title: 'Database connection timeout in production',
          description: 'The application fails to connect to the database after 30 seconds. Error code: CONN_TIMEOUT',
          assignee: { name: 'Database Admin' },
          labels: ['bug', 'production', 'database']
        }
      ];

      const sanitized = sanitizer.sanitizeLinearData(linearData);

      expect(sanitized[0].title).toContain('Database connection timeout');
      expect(sanitized[0].description).toContain('30 seconds');
      expect(sanitized[0].description).toContain('CONN_TIMEOUT');
      expect(sanitized[0].labels).toEqual(['bug', 'production', 'database']);
    });
  });

  describe('Slack Data Sanitization', () => {
    test('should remove user IDs and mentions', () => {
      const slackData = [
        {
          text: 'Hey <@U123456>, can you help with this issue?',
          user: 'U123456',
          channel: 'C789012',
          ts: '1704067200.000100'
        },
        {
          text: 'Thanks <@U789012> for the quick fix!',
          user: 'U654321',
          channel: 'C789012',
          ts: '1704067300.000100'
        }
      ];

      const sanitized = sanitizer.sanitizeSlackData(slackData);

      expect(sanitized[0].text).not.toContain('<@U123456>');
      expect(sanitized[0].user).toBe('[USER_ID_REDACTED]');
      expect(sanitized[1].text).not.toContain('<@U789012>');
      expect(sanitized[1].user).toBe('[USER_ID_REDACTED]');
      expect(sanitized[0].text).toContain('[USER_MENTION]');
    });

    test('should remove email addresses and sensitive information', () => {
      const slackData = [
        {
          text: 'Please contact john.doe@company.com about the API key sk-1234567890',
          user: 'U123456',
          channel: 'C789012',
          ts: '1704067200.000100'
        }
      ];

      const sanitized = sanitizer.sanitizeSlackData(slackData);

      expect(sanitized[0].text).not.toContain('john.doe@company.com');
      expect(sanitized[0].text).not.toContain('sk-1234567890');
      expect(sanitized[0].text).toContain('[EMAIL_REDACTED]');
      expect(sanitized[0].text).toContain('[API_KEY_REDACTED]');
    });

    test('should filter out private channel messages', () => {
      const slackData = [
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
          channel: 'G123456', // Private group
          channel_type: 'private',
          ts: '1704067300.000100'
        },
        {
          text: 'DM message',
          user: 'U123456',
          channel: 'D123456', // Direct message
          channel_type: 'im',
          ts: '1704067400.000100'
        }
      ];

      const sanitized = sanitizer.sanitizeSlackData(slackData);

      // Should only include public channel messages
      expect(sanitized).toHaveLength(1);
      expect(sanitized[0].channel_type).toBe('public');
      expect(sanitized[0].text).toContain('Public channel message');
    });

    test('should preserve technical discussion content', () => {
      const slackData = [
        {
          text: 'The deployment failed with error code 500. Check the logs in /var/log/app.log',
          user: 'U123456',
          channel: 'C789012',
          channel_type: 'public',
          ts: '1704067200.000100'
        }
      ];

      const sanitized = sanitizer.sanitizeSlackData(slackData);

      expect(sanitized[0].text).toContain('deployment failed');
      expect(sanitized[0].text).toContain('error code 500');
      expect(sanitized[0].text).toContain('/var/log/app.log');
    });
  });

  describe('Privacy Level Configuration', () => {
    test('should apply strict privacy level', () => {
      const githubData = {
        commits: [
          {
            sha: 'abc123',
            commit: {
              message: 'Fix for John Doe in accounting department',
              author: { name: 'John Doe', email: 'john@company.com' }
            }
          }
        ],
        pullRequests: []
      };

      const sanitized = sanitizer.sanitizeGitHubData(githubData, 'strict');

      // In strict mode, even names should be redacted
      expect(sanitized.commits[0].commit.message).not.toContain('John Doe');
      expect(sanitized.commits[0].commit.author.name).toBe('[NAME_REDACTED]');
    });

    test('should apply moderate privacy level', () => {
      const githubData = {
        commits: [
          {
            sha: 'abc123',
            commit: {
              message: 'Fix for John Doe using API key sk-123456',
              author: { name: 'John Doe', email: 'john@company.com' }
            }
          }
        ],
        pullRequests: []
      };

      const sanitized = sanitizer.sanitizeGitHubData(githubData, 'moderate');

      // In moderate mode, names might be preserved but sensitive data removed
      expect(sanitized.commits[0].commit.message).not.toContain('sk-123456');
      expect(sanitized.commits[0].commit.author.email).toBe('[EMAIL_REDACTED]');
      // Names might be preserved in moderate mode
    });

    test('should apply minimal privacy level', () => {
      const githubData = {
        commits: [
          {
            sha: 'abc123',
            commit: {
              message: 'Fix authentication with API key sk-123456',
              author: { name: 'John Doe', email: 'john@company.com' }
            }
          }
        ],
        pullRequests: []
      };

      const sanitized = sanitizer.sanitizeGitHubData(githubData, 'minimal');

      // In minimal mode, only highly sensitive data like API keys are removed
      expect(sanitized.commits[0].commit.message).not.toContain('sk-123456');
      expect(sanitized.commits[0].commit.message).toContain('authentication');
      // Email might be preserved in minimal mode depending on implementation
    });
  });

  describe('Edge Cases and Error Handling', () => {
    test('should handle null and undefined data gracefully', () => {
      expect(() => sanitizer.sanitizeGitHubData(null)).not.toThrow();
      expect(() => sanitizer.sanitizeLinearData(undefined)).not.toThrow();
      expect(() => sanitizer.sanitizeSlackData([])).not.toThrow();
    });

    test('should handle malformed data structures', () => {
      const malformedGithubData = {
        commits: [
          {
            // Missing commit object
            sha: 'abc123'
          },
          {
            commit: {
              // Missing author
              message: 'Test commit'
            }
          }
        ],
        pullRequests: null
      };

      expect(() => sanitizer.sanitizeGitHubData(malformedGithubData)).not.toThrow();
      const result = sanitizer.sanitizeGitHubData(malformedGithubData);
      expect(result).toBeDefined();
    });

    test('should handle very large datasets efficiently', () => {
      const largeSlackData = Array(10000).fill(null).map((_, i) => ({
        text: `Message ${i} with email user${i}@company.com`,
        user: `U${i}`,
        channel: 'C789012',
        channel_type: 'public',
        ts: `${1704067200 + i}.000100`
      }));

      const start = Date.now();
      const sanitized = sanitizer.sanitizeSlackData(largeSlackData);
      const duration = Date.now() - start;

      expect(sanitized).toHaveLength(10000);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
      expect(sanitized[0].text).not.toContain('user0@company.com');
    });

    test('should preserve data structure integrity', () => {
      const originalData = {
        commits: [
          {
            sha: 'abc123',
            commit: {
              message: 'Test commit with email@example.com',
              author: { name: 'Developer', email: 'dev@company.com' },
              tree: { sha: 'tree123' },
              url: 'https://api.github.com/repos/test/commits/abc123'
            }
          }
        ],
        pullRequests: [
          {
            id: 1,
            number: 42,
            title: 'Test PR',
            state: 'open',
            created_at: '2024-01-01T00:00:00Z'
          }
        ]
      };

      const sanitized = sanitizer.sanitizeGitHubData(originalData);

      // Structure should be preserved
      expect(sanitized.commits).toHaveLength(1);
      expect(sanitized.pullRequests).toHaveLength(1);
      expect(sanitized.commits[0]).toHaveProperty('sha');
      expect(sanitized.commits[0].commit).toHaveProperty('tree');
      expect(sanitized.pullRequests[0]).toHaveProperty('number');
      expect(sanitized.pullRequests[0]).toHaveProperty('state');
    });
  });

  describe('Compliance Verification', () => {
    test('should not leak sensitive patterns in any field', () => {
      const testData = {
        commits: [
          {
            sha: 'abc123',
            commit: {
              message: 'Update with sk-1234567890abcdef and user@domain.com',
              author: { name: 'John Doe', email: 'john@company.com' }
            }
          }
        ],
        pullRequests: [
          {
            id: 1,
            title: 'Fix for customer@example.com',
            body: 'Password: secretPass123, Token: ghp_abcdef123456',
            user: { login: 'developer', email: 'dev@company.com' }
          }
        ]
      };

      const sanitized = sanitizer.sanitizeGitHubData(testData);
      const serialized = JSON.stringify(sanitized);

      // Verify no sensitive patterns remain anywhere in the data
      expect(serialized).not.toMatch(/sk-[a-zA-Z0-9]+/);
      expect(serialized).not.toMatch(/ghp_[a-zA-Z0-9]+/);
      expect(serialized).not.toMatch(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
      expect(serialized).not.toMatch(/secretPass123/);
    });

    test('should maintain audit trail of sanitization', () => {
      const originalData = [
        {
          id: 'LIN-123',
          title: 'Issue for user@example.com',
          description: 'API key sk-123456 not working'
        }
      ];

      const sanitized = sanitizer.sanitizeLinearData(originalData);

      // Should include metadata about sanitization
      expect(sanitized._sanitizationMetadata).toBeDefined();
      expect(sanitized._sanitizationMetadata.timestamp).toBeDefined();
      expect(sanitized._sanitizationMetadata.itemsProcessed).toBe(1);
      expect(sanitized._sanitizationMetadata.sensitiveDataFound).toBeGreaterThan(0);
    });

    test('should validate sanitization completeness', () => {
      const testCases = [
        'email@domain.com',
        'sk-1234567890abcdef',
        'ghp_abcdef123456',
        '+1-555-123-4567',
        '123-45-6789',
        'password123',
        'secret_key_here'
      ];

      testCases.forEach(sensitiveData => {
        const testInput = [
          {
            id: 'TEST-1',
            title: `Test with ${sensitiveData}`,
            description: `Contains sensitive data: ${sensitiveData}`
          }
        ];

        const sanitized = sanitizer.sanitizeLinearData(testInput);
        const serialized = JSON.stringify(sanitized);

        expect(serialized).not.toContain(sensitiveData);
      });
    });
  });
});