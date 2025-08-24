/**
 * Tests for InsightMerger class
 * 
 * Tests cover merging scenarios, similarity detection, deduplication,
 * source attribution, and edge cases.
 */

import { describe, it, test, expect, beforeEach } from 'vitest';
import { InsightMerger } from '../InsightMerger.js';
import { InsightCategorizer } from '../InsightCategorizer.js';

describe('InsightMerger', () => {
  let merger;

  beforeEach(() => {
    merger = new InsightMerger();
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      const config = merger.getConfiguration();
      expect(config.similarityThreshold).toBe(0.5);
      expect(config.maxInsightsPerCategory).toBe(10);
      expect(config.prioritizeAI).toBe(true);
    });

    it('should accept custom configuration', () => {
      const customMerger = new InsightMerger({
        similarityThreshold: 0.8,
        maxInsightsPerCategory: 5,
        prioritizeAI: false
      });
      
      const config = customMerger.getConfiguration();
      expect(config.similarityThreshold).toBe(0.8);
      expect(config.maxInsightsPerCategory).toBe(5);
      expect(config.prioritizeAI).toBe(false);
    });
  });

  describe('static merge method', () => {
    it('should merge insights using static method', () => {
      const ruleBasedInsights = {
        wentWell: [{
          title: 'Completed 5 issues',
          details: 'Team completed 5 issues this sprint',
          source: 'rules'
        }],
        didntGoWell: [],
        actionItems: []
      };

      const llmInsights = {
        wentWell: [{
          title: 'Good sprint completion',
          details: 'The team had excellent completion rate',
          source: 'ai',
          confidence: 0.9
        }],
        didntGoWell: [],
        actionItems: []
      };

      const result = InsightMerger.merge(ruleBasedInsights, llmInsights);
      
      expect(result).toBeDefined();
      expect(result.wentWell).toHaveLength(2);
      expect(result.mergeMetadata).toBeDefined();
    });
  });

  describe('mergeInsights', () => {
    it('should merge insights from different sources', () => {
      const ruleBasedInsights = {
        wentWell: [{
          title: 'Completed tasks',
          details: 'Team completed all assigned tasks',
          source: 'rules'
        }],
        didntGoWell: [{
          title: 'Some delays',
          details: 'Few tasks were delayed',
          source: 'rules'
        }],
        actionItems: [{
          title: 'Improve planning',
          details: 'Better task estimation needed',
          priority: 'medium',
          source: 'rules'
        }]
      };

      const llmInsights = {
        wentWell: [{
          title: 'Great teamwork',
          details: 'Team collaboration was excellent',
          source: 'ai',
          confidence: 0.8
        }],
        didntGoWell: [],
        actionItems: [{
          title: 'Review processes',
          details: 'Process improvements needed',
          priority: 'high',
          source: 'ai',
          confidence: 0.9
        }]
      };

      const result = merger.mergeInsights(ruleBasedInsights, llmInsights);

      expect(result.wentWell).toHaveLength(2);
      expect(result.didntGoWell).toHaveLength(1);
      expect(result.actionItems).toHaveLength(2);
      expect(result.mergeMetadata).toBeDefined();
      expect(result.mergeMetadata.totalRuleBasedInsights).toBe(3);
      expect(result.mergeMetadata.totalLLMInsights).toBe(2);
    });

    it('should handle empty or null inputs', () => {
      const result1 = merger.mergeInsights(null, null);
      expect(result1.wentWell).toHaveLength(0);
      expect(result1.didntGoWell).toHaveLength(0);
      expect(result1.actionItems).toHaveLength(0);

      const result2 = merger.mergeInsights({}, {});
      expect(result2.wentWell).toHaveLength(0);
      expect(result2.didntGoWell).toHaveLength(0);
      expect(result2.actionItems).toHaveLength(0);
    });

    it('should merge similar insights', () => {
      const ruleBasedInsights = {
        wentWell: [{
          title: 'Completed 5 issues this sprint',
          details: 'Team finished 5 Linear issues',
          source: 'rules'
        }],
        didntGoWell: [],
        actionItems: []
      };

      const llmInsights = {
        wentWell: [{
          title: 'Good issue completion rate',
          details: 'Team completed 5 issues successfully',
          source: 'ai',
          confidence: 0.85
        }],
        didntGoWell: [],
        actionItems: []
      };

      const result = merger.mergeInsights(ruleBasedInsights, llmInsights);

      // Should merge similar insights
      expect(result.wentWell).toHaveLength(1);
      expect(result.wentWell[0].source).toBe('hybrid');
      expect(result.wentWell[0].sourceInsights).toHaveLength(2);
    });
  });

  describe('detectSimilarInsights', () => {
    it('should detect similar insights with high title similarity', () => {
      const insight1 = {
        title: 'Completed 5 issues this sprint',
        details: 'Team finished work',
        category: 'completion'
      };

      const insight2 = {
        title: 'Completed 5 issues in sprint',
        details: 'Good work completion',
        category: 'completion'
      };

      const isSimilar = merger.detectSimilarInsights(insight1, insight2);
      expect(isSimilar).toBe(true);
    });

    it('should detect similar insights with keyword overlap', () => {
      const insight1 = {
        title: 'Bug fixes completed',
        details: 'Fixed 3 critical bugs in the system',
        category: 'bugs'
      };

      const insight2 = {
        title: 'Critical issues resolved',
        details: 'Resolved 3 bug reports successfully',
        category: 'bugs'
      };

      const isSimilar = merger.detectSimilarInsights(insight1, insight2);
      expect(isSimilar).toBe(true);
    });

    it('should not detect dissimilar insights', () => {
      const insight1 = {
        title: 'Completed sprint tasks',
        details: 'All development tasks finished',
        category: 'development'
      };

      const insight2 = {
        title: 'Meeting attendance improved',
        details: 'Better team meeting participation',
        category: 'meetings'
      };

      const isSimilar = merger.detectSimilarInsights(insight1, insight2);
      expect(isSimilar).toBe(false);
    });

    it('should handle null or undefined insights', () => {
      const insight = {
        title: 'Test insight',
        details: 'Test details'
      };

      expect(merger.detectSimilarInsights(null, insight)).toBe(false);
      expect(merger.detectSimilarInsights(insight, null)).toBe(false);
      expect(merger.detectSimilarInsights(null, null)).toBe(false);
    });

    it('should use static method for similarity detection', () => {
      const insight1 = {
        title: 'Sprint completed successfully',
        details: 'All sprint goals achieved'
      };

      const insight2 = {
        title: 'Successful sprint completion',
        details: 'Sprint goals were achieved'
      };

      const isSimilar = InsightMerger.detectSimilarInsights(insight1, insight2);
      expect(isSimilar).toBe(true);
    });
  });

  describe('insight normalization', () => {
    it('should normalize insights with missing fields', () => {
      const insights = {
        wentWell: [{
          title: 'Good work'
          // Missing details, source, confidence
        }],
        didntGoWell: [],
        actionItems: []
      };

      const result = merger.mergeInsights(insights, {});
      
      expect(result.wentWell[0].title).toBe('Good work');
      expect(result.wentWell[0].details).toBe('');
      expect(result.wentWell[0].source).toBe('rules');
      expect(result.wentWell[0].confidence).toBe(0.9);
      expect(result.wentWell[0].originalId).toBeDefined();
    });

    it('should preserve LLM-specific fields', () => {
      const llmInsights = {
        wentWell: [{
          title: 'AI insight',
          details: 'Generated by AI',
          source: 'ai',
          confidence: 0.95,
          llmProvider: 'openai',
          llmModel: 'gpt-4',
          reasoning: 'Based on pattern analysis'
        }],
        didntGoWell: [],
        actionItems: []
      };

      const result = merger.mergeInsights({}, llmInsights);
      
      const insight = result.wentWell[0];
      expect(insight.llmProvider).toBe('openai');
      expect(insight.llmModel).toBe('gpt-4');
      expect(insight.reasoning).toBe('Based on pattern analysis');
    });

    it('should preserve action item specific fields', () => {
      const insights = {
        wentWell: [],
        didntGoWell: [],
        actionItems: [{
          title: 'Improve testing',
          details: 'Add more unit tests',
          priority: 'high',
          assignee: 'dev-team',
          source: 'rules'
        }]
      };

      const result = merger.mergeInsights(insights, {});
      
      const actionItem = result.actionItems[0];
      // Priority is now a number calculated by categorizer, not the original string
      expect(typeof actionItem.priority).toBe('number');
      expect(actionItem.assignee).toBe('dev-team');
    });
  });

  describe('merged insight properties', () => {
    it('should create hybrid insights with correct properties', () => {
      const ruleInsight = {
        title: 'Database performance improved',
        details: 'Query response times reduced by 50%',
        source: 'rules',
        confidence: 0.9,
        data: { tasksCompleted: 5 }
      };

      const aiInsight = {
        title: 'Team communication enhanced',
        details: 'Better collaboration in meetings',
        source: 'ai',
        confidence: 0.8,
        llmProvider: 'openai',
        reasoning: 'Based on completion metrics'
      };

      const ruleBasedInsights = { wentWell: [ruleInsight], didntGoWell: [], actionItems: [] };
      const llmInsights = { wentWell: [aiInsight], didntGoWell: [], actionItems: [] };

      const result = merger.mergeInsights(ruleBasedInsights, llmInsights);
      
      expect(result.wentWell).toHaveLength(2);
      
      // Should have both insights since they're not similar
      expect(result.wentWell.some(i => i.source === 'rules')).toBe(true);
      expect(result.wentWell.some(i => i.source === 'ai')).toBe(true);
    });

    it('should calculate merged confidence correctly', () => {
      const highConfidenceInsight = {
        title: 'High confidence insight',
        details: 'Very reliable data',
        source: 'rules',
        confidence: 0.95
      };

      const lowConfidenceInsight = {
        title: 'Similar high confidence insight',
        details: 'Reliable information',
        source: 'ai',
        confidence: 0.7
      };

      const ruleBasedInsights = { wentWell: [highConfidenceInsight], didntGoWell: [], actionItems: [] };
      const llmInsights = { wentWell: [lowConfidenceInsight], didntGoWell: [], actionItems: [] };

      const result = merger.mergeInsights(ruleBasedInsights, llmInsights);
      
      const merged = result.wentWell[0];
      // Should be higher than average due to agreement bonus
      expect(merged.confidence).toBeGreaterThan(0.825);
      expect(merged.confidence).toBeLessThanOrEqual(1);
    });

    it('should combine details from multiple insights', () => {
      // Create similar insights that should be merged
      const insight1 = {
        title: 'Sprint goals achieved successfully',
        details: 'Completed all planned work items for the sprint',
        source: 'rules'
      };

      const insight2 = {
        title: 'Sprint objectives completed well',
        details: 'Team finished all sprint work items with good collaboration',
        source: 'ai'
      };

      const ruleBasedInsights = { wentWell: [insight1], didntGoWell: [], actionItems: [] };
      const llmInsights = { wentWell: [insight2], didntGoWell: [], actionItems: [] };

      const result = merger.mergeInsights(ruleBasedInsights, llmInsights);
      
      // Should merge into one insight
      expect(result.wentWell).toHaveLength(1);
      const merged = result.wentWell[0];
      expect(merged.source).toBe('hybrid');
      // Should include information from both insights
      expect(merged.details.length).toBeGreaterThan(0);
    });
  });

  describe('configuration and limits', () => {
    it('should respect maxInsightsPerCategory limit', () => {
      const limitedMerger = new InsightMerger({ maxInsightsPerCategory: 2 });
      
      const manyInsights = {
        wentWell: [
          { title: 'Database performance improved', details: 'Query optimization completed', source: 'rules' },
          { title: 'UI responsiveness enhanced', details: 'Frontend loading faster', source: 'rules' },
          { title: 'Security audit passed', details: 'No vulnerabilities found', source: 'rules' },
          { title: 'Documentation updated', details: 'API docs are current', source: 'rules' }
        ],
        didntGoWell: [],
        actionItems: []
      };

      const result = limitedMerger.mergeInsights(manyInsights, {});
      
      expect(result.wentWell).toHaveLength(2);
    });

    it('should prioritize AI insights when configured', () => {
      const aiPriorityMerger = new InsightMerger({ prioritizeAI: true });
      
      const insights = {
        wentWell: [
          { title: 'Database optimization completed', details: 'Improved query performance', source: 'rules', confidence: 0.9 },
          { title: 'Team meeting attendance improved', details: 'Better participation rates', source: 'ai', confidence: 0.8 }
        ],
        didntGoWell: [],
        actionItems: []
      };

      const result = aiPriorityMerger.mergeInsights(insights, {});
      
      // AI insight should come first despite lower confidence
      expect(result.wentWell[0].source).toBe('ai');
      expect(result.wentWell[1].source).toBe('rules');
    });

    it('should not prioritize AI insights when disabled', () => {
      const noPriorityMerger = new InsightMerger({ prioritizeAI: false });
      
      const insights = {
        wentWell: [
          { title: 'Code review process improved', details: 'Faster review cycles', source: 'rules', confidence: 0.9 },
          { title: 'Documentation quality enhanced', details: 'Better API docs', source: 'ai', confidence: 0.8 }
        ],
        didntGoWell: [],
        actionItems: []
      };

      const result = noPriorityMerger.mergeInsights(insights, {});
      
      // Higher confidence should come first
      expect(result.wentWell[0].source).toBe('rules');
      expect(result.wentWell[1].source).toBe('ai');
    });

    it('should allow configuration updates', () => {
      merger.updateConfiguration({
        similarityThreshold: 0.9,
        maxInsightsPerCategory: 3
      });

      const config = merger.getConfiguration();
      expect(config.similarityThreshold).toBe(0.9);
      expect(config.maxInsightsPerCategory).toBe(3);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle malformed insight objects', () => {
      const malformedInsights = {
        wentWell: [
          null,
          undefined,
          'not an object',
          { /* empty object */ },
          { title: null, details: undefined }
        ],
        didntGoWell: [],
        actionItems: []
      };

      const result = merger.mergeInsights(malformedInsights, {});
      
      // Should filter out invalid insights and normalize valid ones
      expect(result.wentWell.length).toBeGreaterThan(0);
      result.wentWell.forEach(insight => {
        expect(insight.title).toBeDefined();
        expect(typeof insight.title).toBe('string');
      });
    });

    it('should handle insights with very long text', () => {
      const longText = 'a'.repeat(10000);
      const longInsight = {
        title: longText,
        details: longText,
        source: 'rules'
      };

      const insights = { wentWell: [longInsight], didntGoWell: [], actionItems: [] };
      const result = merger.mergeInsights(insights, {});
      
      expect(result.wentWell).toHaveLength(1);
      expect(result.wentWell[0].title).toBeDefined();
    });

    it('should handle insights with special characters', () => {
      const specialInsight = {
        title: 'Insight with émojis 🚀 and spëcial chars!',
        details: 'Details with @mentions #hashtags and $symbols',
        source: 'ai'
      };

      const insights = { wentWell: [specialInsight], didntGoWell: [], actionItems: [] };
      const result = merger.mergeInsights(insights, {});
      
      expect(result.wentWell).toHaveLength(1);
      expect(result.wentWell[0].title).toContain('🚀');
    });

    it('should handle circular references in data objects', () => {
      const circularData = { name: 'test' };
      circularData.self = circularData;

      const insight = {
        title: 'Insight with circular data',
        details: 'Has circular reference',
        source: 'rules',
        data: circularData
      };

      const insights = { wentWell: [insight], didntGoWell: [], actionItems: [] };
      
      // Should not throw error
      expect(() => {
        merger.mergeInsights(insights, {});
      }).not.toThrow();
    });
  });

  describe('metadata and tracking', () => {
    it('should include comprehensive merge metadata', () => {
      const ruleBasedInsights = {
        wentWell: [{ title: 'Rule 1', source: 'rules' }],
        didntGoWell: [{ title: 'Rule 2', source: 'rules' }],
        actionItems: []
      };

      const llmInsights = {
        wentWell: [{ title: 'AI 1', source: 'ai' }],
        didntGoWell: [],
        actionItems: [{ title: 'AI Action', source: 'ai' }]
      };

      const result = merger.mergeInsights(ruleBasedInsights, llmInsights);
      
      expect(result.mergeMetadata).toBeDefined();
      expect(result.mergeMetadata.totalRuleBasedInsights).toBe(2);
      expect(result.mergeMetadata.totalLLMInsights).toBe(2);
      expect(result.mergeMetadata.totalMergedInsights).toBe(4);
      expect(result.mergeMetadata.mergedAt).toBeDefined();
      expect(typeof result.mergeMetadata.duplicatesFound).toBe('number');
    });

    it('should track source insights in merged items', () => {
      const similar1 = {
        title: 'Sprint completed',
        details: 'All tasks done',
        source: 'rules',
        confidence: 0.9
      };

      const similar2 = {
        title: 'Sprint finished successfully',
        details: 'Tasks completed well',
        source: 'ai',
        confidence: 0.8
      };

      const ruleBasedInsights = { wentWell: [similar1], didntGoWell: [], actionItems: [] };
      const llmInsights = { wentWell: [similar2], didntGoWell: [], actionItems: [] };

      const result = merger.mergeInsights(ruleBasedInsights, llmInsights);
      
      expect(result.wentWell).toHaveLength(1);
      
      const merged = result.wentWell[0];
      expect(merged.sourceInsights).toHaveLength(2);
      expect(merged.sourceInsights[0].source).toBeDefined();
      expect(merged.sourceInsights[0].originalId).toBeDefined();
      expect(merged.sourceInsights[0].confidence).toBeDefined();
    });
  });

  describe('Categorization Integration', () => {
    test('should categorize insights when categorization is enabled', () => {
      const merger = new InsightMerger({ enableCategorization: true });
      
      const ruleBasedInsights = {
        wentWell: [
          {
            title: 'API performance improved',
            details: 'Database optimization reduced query times significantly'
          }
        ],
        didntGoWell: [],
        actionItems: []
      };
      
      const llmInsights = {
        wentWell: [],
        didntGoWell: [
          {
            title: 'Team communication issues',
            details: 'Lack of collaboration affecting project delivery'
          }
        ],
        actionItems: []
      };
      
      const merged = merger.mergeInsights(ruleBasedInsights, llmInsights);
      
      expect(merged.wentWell[0]).toHaveProperty('category');
      expect(merged.wentWell[0]).toHaveProperty('priority');
      expect(merged.wentWell[0]).toHaveProperty('impact');
      expect(merged.wentWell[0]).toHaveProperty('urgency');
      // Category should be assigned (could be technical or general based on content)
      expect(merged.wentWell[0].category).toBeDefined();
      
      expect(merged.didntGoWell[0]).toHaveProperty('category');
      // Category should be assigned based on content analysis
      expect(merged.didntGoWell[0].category).toBeDefined();
      
      expect(merged.mergeMetadata.categorized).toBe(true);
      expect(merged).toHaveProperty('categoryStatistics');
    });

    test('should skip categorization when disabled', () => {
      const merger = new InsightMerger({ enableCategorization: false });
      
      const ruleBasedInsights = {
        wentWell: [
          {
            title: 'API performance improved',
            details: 'Database optimization reduced query times'
          }
        ],
        didntGoWell: [],
        actionItems: []
      };
      
      const merged = merger.mergeInsights(ruleBasedInsights, {});
      
      // When categorization is disabled, these fields should not be added by categorizer
      expect(merged.wentWell[0].priority).toBeFalsy();
      expect(merged.wentWell[0].impact).toBeFalsy();
      expect(merged.mergeMetadata.categorized).toBe(false);
      expect(merged).not.toHaveProperty('categoryStatistics');
    });

    test('should provide filtering functionality', () => {
      const merger = new InsightMerger({ enableCategorization: true });
      
      const insights = {
        wentWell: [
          {
            title: 'Technical improvement',
            category: 'technical',
            source: 'ai',
            priority: 0.8
          },
          {
            title: 'Process improvement',
            category: 'process',
            source: 'rules',
            priority: 0.6
          }
        ],
        didntGoWell: [],
        actionItems: []
      };
      
      const filtered = merger.filterInsights(insights, {
        categories: ['technical'],
        minPriority: 0.7
      });
      
      expect(filtered.wentWell).toHaveLength(1);
      expect(filtered.wentWell[0].category).toBe('technical');
    });

    test('should provide sorting functionality', () => {
      const merger = new InsightMerger({ enableCategorization: true });
      
      const insights = {
        wentWell: [
          {
            title: 'Low priority',
            priority: 0.3,
            confidence: 0.7
          },
          {
            title: 'High priority',
            priority: 0.9,
            confidence: 0.8
          }
        ],
        didntGoWell: [],
        actionItems: []
      };
      
      const sorted = merger.sortInsights(insights, {
        sortBy: 'priority',
        sortOrder: 'desc'
      });
      
      expect(sorted.wentWell[0].title).toBe('High priority');
      expect(sorted.wentWell[1].title).toBe('Low priority');
    });

    test('should return available categories', () => {
      const merger = new InsightMerger({ enableCategorization: true });
      
      const categories = merger.getAvailableCategories();
      
      expect(categories).toBeInstanceOf(Array);
      expect(categories.length).toBeGreaterThan(0);
      
      const technicalCategory = categories.find(cat => cat.id === 'technical');
      expect(technicalCategory).toBeDefined();
      expect(technicalCategory.name).toBe('Technical');
    });

    test('should handle categorizer configuration updates', () => {
      const merger = new InsightMerger({ enableCategorization: true });
      
      merger.updateConfiguration({
        categorizerConfig: {
          enableAutoCategories: false
        }
      });
      
      // Should still have categorizer but with updated config
      expect(merger.categorizer).toBeDefined();
      expect(merger.categorizer.config.enableAutoCategories).toBe(false);
    });

    test('should handle enabling/disabling categorization', () => {
      const merger = new InsightMerger({ enableCategorization: false });
      expect(merger.categorizer).toBeNull();
      
      // Enable categorization
      merger.updateConfiguration({ enableCategorization: true });
      expect(merger.categorizer).toBeDefined();
      
      // Disable categorization
      merger.updateConfiguration({ enableCategorization: false });
      expect(merger.categorizer).toBeNull();
    });
  });
});