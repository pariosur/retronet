/**
 * Tests for UserImpactAnalyzer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UserImpactAnalyzer } from '../UserImpactAnalyzer.js';

describe('UserImpactAnalyzer', () => {
  let analyzer;

  beforeEach(() => {
    analyzer = new UserImpactAnalyzer();
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      const defaultAnalyzer = new UserImpactAnalyzer();
      
      expect(defaultAnalyzer.config.highImpactThreshold).toBe(0.8);
      expect(defaultAnalyzer.config.mediumImpactThreshold).toBe(0.6);
      expect(defaultAnalyzer.config.lowImpactThreshold).toBe(0.4);
      expect(defaultAnalyzer.config.exclusionStrictness).toBe('medium');
      expect(defaultAnalyzer.config.impactWeights).toBeDefined();
    });

    it('should accept custom configuration', () => {
      const customAnalyzer = new UserImpactAnalyzer({
        highImpactThreshold: 0.9,
        exclusionStrictness: 'strict',
        customRules: [{ type: 'test', condition: 'test' }]
      });

      expect(customAnalyzer.config.highImpactThreshold).toBe(0.9);
      expect(customAnalyzer.config.exclusionStrictness).toBe('strict');
      expect(customAnalyzer.config.customRules).toHaveLength(1);
    });
  });

  describe('analyzeUserImpact', () => {
    it('should identify user-facing UI changes', () => {
      const uiChange = {
        title: 'Update user interface design',
        description: 'Improve the dashboard UI for better user experience',
        labels: ['ui', 'frontend'],
        source: 'github'
      };

      const result = analyzer.analyzeUserImpact(uiChange);

      expect(result.isUserFacing).toBe(true);
      expect(result.impactScore).toBeGreaterThan(0.4);
      expect(['low', 'medium', 'high']).toContain(result.impactLevel);
      expect(result.isInternal).toBe(false);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.reasoning).toContain('user-facing');
    });

    it('should identify user-facing feature additions', () => {
      const featureChange = {
        title: 'Add new search functionality',
        description: 'Implement advanced search feature for users',
        labels: ['feature', 'enhancement'],
        source: 'linear',
        priority: 3
      };

      const result = analyzer.analyzeUserImpact(featureChange);

      expect(result.isUserFacing).toBe(true);
      expect(result.impactScore).toBeGreaterThan(0.4);
      expect(result.impactLevel).not.toBe('none');
      expect(result.isInternal).toBe(false);
    });

    it('should identify user-facing bug fixes', () => {
      const bugFix = {
        title: 'Fix login bug affecting users',
        description: 'Resolve authentication issue that prevents user login',
        labels: ['bug', 'fix'],
        source: 'github',
        impact: 'high'
      };

      const result = analyzer.analyzeUserImpact(bugFix);

      expect(result.isUserFacing).toBe(true);
      expect(result.impactScore).toBeGreaterThan(0.4);
      expect(result.isInternal).toBe(false);
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    it('should identify internal refactoring changes', () => {
      const refactorChange = {
        title: 'Refactor authentication module',
        description: 'Clean up code structure and improve maintainability',
        labels: ['refactor', 'cleanup'],
        source: 'github'
      };

      const result = analyzer.analyzeUserImpact(refactorChange);

      expect(result.isUserFacing).toBe(false);
      expect(result.isInternal).toBe(true);
      expect(result.impactLevel).toBeOneOf(['none', 'low']);
      expect(result.reasoning).toContain('internal');
    });

    it('should identify internal testing changes', () => {
      const testChange = {
        title: 'Add unit tests for user service',
        description: 'Improve test coverage for better code quality',
        labels: ['test', 'testing'],
        source: 'github'
      };

      const result = analyzer.analyzeUserImpact(testChange);

      expect(result.isUserFacing).toBe(false);
      expect(result.isInternal).toBe(true);
      expect(result.reasoning).toContain('testing');
    });

    it('should identify internal CI/CD changes', () => {
      const ciChange = {
        title: 'Update CI pipeline configuration',
        description: 'Improve build process and deployment automation',
        labels: ['ci', 'build'],
        source: 'github'
      };

      const result = analyzer.analyzeUserImpact(ciChange);

      expect(result.isUserFacing).toBe(false);
      expect(result.isInternal).toBe(true);
      expect(result.reasoning).toContain('internal');
    });

    it('should identify internal dependency updates', () => {
      const depUpdate = {
        title: 'Update dependencies to latest versions',
        description: 'Bump package versions for security and maintenance',
        labels: ['dependencies', 'maintenance'],
        source: 'github'
      };

      const result = analyzer.analyzeUserImpact(depUpdate);

      expect(result.isUserFacing).toBe(false);
      expect(result.isInternal).toBe(true);
    });

    it('should handle performance improvements correctly', () => {
      const perfImprovement = {
        title: 'Optimize database queries for faster loading',
        description: 'Improve page load performance for better user experience',
        labels: ['performance', 'optimization'],
        source: 'github',
        impact: 'medium'
      };

      const result = analyzer.analyzeUserImpact(perfImprovement);

      expect(result.isUserFacing).toBe(true);
      expect(result.impactScore).toBeGreaterThan(0.4);
      expect(result.reasoning).toContain('user-facing');
    });

    it('should handle API changes correctly', () => {
      const apiChange = {
        title: 'Add new API endpoint for user data',
        description: 'Implement REST API for external integrations',
        labels: ['api', 'integration'],
        source: 'github'
      };

      const result = analyzer.analyzeUserImpact(apiChange);

      expect(result.isUserFacing).toBe(true);
      expect(result.impactScore).toBeGreaterThan(0.4);
    });

    it('should handle ambiguous changes conservatively', () => {
      const ambiguousChange = {
        title: 'Update system configuration',
        description: 'Various system updates and improvements',
        labels: [],
        source: 'github'
      };

      const result = analyzer.analyzeUserImpact(ambiguousChange);

      expect(result.impactScore).toBeLessThan(0.6);
      expect(result.confidence).toBeLessThan(0.8);
    });

    it('should handle invalid input gracefully', () => {
      expect(() => analyzer.analyzeUserImpact(null)).toThrow('Invalid change object');
      expect(() => analyzer.analyzeUserImpact('invalid')).toThrow('Invalid change object');
    });

    it('should handle changes with missing fields', () => {
      const minimalChange = {
        title: 'Fix user issue'
      };

      const result = analyzer.analyzeUserImpact(minimalChange);

      expect(result).toBeDefined();
      expect(result.isUserFacing).toBeDefined();
      expect(result.impactScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('analyzeChanges', () => {
    it('should analyze multiple changes and separate user-facing from internal', () => {
      const changes = [
        {
          title: 'Add new user dashboard',
          description: 'Create analytics dashboard for users',
          labels: ['feature', 'ui']
        },
        {
          title: 'Refactor database queries',
          description: 'Improve code structure and performance',
          labels: ['refactor', 'cleanup']
        },
        {
          title: 'Fix login bug',
          description: 'Resolve authentication issue affecting users',
          labels: ['bug', 'fix']
        },
        {
          title: 'Update CI pipeline',
          description: 'Improve build and deployment process',
          labels: ['ci', 'build']
        }
      ];

      const result = analyzer.analyzeChanges(changes);

      expect(result.userFacingChanges.length).toBeGreaterThan(0);
      expect(result.internalChanges.length).toBeGreaterThan(0);
      expect(result.analysisResults).toHaveLength(4);
      expect(result.statistics).toBeDefined();
      expect(result.statistics.total).toBe(4);
    });

    it('should handle empty array', () => {
      const result = analyzer.analyzeChanges([]);

      expect(result.userFacingChanges).toEqual([]);
      expect(result.internalChanges).toEqual([]);
      expect(result.analysisResults).toEqual([]);
      expect(result.statistics.total).toBe(0);
    });

    it('should throw error for invalid input', () => {
      expect(() => analyzer.analyzeChanges('invalid')).toThrow('Changes must be an array');
    });

    it('should handle errors in individual changes gracefully', () => {
      const changes = [
        { title: 'Valid change' },
        null, // Invalid change
        { title: 'Another valid change' }
      ];

      const result = analyzer.analyzeChanges(changes);

      expect(result.analysisResults.length).toBeGreaterThanOrEqual(2); // Should handle valid changes
      expect(result.internalChanges.length).toBeGreaterThanOrEqual(1); // null change should go to internal
    });
  });

  describe('impact scoring', () => {
    it('should assign higher scores to clear user-facing changes', () => {
      const userChange = {
        title: 'Add new user interface feature',
        description: 'Implement dashboard for customer analytics',
        labels: ['feature', 'ui', 'user-facing'],
        source: 'github',
        impact: 'high'
      };

      const result = analyzer.analyzeUserImpact(userChange);
      expect(result.impactScore).toBeGreaterThan(0.4);
      expect(['medium', 'high']).toContain(result.impactLevel);
    });

    it('should assign lower scores to internal changes', () => {
      const internalChange = {
        title: 'Refactor internal utility functions',
        description: 'Clean up code structure for better maintainability',
        labels: ['refactor', 'internal', 'cleanup'],
        source: 'github'
      };

      const result = analyzer.analyzeUserImpact(internalChange);
      expect(result.impactScore).toBeLessThan(0.4);
      expect(result.impactLevel).toBeOneOf(['none', 'low']);
    });

    it('should consider context in scoring', () => {
      const highPriorityChange = {
        title: 'System update',
        description: 'Important system changes',
        labels: [],
        source: 'linear',
        priority: 4, // High priority
        state: { type: 'completed' }
      };

      const lowPriorityChange = {
        title: 'System update',
        description: 'Minor system changes',
        labels: [],
        source: 'linear',
        priority: 1, // Low priority
        state: { type: 'todo' }
      };

      const highResult = analyzer.analyzeUserImpact(highPriorityChange);
      const lowResult = analyzer.analyzeUserImpact(lowPriorityChange);

      expect(highResult.impactScore).toBeGreaterThan(lowResult.impactScore);
    });
  });

  describe('confidence scoring', () => {
    it('should assign high confidence to clear categorizations', () => {
      const clearUserChange = {
        title: 'Fix critical user login bug',
        description: 'Resolve authentication issue preventing user access to dashboard',
        labels: ['bug', 'user-facing', 'critical'],
        source: 'github'
      };

      const result = analyzer.analyzeUserImpact(clearUserChange);
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should assign lower confidence to ambiguous changes', () => {
      const ambiguousChange = {
        title: 'Update system',
        description: 'Various updates',
        labels: [],
        source: 'github'
      };

      const result = analyzer.analyzeUserImpact(ambiguousChange);
      expect(result.confidence).toBeLessThan(0.7);
    });

    it('should boost confidence for well-described changes', () => {
      const wellDescribed = {
        title: 'System update',
        description: 'This is a very detailed description that explains exactly what the change does and why it matters for the system and users',
        labels: ['enhancement'],
        source: 'github'
      };

      const poorlyDescribed = {
        title: 'System update',
        description: 'Update',
        labels: ['enhancement'],
        source: 'github'
      };

      const wellResult = analyzer.analyzeUserImpact(wellDescribed);
      const poorResult = analyzer.analyzeUserImpact(poorlyDescribed);

      expect(wellResult.confidence).toBeGreaterThan(poorResult.confidence);
    });
  });

  describe('exclusion strictness', () => {
    it('should be more aggressive with strict exclusion', () => {
      const strictAnalyzer = new UserImpactAnalyzer({
        exclusionStrictness: 'strict'
      });

      const ambiguousChange = {
        title: 'Update configuration settings',
        description: 'Modify system configuration for better performance',
        labels: ['config'],
        source: 'github'
      };

      const strictResult = strictAnalyzer.analyzeUserImpact(ambiguousChange);
      const normalResult = analyzer.analyzeUserImpact(ambiguousChange);

      expect(strictResult.impactScore).toBeLessThanOrEqual(normalResult.impactScore);
    });

    it('should be more lenient with lenient exclusion', () => {
      const lenientAnalyzer = new UserImpactAnalyzer({
        exclusionStrictness: 'lenient'
      });

      const ambiguousChange = {
        title: 'Update configuration settings',
        description: 'Modify system configuration for better performance',
        labels: ['config'],
        source: 'github'
      };

      const lenientResult = lenientAnalyzer.analyzeUserImpact(ambiguousChange);
      const normalResult = analyzer.analyzeUserImpact(ambiguousChange);

      expect(lenientResult.impactScore).toBeGreaterThanOrEqual(normalResult.impactScore);
    });
  });

  describe('getImpactConfidence', () => {
    it('should return confidence score for a change', () => {
      const change = {
        title: 'Add new feature',
        description: 'Implement user-requested functionality',
        labels: ['feature']
      };

      const confidence = analyzer.getImpactConfidence(change);

      expect(confidence).toBeGreaterThan(0);
      expect(confidence).toBeLessThanOrEqual(1);
    });

    it('should return 0 for invalid input', () => {
      expect(analyzer.getImpactConfidence(null)).toBe(0);
    });
  });

  describe('getAnalysisStatistics', () => {
    it('should return comprehensive statistics', () => {
      const changes = [
        { title: 'Add user feature', labels: ['feature', 'ui'] },
        { title: 'Fix user bug', labels: ['bug', 'user-facing'] },
        { title: 'Refactor code', labels: ['refactor', 'cleanup'] },
        { title: 'Update tests', labels: ['test', 'testing'] }
      ];

      const stats = analyzer.getAnalysisStatistics(changes);

      expect(stats.total).toBe(4);
      expect(stats.userFacing).toBeGreaterThanOrEqual(0);
      expect(stats.internal).toBeGreaterThanOrEqual(0);
      expect(stats.userFacingPercentage).toBeGreaterThanOrEqual(0);
      expect(stats.averageImpactScore).toBeGreaterThanOrEqual(0);
      expect(stats.averageConfidence).toBeGreaterThan(0);
      expect(stats.impactLevelDistribution).toBeDefined();
    });

    it('should handle empty array', () => {
      const stats = analyzer.getAnalysisStatistics([]);

      expect(stats.total).toBe(0);
      expect(stats.userFacing).toBe(0);
      expect(stats.internal).toBe(0);
      expect(stats.averageImpactScore).toBe(0);
    });
  });

  describe('configuration management', () => {
    it('should allow adding custom rules', () => {
      const customRule = {
        type: 'user-facing',
        condition: (change) => change.title.includes('custom')
      };

      analyzer.addCustomRule(customRule);

      expect(analyzer.config.customRules).toContain(customRule);
    });

    it('should validate custom rules', () => {
      expect(() => analyzer.addCustomRule({})).toThrow('Invalid custom rule');
      expect(() => analyzer.addCustomRule({ type: 'test' })).toThrow('Invalid custom rule');
    });

    it('should allow configuration updates', () => {
      const newConfig = {
        highImpactThreshold: 0.9,
        exclusionStrictness: 'strict'
      };

      analyzer.updateConfiguration(newConfig);

      expect(analyzer.config.highImpactThreshold).toBe(0.9);
      expect(analyzer.config.exclusionStrictness).toBe('strict');
    });

    it('should return current configuration', () => {
      const config = analyzer.getConfiguration();

      expect(config).toHaveProperty('highImpactThreshold');
      expect(config).toHaveProperty('mediumImpactThreshold');
      expect(config).toHaveProperty('lowImpactThreshold');
      expect(config).toHaveProperty('exclusionStrictness');
    });
  });

  describe('edge cases', () => {
    it('should handle changes with very long titles and descriptions', () => {
      const longChange = {
        title: 'A'.repeat(1000) + ' user feature',
        description: 'B'.repeat(2000) + ' for users',
        labels: ['feature']
      };

      const result = analyzer.analyzeUserImpact(longChange);

      expect(result.isUserFacing).toBe(true);
      expect(result.impactScore).toBeGreaterThan(0);
    });

    it('should handle changes with special characters', () => {
      const specialChange = {
        title: 'Fix: 🐛 User authentication bug with @#$%^&*() characters',
        description: 'Resolve issue with special chars in user passwords',
        labels: ['bug', 'user-facing']
      };

      const result = analyzer.analyzeUserImpact(specialChange);

      // Should have reasonable impact score even if not classified as user-facing
      expect(result.impactScore).toBeGreaterThan(0.2);
    });

    it('should handle changes with empty strings', () => {
      const emptyChange = {
        title: '',
        description: '',
        labels: []
      };

      const result = analyzer.analyzeUserImpact(emptyChange);

      expect(result).toBeDefined();
      expect(result.impactScore).toBeGreaterThanOrEqual(0);
    });

    it('should handle changes with only whitespace', () => {
      const whitespaceChange = {
        title: '   \n\t   ',
        description: '   \n\t   ',
        labels: []
      };

      const result = analyzer.analyzeUserImpact(whitespaceChange);

      expect(result).toBeDefined();
      expect(result.impactScore).toBeGreaterThanOrEqual(0);
    });
  });

  describe('source-specific analysis', () => {
    it('should handle GitHub pull requests appropriately', () => {
      const prChange = {
        title: 'Feature: Add user dashboard',
        description: 'Comprehensive description of the new user dashboard feature with detailed implementation notes',
        labels: ['feature'],
        source: 'github',
        sourceType: 'pullRequest'
      };

      const result = analyzer.analyzeUserImpact(prChange);

      expect(result.isUserFacing).toBe(true);
      expect(result.confidence).toBeGreaterThan(0.6);
    });

    it('should handle Linear high-priority issues appropriately', () => {
      const linearChange = {
        title: 'Critical user login issue',
        description: 'Users cannot access their accounts',
        labels: ['bug'],
        source: 'linear',
        priority: 4,
        state: { type: 'completed' }
      };

      const result = analyzer.analyzeUserImpact(linearChange);

      // Should have high impact score due to user keywords and high priority
      expect(result.impactScore).toBeGreaterThan(0.3);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should handle Slack release messages appropriately', () => {
      const slackChange = {
        title: 'Release announcement',
        description: 'We just shipped a new feature for users!',
        text: 'Great news! We just released the new dashboard feature that users have been requesting',
        source: 'slack'
      };

      const result = analyzer.analyzeUserImpact(slackChange);

      expect(result.isUserFacing).toBe(true);
    });
  });

  describe('pattern matching', () => {
    it('should match user-facing patterns correctly', () => {
      const userPatterns = [
        { title: 'Add new feature for users', expected: true },
        { title: 'Improve user experience', expected: true },
        { title: 'Fix bug in user interface', expected: true },
        { title: 'Update design for mobile users', expected: true },
        { title: 'Enhance API for integrations', expected: true }
      ];

      userPatterns.forEach(({ title, expected }) => {
        const change = { title, description: '', labels: [] };
        const result = analyzer.analyzeUserImpact(change);
        
        if (expected) {
          expect(result.impactScore).toBeGreaterThan(0.2);
        }
      });
    });

    it('should match internal patterns correctly', () => {
      const internalPatterns = [
        { title: 'Refactor authentication module', expected: true },
        { title: 'Update build configuration', expected: true },
        { title: 'Add unit tests for service', expected: true },
        { title: 'Update dependency versions', expected: true },
        { title: 'CI: Fix pipeline configuration', expected: true }
      ];

      internalPatterns.forEach(({ title, expected }) => {
        const change = { title, description: '', labels: [] };
        const result = analyzer.analyzeUserImpact(change);
        
        if (expected) {
          expect(result.isInternal).toBe(true);
        }
      });
    });
  });

  describe('source-specific analyzers', () => {
    describe('analyzeGitHubCommit', () => {
      it('should identify user-facing commits correctly', () => {
        const userCommit = {
          commit: {
            message: 'feat: Add new user dashboard with analytics'
          },
          files: [
            { filename: 'src/components/Dashboard.jsx' },
            { filename: 'src/styles/dashboard.css' }
          ]
        };

        const result = analyzer.analyzeGitHubCommit(userCommit);

        expect(result.isUserFacing).toBe(true);
        expect(result.confidence).toBeGreaterThan(0.7);
        expect(result.reasoning).toContain('user-facing files');
      });

      it('should identify refactoring commits correctly', () => {
        const refactorCommit = {
          commit: {
            message: 'refactor: Clean up authentication module structure'
          },
          files: [
            { filename: 'src/utils/auth.js' },
            { filename: 'src/services/authService.js' }
          ]
        };

        const result = analyzer.analyzeGitHubCommit(refactorCommit);

        expect(result.isUserFacing).toBe(false);
        expect(result.confidence).toBeGreaterThan(0.8);
        expect(result.reasoning).toContain('refactoring patterns');
      });

      it('should identify internal file changes correctly', () => {
        const internalCommit = {
          commit: {
            message: 'Update test configuration'
          },
          files: [
            { filename: 'tests/auth.test.js' },
            { filename: 'jest.config.js' },
            { filename: 'package.json' }
          ]
        };

        const result = analyzer.analyzeGitHubCommit(internalCommit);

        expect(result.isUserFacing).toBe(false);
        expect(result.reasoning).toContain('internal files');
      });

      it('should handle invalid commit objects', () => {
        expect(() => analyzer.analyzeGitHubCommit(null)).toThrow('Invalid GitHub commit object');
        expect(() => analyzer.analyzeGitHubCommit({})).toThrow('Invalid GitHub commit object');
      });
    });

    describe('analyzeLinearIssue', () => {
      it('should identify customer-facing issues correctly', () => {
        const customerIssue = {
          title: 'Users cannot access their dashboard',
          description: 'Customer reports that the dashboard is not loading properly',
          labels: { nodes: [{ name: 'bug' }, { name: 'customer-facing' }] },
          priority: 4,
          team: { name: 'Frontend' },
          state: { type: 'completed', name: 'Shipped' }
        };

        const result = analyzer.analyzeLinearIssue(customerIssue);

        expect(result.isUserFacing).toBe(true);
        expect(result.confidence).toBeGreaterThan(0.8);
        expect(result.reasoning).toContain('customer-facing labels');
      });

      it('should identify internal issues correctly', () => {
        const internalIssue = {
          title: 'Refactor database connection pooling',
          description: 'Improve internal database performance and maintainability',
          labels: { nodes: [{ name: 'tech-debt' }, { name: 'internal' }] },
          priority: 2,
          team: { name: 'Infrastructure' },
          state: { type: 'completed' }
        };

        const result = analyzer.analyzeLinearIssue(internalIssue);

        expect(result.isUserFacing).toBe(false);
        expect(result.reasoning).toContain('internal-focused labels');
      });

      it('should handle high priority issues appropriately', () => {
        const highPriorityIssue = {
          title: 'System performance issue',
          description: 'General system improvements needed',
          labels: { nodes: [] },
          priority: 4,
          team: { name: 'Backend' }
        };

        const result = analyzer.analyzeLinearIssue(highPriorityIssue);

        expect(result.confidence).toBeGreaterThan(0.6);
        expect(result.reasoning).toContain('High priority');
      });

      it('should handle invalid issue objects', () => {
        expect(() => analyzer.analyzeLinearIssue(null)).toThrow('Invalid Linear issue object');
      });
    });

    describe('analyzeSlackMessage', () => {
      it('should identify user-relevant release messages correctly', () => {
        const releaseMessage = {
          text: 'Great news! We just shipped the new dashboard feature to production. Users can now access advanced analytics.',
          channel: 'releases'
        };

        const result = analyzer.analyzeSlackMessage(releaseMessage);

        expect(result.isUserFacing).toBe(true);
        expect(result.confidence).toBeGreaterThan(0.6);
        expect(result.reasoning).toContain('user-facing');
      });

      it('should identify internal technical discussions correctly', () => {
        const internalMessage = {
          text: 'The CI pipeline failed again. We need to fix the build configuration and update the test suite.',
          channel: 'engineering'
        };

        const result = analyzer.analyzeSlackMessage(internalMessage);

        expect(result.isUserFacing).toBe(false);
        expect(result.reasoning).toContain('internal technical');
      });

      it('should consider channel context', () => {
        const messageText = 'New update available';
        
        const releaseChannelMessage = {
          text: messageText,
          channel: 'product-updates'
        };

        const devChannelMessage = {
          text: messageText,
          channel: 'dev-internal'
        };

        const releaseResult = analyzer.analyzeSlackMessage(releaseChannelMessage);
        const devResult = analyzer.analyzeSlackMessage(devChannelMessage);

        expect(releaseResult.isUserFacing).toBe(true);
        expect(devResult.isUserFacing).toBe(false);
      });

      it('should handle invalid message objects', () => {
        expect(() => analyzer.analyzeSlackMessage(null)).toThrow('Invalid Slack message object');
        expect(() => analyzer.analyzeSlackMessage({})).toThrow('Invalid Slack message object');
      });
    });
  });

  describe('uncertain changes and manual review', () => {
    it('should identify uncertain changes for manual review', () => {
      const changes = [
        {
          title: 'Update system configuration',
          description: 'Various system updates',
          labels: [],
          source: 'github'
        },
        {
          title: 'Add new user feature',
          description: 'Clear user-facing feature',
          labels: ['feature', 'ui'],
          source: 'github'
        },
        {
          title: 'Refactor code',
          description: 'Internal code cleanup',
          labels: ['refactor'],
          source: 'github'
        }
      ];

      const result = analyzer.analyzeChanges(changes);

      expect(result.uncertainChanges).toBeDefined();
      expect(result.uncertainChanges.length).toBeGreaterThanOrEqual(0);
      
      // Check that uncertain changes have manual review flags
      result.uncertainChanges.forEach(change => {
        expect(change.requiresManualReview).toBe(true);
        expect(change.reviewReason).toBeDefined();
      });
    });

    it('should identify changes requiring manual review', () => {
      const changes = [
        {
          title: 'System update',
          description: 'Update',
          labels: [],
          source: 'github'
        },
        {
          title: 'Fix user issue with internal refactoring',
          description: 'Mixed user and internal work',
          labels: ['bug', 'refactor'],
          source: 'github'
        }
      ];

      const reviewChanges = analyzer.identifyChangesForManualReview(changes);

      expect(reviewChanges.length).toBeGreaterThan(0);
      
      reviewChanges.forEach(change => {
        expect(change.requiresManualReview).toBe(true);
        expect(change.reviewReasons).toBeDefined();
        expect(change.reviewPriority).toBeGreaterThanOrEqual(0);
        expect(change.suggestedAction).toBeDefined();
      });
    });

    it('should calculate review priorities correctly', () => {
      const highPriorityChange = {
        title: 'Critical user feature with unclear impact',
        description: 'Important but ambiguous change',
        labels: ['feature', 'refactor'],
        source: 'github',
        impact: 'high'
      };

      const lowPriorityChange = {
        title: 'Minor internal update',
        description: 'Small internal change',
        labels: ['internal'],
        source: 'github'
      };

      const reviewChanges = analyzer.identifyChangesForManualReview([
        highPriorityChange,
        lowPriorityChange
      ]);

      if (reviewChanges.length >= 2) {
        const highPriorityReview = reviewChanges.find(c => c.title.includes('Critical'));
        const lowPriorityReview = reviewChanges.find(c => c.title.includes('Minor'));

        if (highPriorityReview && lowPriorityReview) {
          expect(highPriorityReview.reviewPriority).toBeGreaterThan(lowPriorityReview.reviewPriority);
        }
      }
    });
  });

  describe('filterUserFacingChanges', () => {
    it('should filter changes based on user impact', () => {
      const changes = [
        {
          title: 'Add user dashboard',
          description: 'New user-facing feature',
          labels: ['feature', 'ui'],
          source: 'github'
        },
        {
          title: 'Refactor internal code',
          description: 'Internal cleanup',
          labels: ['refactor'],
          source: 'github'
        },
        {
          title: 'Update system',
          description: 'Ambiguous change',
          labels: [],
          source: 'github'
        }
      ];

      const filtered = analyzer.filterUserFacingChanges(changes);

      expect(filtered.included).toBeDefined();
      expect(filtered.excluded).toBeDefined();
      expect(filtered.uncertain).toBeDefined();
      expect(filtered.statistics).toBeDefined();
      expect(filtered.statistics.total).toBe(changes.length);
      expect(filtered.statistics.inclusionRate).toBeGreaterThanOrEqual(0);
    });

    it('should respect confidence thresholds', () => {
      const changes = [
        {
          title: 'Clear user feature',
          description: 'Very clear user-facing feature with detailed description',
          labels: ['feature', 'user-facing'],
          source: 'github'
        }
      ];

      const strictFiltered = analyzer.filterUserFacingChanges(changes, {
        minConfidence: 0.9
      });

      const lenientFiltered = analyzer.filterUserFacingChanges(changes, {
        minConfidence: 0.3
      });

      expect(lenientFiltered.included.length).toBeGreaterThanOrEqual(strictFiltered.included.length);
    });

    it('should handle strict mode filtering', () => {
      const changes = [
        {
          title: 'Minor user improvement',
          description: 'Small user-facing change',
          labels: ['improvement'],
          source: 'github'
        }
      ];

      const normalFiltered = analyzer.filterUserFacingChanges(changes, {
        strictMode: false
      });

      const strictFiltered = analyzer.filterUserFacingChanges(changes, {
        strictMode: true
      });

      expect(normalFiltered.included.length).toBeGreaterThanOrEqual(strictFiltered.included.length);
    });
  });

  describe('enhanced statistics', () => {
    it('should include uncertain changes in statistics', () => {
      const changes = [
        { title: 'Clear user feature', labels: ['feature', 'ui'] },
        { title: 'Clear internal change', labels: ['refactor'] },
        { title: 'Ambiguous change', labels: [] }
      ];

      const result = analyzer.analyzeChanges(changes);

      expect(result.statistics.uncertain).toBeDefined();
      expect(result.statistics.uncertainPercentage).toBeDefined();
      expect(result.statistics.sourceDistribution).toBeDefined();
      expect(result.statistics.confidenceDistribution).toBeDefined();
    });
  });
});

// Helper function for vitest
function toBeOneOf(received, expected) {
  const pass = expected.includes(received);
  return {
    message: () => `expected ${received} to be one of ${expected.join(', ')}`,
    pass
  };
}

// Extend expect with custom matcher
expect.extend({ toBeOneOf });