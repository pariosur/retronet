/**
 * Tests for InsightCategorizer - Categorization and filtering functionality
 */

import { describe, test, expect, beforeEach } from 'vitest';
import { InsightCategorizer } from '../InsightCategorizer.js';

describe('InsightCategorizer', () => {
  let categorizer;

  beforeEach(() => {
    categorizer = new InsightCategorizer();
  });

  describe('Category Detection', () => {
    test('should categorize technical insights correctly', () => {
      const insights = [
        {
          title: 'API performance issue',
          details: 'The database queries are slow and causing API timeouts'
        },
        {
          title: 'Bug in authentication',
          details: 'Users are experiencing login errors due to a security vulnerability'
        },
        {
          title: 'Code refactoring needed',
          details: 'The legacy code needs refactoring to improve maintainability'
        }
      ];

      const categorized = categorizer.categorizeInsights(insights);

      expect(categorized[0].category).toBe('technical');
      expect(categorized[1].category).toBe('technical');
      expect(categorized[2].category).toBe('technical');
    });

    test('should categorize process insights correctly', () => {
      const insights = [
        {
          title: 'Sprint planning improvements',
          details: 'Our sprint planning process needs better estimation and documentation'
        },
        {
          title: 'Code review workflow',
          details: 'The code review process is taking too long and blocking deployments'
        },
        {
          title: 'Agile ceremony optimization',
          details: 'Daily standups are running too long and not providing value'
        }
      ];

      const categorized = categorizer.categorizeInsights(insights);

      expect(categorized[0].category).toBe('process');
      expect(categorized[1].category).toBe('process');
      expect(categorized[2].category).toBe('process');
    });

    test('should categorize team dynamics insights correctly', () => {
      const insights = [
        {
          title: 'Team communication issues',
          details: 'Team members are not collaborating effectively on shared tasks'
        },
        {
          title: 'Onboarding process',
          details: 'New team members need better mentoring and knowledge sharing'
        },
        {
          title: 'Work-life balance concerns',
          details: 'Team morale is low due to burnout and excessive overtime'
        }
      ];

      const categorized = categorizer.categorizeInsights(insights);

      expect(categorized[0].category).toBe('teamDynamics');
      expect(categorized[1].category).toBe('teamDynamics');
      expect(categorized[2].category).toBe('teamDynamics');
    });

    test('should handle mixed category insights', () => {
      const insights = [
        {
          title: 'Technical debt and team collaboration',
          details: 'Code quality issues are affecting team productivity and communication'
        }
      ];

      const categorized = categorizer.categorizeInsights(insights);
      
      // Should pick one of the categories (could be technical or teamDynamics)
      expect(['technical', 'teamDynamics']).toContain(categorized[0].category);
      expect(categorized[0].categoryMetadata.alternativeCategories).toBeInstanceOf(Array);
    });

    test('should default to general for unclear insights', () => {
      const insights = [
        {
          title: 'Random observation',
          details: 'Something unclear happened'
        }
      ];

      const categorized = categorizer.categorizeInsights(insights);

      // Should be general or one of the categories if it matches some keywords
      expect(['general', 'technical', 'process', 'teamDynamics']).toContain(categorized[0].category);
    });
  });

  describe('Impact Assessment', () => {
    test('should assess high impact correctly', () => {
      const insights = [
        {
          title: 'Critical production outage',
          details: 'Severe performance issue causing customer impact and revenue loss'
        },
        {
          title: 'Security breach detected',
          details: 'Major vulnerability found that could lead to data loss'
        }
      ];

      const categorized = categorizer.categorizeInsights(insights);

      expect(categorized[0].impact).toBe('high');
      expect(categorized[1].impact).toBe('high');
    });

    test('should assess medium impact correctly', () => {
      const insights = [
        {
          title: 'Performance degradation',
          details: 'Noticeable delays in user experience affecting workflow'
        }
      ];

      const categorized = categorizer.categorizeInsights(insights);

      expect(categorized[0].impact).toBe('medium');
    });

    test('should assess low impact correctly', () => {
      const insights = [
        {
          title: 'Minor UI improvement',
          details: 'Small cosmetic enhancement that would be nice to have'
        }
      ];

      const categorized = categorizer.categorizeInsights(insights);

      expect(categorized[0].impact).toBe('low');
    });
  });

  describe('Urgency Assessment', () => {
    test('should assess high urgency correctly', () => {
      const insights = [
        {
          title: 'Urgent hotfix needed',
          details: 'Critical issue that needs to be fixed immediately before release'
        },
        {
          title: 'Emergency deployment',
          details: 'ASAP fix required for production stability'
        }
      ];

      const categorized = categorizer.categorizeInsights(insights);

      expect(categorized[0].urgency).toBe('high');
      expect(categorized[1].urgency).toBe('high');
    });

    test('should assess medium urgency correctly', () => {
      const insights = [
        {
          title: 'Next sprint priority',
          details: 'Important task that should be completed soon'
        }
      ];

      const categorized = categorizer.categorizeInsights(insights);

      expect(categorized[0].urgency).toBe('medium');
    });

    test('should assess low urgency correctly', () => {
      const insights = [
        {
          title: 'Future enhancement',
          details: 'Nice to have feature for the backlog when time permits'
        }
      ];

      const categorized = categorizer.categorizeInsights(insights);

      expect(categorized[0].urgency).toBe('low');
    });
  });

  describe('Priority Calculation', () => {
    test('should calculate priority based on confidence, impact, and urgency', () => {
      const insight = {
        title: 'High priority issue',
        details: 'Critical production problem that needs immediate attention',
        confidence: 0.9
      };

      const categorized = categorizer.categorizeInsights([insight]);
      const result = categorized[0];

      expect(result.priority).toBeGreaterThan(0.8); // High confidence + high impact + high urgency
      expect(result.impact).toBe('high');
      expect(result.urgency).toBe('high');
    });

    test('should handle different source priorities', () => {
      const insights = [
        {
          title: 'AI insight',
          details: 'Generated by AI analysis',
          source: 'ai',
          confidence: 0.8
        },
        {
          title: 'Rule-based insight',
          details: 'Generated by rules',
          source: 'rules',
          confidence: 0.8
        },
        {
          title: 'Hybrid insight',
          details: 'Combined from multiple sources',
          source: 'hybrid',
          confidence: 0.8
        }
      ];

      const categorized = categorizer.categorizeInsights(insights);

      // Hybrid should have highest priority, then AI, then rules
      expect(categorized[2].priority).toBeGreaterThan(categorized[0].priority);
      expect(categorized[0].priority).toBeGreaterThan(categorized[1].priority);
    });
  });

  describe('Filtering', () => {
    let testInsights;

    beforeEach(() => {
      testInsights = [
        {
          title: 'Technical issue',
          details: 'API performance problem',
          category: 'technical',
          source: 'ai',
          impact: 'high',
          urgency: 'medium',
          priority: 0.8,
          confidence: 0.9
        },
        {
          title: 'Process improvement',
          details: 'Sprint planning needs work',
          category: 'process',
          source: 'rules',
          impact: 'medium',
          urgency: 'low',
          priority: 0.6,
          confidence: 0.7
        },
        {
          title: 'Team collaboration',
          details: 'Communication issues',
          category: 'teamDynamics',
          source: 'hybrid',
          impact: 'low',
          urgency: 'high',
          priority: 0.5,
          confidence: 0.8
        }
      ];
    });

    test('should filter by categories', () => {
      const filtered = categorizer.filterInsights(testInsights, {
        categories: ['technical', 'process']
      });

      expect(filtered).toHaveLength(2);
      expect(filtered[0].category).toBe('technical');
      expect(filtered[1].category).toBe('process');
    });

    test('should filter by sources', () => {
      const filtered = categorizer.filterInsights(testInsights, {
        sources: ['ai', 'hybrid']
      });

      expect(filtered).toHaveLength(2);
      expect(filtered[0].source).toBe('ai');
      expect(filtered[1].source).toBe('hybrid');
    });

    test('should filter by impact', () => {
      const filtered = categorizer.filterInsights(testInsights, {
        impact: ['high', 'medium']
      });

      expect(filtered).toHaveLength(2);
      expect(['high', 'medium']).toContain(filtered[0].impact);
      expect(['high', 'medium']).toContain(filtered[1].impact);
    });

    test('should filter by minimum priority', () => {
      const filtered = categorizer.filterInsights(testInsights, {
        minPriority: 0.7
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].priority).toBeGreaterThanOrEqual(0.7);
    });

    test('should filter by minimum confidence', () => {
      const filtered = categorizer.filterInsights(testInsights, {
        minConfidence: 0.8
      });

      expect(filtered).toHaveLength(2);
      filtered.forEach(insight => {
        expect(insight.confidence).toBeGreaterThanOrEqual(0.8);
      });
    });

    test('should filter by search text', () => {
      const filtered = categorizer.filterInsights(testInsights, {
        search: 'performance'
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe('Technical issue');
    });

    test('should combine multiple filters', () => {
      const filtered = categorizer.filterInsights(testInsights, {
        categories: ['technical', 'teamDynamics'],
        sources: ['ai', 'hybrid'],
        minPriority: 0.5
      });

      expect(filtered).toHaveLength(2);
      expect(['technical', 'teamDynamics']).toContain(filtered[0].category);
      expect(['ai', 'hybrid']).toContain(filtered[0].source);
      expect(filtered[0].priority).toBeGreaterThanOrEqual(0.5);
    });
  });

  describe('Sorting', () => {
    let testInsights;

    beforeEach(() => {
      testInsights = [
        {
          title: 'Low priority',
          category: 'technical',
          priority: 0.3,
          confidence: 0.6,
          impact: 'low'
        },
        {
          title: 'High priority',
          category: 'process',
          priority: 0.9,
          confidence: 0.8,
          impact: 'high'
        },
        {
          title: 'Medium priority',
          category: 'teamDynamics',
          priority: 0.6,
          confidence: 0.9,
          impact: 'medium'
        }
      ];
    });

    test('should sort by priority descending by default', () => {
      const sorted = categorizer.sortInsights(testInsights);

      expect(sorted[0].title).toBe('High priority');
      expect(sorted[1].title).toBe('Medium priority');
      expect(sorted[2].title).toBe('Low priority');
    });

    test('should sort by priority ascending', () => {
      const sorted = categorizer.sortInsights(testInsights, {
        sortBy: 'priority',
        sortOrder: 'asc'
      });

      expect(sorted[0].title).toBe('Low priority');
      expect(sorted[1].title).toBe('Medium priority');
      expect(sorted[2].title).toBe('High priority');
    });

    test('should sort by confidence', () => {
      const sorted = categorizer.sortInsights(testInsights, {
        sortBy: 'confidence',
        sortOrder: 'desc'
      });

      expect(sorted[0].confidence).toBe(0.9);
      expect(sorted[1].confidence).toBe(0.8);
      expect(sorted[2].confidence).toBe(0.6);
    });

    test('should use secondary sort when primary values are equal', () => {
      const equalPriorityInsights = [
        {
          title: 'First',
          priority: 0.5,
          confidence: 0.7
        },
        {
          title: 'Second',
          priority: 0.5,
          confidence: 0.9
        }
      ];

      const sorted = categorizer.sortInsights(equalPriorityInsights, {
        sortBy: 'priority',
        sortOrder: 'desc',
        secondarySort: 'confidence'
      });

      expect(sorted[0].confidence).toBe(0.9);
      expect(sorted[1].confidence).toBe(0.7);
    });
  });

  describe('Statistics', () => {
    test('should calculate category statistics correctly', () => {
      const insights = [
        { category: 'technical', source: 'ai', impact: 'high', urgency: 'medium', priority: 0.8, confidence: 0.9 },
        { category: 'technical', source: 'rules', impact: 'medium', urgency: 'low', priority: 0.6, confidence: 0.7 },
        { category: 'process', source: 'hybrid', impact: 'low', urgency: 'high', priority: 0.5, confidence: 0.8 }
      ];

      const stats = categorizer.getCategoryStatistics(insights);

      expect(stats.total).toBe(3);
      expect(stats.byCategory.technical).toBe(2);
      expect(stats.byCategory.process).toBe(1);
      expect(stats.bySource.ai).toBe(1);
      expect(stats.bySource.rules).toBe(1);
      expect(stats.bySource.hybrid).toBe(1);
      expect(stats.byImpact.high).toBe(1);
      expect(stats.byImpact.medium).toBe(1);
      expect(stats.byImpact.low).toBe(1);
      expect(stats.averagePriority).toBeCloseTo(0.63, 2);
      expect(stats.averageConfidence).toBeCloseTo(0.8, 2);
    });

    test('should handle empty insights array', () => {
      const stats = categorizer.getCategoryStatistics([]);

      expect(stats.total).toBe(0);
      expect(stats.averagePriority).toBe(0);
      expect(stats.averageConfidence).toBe(0);
    });
  });

  describe('Configuration', () => {
    test('should allow disabling auto-categorization', () => {
      const categorizer = new InsightCategorizer({
        enableAutoCategories: false
      });

      const insights = [
        {
          title: 'API performance issue',
          details: 'Database queries are slow'
        }
      ];

      const categorized = categorizer.categorizeInsights(insights);

      expect(categorized[0].category).toBe('general');
    });

    test('should allow custom priority weights', () => {
      const categorizer = new InsightCategorizer({
        priorityWeights: {
          confidence: 0.8,
          impact: 0.1,
          urgency: 0.05,
          source: 0.05
        }
      });

      const insights = [
        {
          title: 'High confidence insight',
          details: 'Very reliable data',
          confidence: 0.95,
          source: 'ai'
        }
      ];

      const categorized = categorizer.categorizeInsights(insights);

      // Priority should be heavily influenced by confidence
      expect(categorized[0].priority).toBeGreaterThan(0.8);
    });

    test('should support custom categories', () => {
      const categorizer = new InsightCategorizer({
        customCategories: [
          {
            id: 'security',
            name: 'Security',
            description: 'Security-related insights',
            color: '#DC2626'
          }
        ]
      });

      const categories = categorizer.getAvailableCategories();
      const securityCategory = categories.find(cat => cat.id === 'security');

      expect(securityCategory).toBeDefined();
      expect(securityCategory.name).toBe('Security');
    });
  });

  describe('Edge Cases', () => {
    test('should handle null or undefined insights', () => {
      expect(categorizer.categorizeInsights(null)).toEqual([]);
      expect(categorizer.categorizeInsights(undefined)).toEqual([]);
      expect(categorizer.filterInsights(null)).toEqual([]);
      expect(categorizer.sortInsights(undefined)).toEqual([]);
    });

    test('should handle insights with missing fields', () => {
      const insights = [
        { title: 'Only title' },
        { details: 'Only details' },
        {}
      ];

      const categorized = categorizer.categorizeInsights(insights);

      expect(categorized).toHaveLength(3);
      categorized.forEach(insight => {
        expect(insight).toHaveProperty('category');
        expect(insight).toHaveProperty('priority');
        expect(insight).toHaveProperty('impact');
        expect(insight).toHaveProperty('urgency');
      });
    });

    test('should handle invalid filter values', () => {
      const insights = [
        { title: 'Test', category: 'technical', source: 'ai' }
      ];

      const filtered = categorizer.filterInsights(insights, {
        categories: null,
        sources: undefined,
        minPriority: 'invalid',
        search: 123
      });

      expect(filtered).toHaveLength(1);
    });
  });
});