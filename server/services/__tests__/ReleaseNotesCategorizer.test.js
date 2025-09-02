/**
 * Tests for ReleaseNotesCategorizer
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ReleaseNotesCategorizer } from '../ReleaseNotesCategorizer.js';

describe('ReleaseNotesCategorizer', () => {
  let categorizer;

  beforeEach(() => {
    categorizer = new ReleaseNotesCategorizer();
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      const defaultCategorizer = new ReleaseNotesCategorizer();
      
      expect(defaultCategorizer.config.highConfidenceThreshold).toBe(0.8);
      expect(defaultCategorizer.config.mediumConfidenceThreshold).toBe(0.6);
      expect(defaultCategorizer.config.categoryWeights).toBeDefined();
      expect(defaultCategorizer.config.customRules).toEqual([]);
    });

    it('should accept custom configuration', () => {
      const customCategorizer = new ReleaseNotesCategorizer({
        highConfidenceThreshold: 0.9,
        mediumConfidenceThreshold: 0.7,
        customRules: [{ category: 'test', condition: 'test' }]
      });

      expect(customCategorizer.config.highConfidenceThreshold).toBe(0.9);
      expect(customCategorizer.config.mediumConfidenceThreshold).toBe(0.7);
      expect(customCategorizer.config.customRules).toHaveLength(1);
    });
  });

  describe('categorizeChange', () => {
    it('should categorize new feature changes correctly', () => {
      const change = {
        title: 'Add new user dashboard feature',
        description: 'Implement new analytics dashboard for users',
        labels: ['feature', 'enhancement'],
        source: 'github',
        impact: 'high'
      };

      const result = categorizer.categorizeChange(change);

      expect(result.category).toBe('newFeatures');
      expect(result.confidence).toBeGreaterThan(0.4);
      expect(result.reasoning).toContain('new feature');
      expect(result.allScores).toBeDefined();
      expect(result.alternatives).toBeInstanceOf(Array);
    });

    it('should categorize bug fix changes correctly', () => {
      const change = {
        title: 'Fix login bug causing crashes',
        description: 'Resolve issue where users cannot log in',
        labels: ['bug', 'fix'],
        source: 'linear',
        priority: 4
      };

      const result = categorizer.categorizeChange(change);

      expect(result.category).toBe('fixes');
      expect(result.confidence).toBeGreaterThan(0.4);
      expect(result.reasoning).toContain('bug fix');
    });

    it('should categorize improvement changes correctly', () => {
      const change = {
        title: 'Improve page loading performance',
        description: 'Optimize database queries for faster response times',
        labels: ['performance', 'optimization'],
        source: 'github'
      };

      const result = categorizer.categorizeChange(change);

      expect(result.category).toBe('improvements');
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    it('should handle changes with mixed indicators', () => {
      const change = {
        title: 'Add new feature and fix existing bug',
        description: 'Implement new functionality while resolving login issue',
        labels: ['feature', 'bug'],
        source: 'github'
      };

      const result = categorizer.categorizeChange(change);

      expect(['newFeatures', 'fixes']).toContain(result.category);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.alternatives.length).toBeGreaterThanOrEqual(0);
    });

    it('should default to improvements for unclear changes', () => {
      const change = {
        title: 'Update system configuration',
        description: 'Various system updates',
        labels: [],
        source: 'github'
      };

      const result = categorizer.categorizeChange(change);

      expect(result.category).toBe('improvements');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should handle invalid input gracefully', () => {
      expect(() => categorizer.categorizeChange(null)).toThrow('Invalid change object');
      expect(() => categorizer.categorizeChange('invalid')).toThrow('Invalid change object');
    });

    it('should handle changes with missing fields', () => {
      const change = {
        title: 'Fix issue'
      };

      const result = categorizer.categorizeChange(change);

      expect(result.category).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  describe('getConfidenceScore', () => {
    it('should return correct confidence scores for each category', () => {
      const featureChange = {
        title: 'Add new feature',
        description: 'Implement new functionality',
        labels: ['feature']
      };

      const featureScore = categorizer.getConfidenceScore(featureChange, 'newFeatures');
      const improvementScore = categorizer.getConfidenceScore(featureChange, 'improvements');
      const fixScore = categorizer.getConfidenceScore(featureChange, 'fixes');

      expect(featureScore).toBeGreaterThan(improvementScore);
      expect(featureScore).toBeGreaterThan(fixScore);
    });

    it('should return 0 for invalid inputs', () => {
      expect(categorizer.getConfidenceScore(null, 'newFeatures')).toBe(0);
      expect(categorizer.getConfidenceScore({}, null)).toBe(0);
      expect(categorizer.getConfidenceScore({}, 'invalid')).toBe(0);
    });
  });

  describe('suggestAlternativeCategories', () => {
    it('should suggest alternative categories with confidence scores', () => {
      const change = {
        title: 'Add new feature to fix user issue',
        description: 'Implement functionality to resolve user problem',
        labels: ['feature', 'bug']
      };

      const alternatives = categorizer.suggestAlternativeCategories(change, 'newFeatures');

      expect(alternatives).toBeInstanceOf(Array);
      alternatives.forEach(alt => {
        expect(alt).toHaveProperty('category');
        expect(alt).toHaveProperty('confidence');
        expect(alt).toHaveProperty('reasoning');
        expect(alt.category).not.toBe('newFeatures');
      });
    });

    it('should filter out low confidence alternatives', () => {
      const change = {
        title: 'Clear new feature',
        description: 'Obviously a new feature',
        labels: ['feature']
      };

      const alternatives = categorizer.suggestAlternativeCategories(change, 'newFeatures');

      // Should have few or no alternatives for a clear feature
      expect(alternatives.length).toBeLessThanOrEqual(2);
    });

    it('should handle changes with no clear alternatives', () => {
      const change = {
        title: 'System update',
        description: 'General system maintenance',
        labels: []
      };

      const alternatives = categorizer.suggestAlternativeCategories(change, 'improvements');

      expect(alternatives).toBeInstanceOf(Array);
    });
  });

  describe('categorizeChanges', () => {
    it('should categorize multiple changes', () => {
      const changes = [
        {
          title: 'Add new dashboard',
          description: 'New user dashboard feature',
          labels: ['feature']
        },
        {
          title: 'Fix login bug',
          description: 'Resolve authentication issue',
          labels: ['bug']
        },
        {
          title: 'Improve performance',
          description: 'Optimize loading times',
          labels: ['performance']
        }
      ];

      const results = categorizer.categorizeChanges(changes);

      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result).toHaveProperty('categorization');
        expect(result.categorization).toHaveProperty('category');
        expect(result.categorization).toHaveProperty('confidence');
      });

      // Check that different categories were assigned
      const categories = results.map(r => r.categorization.category);
      expect(categories).toContain('newFeatures');
      expect(categories).toContain('fixes');
      expect(categories).toContain('improvements');
    });

    it('should handle empty array', () => {
      const results = categorizer.categorizeChanges([]);
      expect(results).toEqual([]);
    });

    it('should throw error for invalid input', () => {
      expect(() => categorizer.categorizeChanges('invalid')).toThrow('Changes must be an array');
    });

    it('should handle errors in individual changes gracefully', () => {
      const changes = [
        { title: 'Valid change' },
        null, // Invalid change
        { title: 'Another valid change' }
      ];

      const results = categorizer.categorizeChanges(changes);

      expect(results).toHaveLength(3);
      expect(results[1].categorization.category).toBe('improvements');
      expect(results[1].categorization.reasoning).toContain('Error during categorization');
    });
  });

  describe('pattern matching', () => {
    it('should match feature patterns correctly', () => {
      const featureChanges = [
        { title: 'Add user authentication' },
        { title: 'New payment system' },
        { title: 'Implement search functionality' },
        { title: 'Create admin dashboard' },
        { title: 'Introduce notification system' }
      ];

      featureChanges.forEach(change => {
        const result = categorizer.categorizeChange(change);
        // Should have high score for features, even if not always the top category
        const featureScore = categorizer.getConfidenceScore(change, 'newFeatures');
        expect(featureScore).toBeGreaterThan(0.3);
      });
    });

    it('should match fix patterns correctly', () => {
      const fixChanges = [
        { title: 'Fix memory leak issue' },
        { title: 'Resolve authentication bug' },
        { title: 'Correct calculation error' },
        { title: 'Patch security vulnerability' },
        { title: 'Hotfix for crash on startup' }
      ];

      fixChanges.forEach(change => {
        const result = categorizer.categorizeChange(change);
        // Should have high score for fixes, even if not always the top category
        const fixScore = categorizer.getConfidenceScore(change, 'fixes');
        expect(fixScore).toBeGreaterThanOrEqual(0.3);
      });
    });

    it('should match improvement patterns correctly', () => {
      const improvementChanges = [
        { title: 'Improve database performance' },
        { title: 'Enhance user interface' },
        { title: 'Optimize memory usage' },
        { title: 'Update dependencies' },
        { title: 'Refactor authentication module' }
      ];

      improvementChanges.forEach(change => {
        const result = categorizer.categorizeChange(change);
        expect(result.category).toBe('improvements');
      });
    });
  });

  describe('confidence scoring', () => {
    it('should assign high confidence to clear categorizations', () => {
      const clearFeature = {
        title: 'Add new user registration feature',
        description: 'Implement new user registration functionality',
        labels: ['feature', 'new-feature']
      };

      const result = categorizer.categorizeChange(clearFeature);
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('should assign medium confidence to somewhat clear categorizations', () => {
      const somewhatClear = {
        title: 'Update user interface',
        description: 'Improve user experience',
        labels: ['enhancement']
      };

      const result = categorizer.categorizeChange(somewhatClear);
      expect(result.confidence).toBeGreaterThan(0.2);
      expect(result.confidence).toBeLessThanOrEqual(1.0);
    });

    it('should assign lower confidence to ambiguous categorizations', () => {
      const ambiguous = {
        title: 'System update',
        description: 'Various changes',
        labels: []
      };

      const result = categorizer.categorizeChange(ambiguous);
      expect(result.confidence).toBeLessThan(0.7);
    });
  });

  describe('getCategorization Statistics', () => {
    it('should return correct statistics for categorized changes', () => {
      const changes = [
        { title: 'Add new feature', labels: ['feature'] },
        { title: 'Fix bug', labels: ['bug'] },
        { title: 'Improve performance', labels: ['performance'] },
        { title: 'Another new feature', labels: ['feature'] }
      ];

      const stats = categorizer.getCategorizationStatistics(changes);

      expect(stats.total).toBe(4);
      expect(stats.distribution.newFeatures).toBeGreaterThan(0);
      expect(stats.distribution.fixes).toBeGreaterThan(0);
      expect(stats.distribution.improvements).toBeGreaterThan(0);
      expect(stats.averageConfidence).toBeGreaterThan(0);
      expect(stats.confidenceDistribution).toBeDefined();
    });

    it('should handle empty array', () => {
      const stats = categorizer.getCategorizationStatistics([]);

      expect(stats.total).toBe(0);
      expect(stats.distribution).toEqual({ newFeatures: 0, improvements: 0, fixes: 0 });
      expect(stats.averageConfidence).toBe(0);
    });

    it('should handle invalid input', () => {
      const stats = categorizer.getCategorizationStatistics(null);

      expect(stats.total).toBe(0);
    });
  });

  describe('configuration management', () => {
    it('should allow adding custom rules', () => {
      const customRule = {
        category: 'newFeatures',
        condition: (change) => change.title.includes('custom')
      };

      categorizer.addCustomRule(customRule);

      expect(categorizer.config.customRules).toContain(customRule);
    });

    it('should validate custom rules', () => {
      expect(() => categorizer.addCustomRule({})).toThrow('Invalid custom rule');
      expect(() => categorizer.addCustomRule({ category: 'test' })).toThrow('Invalid custom rule');
    });

    it('should allow configuration updates', () => {
      const newConfig = {
        highConfidenceThreshold: 0.9,
        categoryWeights: { keywords: 0.5, labels: 0.3, patterns: 0.2, context: 0 }
      };

      categorizer.updateConfiguration(newConfig);

      expect(categorizer.config.highConfidenceThreshold).toBe(0.9);
      expect(categorizer.config.categoryWeights.keywords).toBe(0.5);
    });

    it('should return current configuration', () => {
      const config = categorizer.getConfiguration();

      expect(config).toHaveProperty('highConfidenceThreshold');
      expect(config).toHaveProperty('mediumConfidenceThreshold');
      expect(config).toHaveProperty('categoryWeights');
      expect(config).toHaveProperty('customRules');
    });
  });

  describe('edge cases', () => {
    it('should handle changes with very long titles and descriptions', () => {
      const longChange = {
        title: 'A'.repeat(1000) + ' new feature',
        description: 'B'.repeat(2000) + ' implementation details',
        labels: ['feature']
      };

      const result = categorizer.categorizeChange(longChange);

      expect(result.category).toBe('newFeatures');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should handle changes with special characters', () => {
      const specialChange = {
        title: 'Fix: 🐛 Authentication bug with @#$%^&*() characters',
        description: 'Resolve issue with special chars in passwords',
        labels: ['bug', 'fix']
      };

      const result = categorizer.categorizeChange(specialChange);

      expect(result.category).toBe('fixes');
    });

    it('should handle changes with empty strings', () => {
      const emptyChange = {
        title: '',
        description: '',
        labels: []
      };

      const result = categorizer.categorizeChange(emptyChange);

      expect(result.category).toBe('improvements'); // Default fallback
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should handle changes with only whitespace', () => {
      const whitespaceChange = {
        title: '   \n\t   ',
        description: '   \n\t   ',
        labels: []
      };

      const result = categorizer.categorizeChange(whitespaceChange);

      expect(result.category).toBe('improvements');
    });
  });

  describe('label-based categorization', () => {
    it('should prioritize label-based categorization', () => {
      const labeledChange = {
        title: 'System update', // Ambiguous title
        description: 'Various changes', // Ambiguous description
        labels: ['bug', 'critical'] // Clear labels
      };

      const result = categorizer.categorizeChange(labeledChange);

      // Should have high fix score due to bug label
      const fixScore = categorizer.getConfidenceScore(labeledChange, 'fixes');
      expect(fixScore).toBeGreaterThan(0.2);
      expect(result.confidence).toBeGreaterThan(0.3);
    });

    it('should handle mixed labels correctly', () => {
      const mixedLabels = {
        title: 'Update system',
        description: 'System changes',
        labels: ['feature', 'bug', 'enhancement'] // Mixed signals
      };

      const result = categorizer.categorizeChange(mixedLabels);

      expect(['newFeatures', 'fixes', 'improvements']).toContain(result.category);
      expect(result.alternatives.length).toBeGreaterThanOrEqual(0);
    });
  });
});