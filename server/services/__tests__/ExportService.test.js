/**
 * Tests for ExportService
 */

import { describe, it, expect, beforeEach } from 'vitest';
import ExportService from '../ExportService.js';

describe('ExportService', () => {
  let exportService;
  let mockRetroData;

  beforeEach(() => {
    exportService = new ExportService();
    
    mockRetroData = {
      wentWell: [
        {
          title: 'Great team collaboration',
          details: 'Team worked well together on the new feature',
          source: 'ai',
          confidence: 0.85,
          category: 'teamDynamics',
          priority: 0.7,
          reasoning: 'Multiple positive interactions observed in Slack',
          llmProvider: 'openai',
          llmModel: 'gpt-4'
        },
        {
          title: 'Fast deployment pipeline',
          details: 'CI/CD pipeline completed in under 5 minutes',
          source: 'rules',
          category: 'technical',
          priority: 0.6
        }
      ],
      didntGoWell: [
        {
          title: 'High bug count',
          details: 'Found 15 bugs in production',
          source: 'hybrid',
          confidence: 0.9,
          category: 'technical',
          priority: 0.9,
          impact: 'high',
          urgency: 'high',
          sourceInsights: [
            {
              title: 'Bug tracking analysis',
              source: 'rules',
              confidence: 0.8
            },
            {
              title: 'Code quality assessment',
              source: 'ai',
              confidence: 0.95
            }
          ]
        }
      ],
      actionItems: [
        {
          title: 'Implement code review checklist',
          details: 'Create a comprehensive checklist for code reviews',
          source: 'ai',
          confidence: 0.8,
          category: 'process',
          priority: 0.8,
          assignee: 'John Doe',
          reasoning: 'Analysis shows correlation between review quality and bug count'
        }
      ],
      analysisMetadata: {
        generatedAt: '2024-01-15T10:00:00Z',
        dateRange: {
          start: '2024-01-01',
          end: '2024-01-14'
        },
        teamMembers: ['John Doe', 'Jane Smith'],
        ruleBasedAnalysisUsed: true,
        llmAnalysisUsed: true,
        llm: {
          provider: 'openai',
          model: 'gpt-4',
          tokensUsed: 1500,
          cost: 0.045
        }
      },
      categoryStatistics: {
        total: 4,
        averagePriority: 0.75,
        averageConfidence: 0.85,
        categoryBreakdown: {
          technical: 2,
          teamDynamics: 1,
          process: 1
        },
        sourceBreakdown: {
          ai: 2,
          rules: 1,
          hybrid: 1
        }
      }
    };
  });

  describe('exportToMarkdown', () => {
    it('should export retro data to markdown format', () => {
      const markdown = exportService.exportToMarkdown(mockRetroData);
      
      expect(markdown).toContain('# Sprint Retro Results');
      expect(markdown).toContain('## Analysis Information');
      expect(markdown).toContain('## 🎉 What Went Well');
      expect(markdown).toContain('## 😬 What Didn\'t Go Well');
      expect(markdown).toContain('## 🎯 Action Items');
      expect(markdown).toContain('Great team collaboration');
      expect(markdown).toContain('High bug count');
      expect(markdown).toContain('Implement code review checklist');
    });

    it('should include source attribution when enabled', () => {
      const markdown = exportService.exportToMarkdown(mockRetroData, {
        includeSourceAttribution: true
      });
      
      expect(markdown).toContain('**Source:** AI Analysis');
      expect(markdown).toContain('**Source:** Rule-based Analysis');
      expect(markdown).toContain('**Source:** Hybrid Analysis');
      expect(markdown).toContain('via openai');
    });

    it('should include AI reasoning when enabled', () => {
      const markdown = exportService.exportToMarkdown(mockRetroData, {
        includeReasoningForAI: true
      });
      
      expect(markdown).toContain('**AI Reasoning:**');
      expect(markdown).toContain('Multiple positive interactions observed in Slack');
    });

    it('should include metadata section', () => {
      const markdown = exportService.exportToMarkdown(mockRetroData, {
        includeMetadata: true
      });
      
      expect(markdown).toContain('**Generated:**');
      expect(markdown).toContain('**Period:** 2024-01-01 to 2024-01-14');
      expect(markdown).toContain('**Team Members:** John Doe, Jane Smith');
      expect(markdown).toContain('**Analysis Methods:** Rule-based Analysis, AI Analysis');
      expect(markdown).toContain('**AI Provider:** openai');
      expect(markdown).toContain('**Tokens Used:** 1,500');
    });

    it('should handle empty insights gracefully', () => {
      const emptyData = {
        wentWell: [],
        didntGoWell: [],
        actionItems: []
      };
      
      const markdown = exportService.exportToMarkdown(emptyData);
      
      expect(markdown).toContain('_No insights found for this category._');
    });

    it('should include source breakdown for hybrid insights', () => {
      const markdown = exportService.exportToMarkdown(mockRetroData);
      
      expect(markdown).toContain('**Source Breakdown:**');
      expect(markdown).toContain('Bug tracking analysis');
      expect(markdown).toContain('Code quality assessment');
    });
  });

  describe('exportToJSON', () => {
    it('should export retro data to JSON format', () => {
      const jsonString = exportService.exportToJSON(mockRetroData);
      const jsonData = JSON.parse(jsonString);
      
      expect(jsonData).toHaveProperty('metadata');
      expect(jsonData).toHaveProperty('analysisMetadata');
      expect(jsonData).toHaveProperty('insights');
      expect(jsonData).toHaveProperty('categoryStatistics');
      expect(jsonData).toHaveProperty('summary');
      
      expect(jsonData.metadata.format).toBe('json');
      expect(jsonData.insights.wentWell).toHaveLength(2);
      expect(jsonData.insights.didntGoWell).toHaveLength(1);
      expect(jsonData.insights.actionItems).toHaveLength(1);
    });

    it('should include confidence scores when enabled', () => {
      const jsonString = exportService.exportToJSON(mockRetroData, {
        includeConfidenceScores: true
      });
      const jsonData = JSON.parse(jsonString);
      
      const aiInsight = jsonData.insights.wentWell.find(insight => insight.source === 'ai');
      expect(aiInsight).toHaveProperty('confidence');
      expect(aiInsight).toHaveProperty('confidencePercentage');
      expect(aiInsight.confidencePercentage).toBe(85);
    });

    it('should include source attribution when enabled', () => {
      const jsonString = exportService.exportToJSON(mockRetroData, {
        includeSourceAttribution: true
      });
      const jsonData = JSON.parse(jsonString);
      
      const aiInsight = jsonData.insights.wentWell.find(insight => insight.source === 'ai');
      expect(aiInsight).toHaveProperty('sourceAttribution');
      expect(aiInsight.sourceAttribution.llmProvider).toBe('openai');
      expect(aiInsight.sourceAttribution.llmModel).toBe('gpt-4');
    });

    it('should include summary statistics', () => {
      const jsonString = exportService.exportToJSON(mockRetroData);
      const jsonData = JSON.parse(jsonString);
      
      expect(jsonData.summary.totalInsights).toBe(4);
      expect(jsonData.summary.aiInsights).toBe(2);
      expect(jsonData.summary.ruleBasedInsights).toBe(1);
      expect(jsonData.summary.hybridInsights).toBe(1);
    });
  });

  describe('exportToCSV', () => {
    it('should export retro data to CSV format', () => {
      const csv = exportService.exportToCSV(mockRetroData);
      
      expect(csv).toContain('Section,Title,Details,Source,Confidence');
      expect(csv).toContain('What Went Well,Great team collaboration');
      expect(csv).toContain('What Didn\'t Go Well,High bug count');
      expect(csv).toContain('Action Items,Implement code review checklist');
    });

    it('should properly escape CSV values with commas and quotes', () => {
      const dataWithSpecialChars = {
        wentWell: [{
          title: 'Title with, comma',
          details: 'Details with "quotes" and, comma',
          source: 'ai'
        }],
        didntGoWell: [],
        actionItems: []
      };
      
      const csv = exportService.exportToCSV(dataWithSpecialChars);
      
      expect(csv).toContain('"Title with, comma"');
      expect(csv).toContain('"Details with ""quotes"" and, comma"');
    });

    it('should include confidence percentages', () => {
      const csv = exportService.exportToCSV(mockRetroData);
      
      expect(csv).toContain('85.0%');
      expect(csv).toContain('90.0%');
    });

    it('should include AI reasoning when enabled', () => {
      const csv = exportService.exportToCSV(mockRetroData, {
        includeReasoningForAI: true
      });
      
      expect(csv).toContain('AI Reasoning');
      expect(csv).toContain('Multiple positive interactions observed in Slack');
    });

    it('should include LLM provider information when enabled', () => {
      const csv = exportService.exportToCSV(mockRetroData, {
        includeSourceAttribution: true
      });
      
      expect(csv).toContain('LLM Provider,LLM Model');
      expect(csv).toContain('openai,gpt-4');
    });
  });

  describe('_formatSourceAttribution', () => {
    it('should format AI source with confidence and provider', () => {
      const insight = {
        source: 'ai',
        confidence: 0.85,
        llmProvider: 'openai',
        llmModel: 'gpt-4'
      };
      
      const attribution = exportService._formatSourceAttribution(insight);
      
      expect(attribution).toBe('AI Analysis 85% confidence via openai (gpt-4)');
    });

    it('should format rule-based source', () => {
      const insight = {
        source: 'rules'
      };
      
      const attribution = exportService._formatSourceAttribution(insight);
      
      expect(attribution).toBe('Rule-based Analysis');
    });

    it('should format hybrid source with confidence', () => {
      const insight = {
        source: 'hybrid',
        confidence: 0.9
      };
      
      const attribution = exportService._formatSourceAttribution(insight);
      
      expect(attribution).toBe('Hybrid Analysis 90% confidence');
    });
  });

  describe('_formatPriority', () => {
    it('should format numeric priority as text', () => {
      expect(exportService._formatPriority(0.9)).toBe('High');
      expect(exportService._formatPriority(0.7)).toBe('Medium');
      expect(exportService._formatPriority(0.5)).toBe('Low');
      expect(exportService._formatPriority(0.2)).toBe('Very Low');
    });

    it('should return string priority as-is', () => {
      expect(exportService._formatPriority('high')).toBe('high');
      expect(exportService._formatPriority('medium')).toBe('medium');
    });

    it('should handle undefined priority', () => {
      expect(exportService._formatPriority(undefined)).toBe('');
      expect(exportService._formatPriority(null)).toBe('');
    });
  });

  describe('_countInsightsBySource', () => {
    it('should count insights by source type', () => {
      expect(exportService._countInsightsBySource(mockRetroData, 'ai')).toBe(2);
      expect(exportService._countInsightsBySource(mockRetroData, 'rules')).toBe(1);
      expect(exportService._countInsightsBySource(mockRetroData, 'hybrid')).toBe(1);
      expect(exportService._countInsightsBySource(mockRetroData, 'unknown')).toBe(0);
    });
  });

  describe('_escapeCsvValue', () => {
    it('should escape values with commas', () => {
      expect(exportService._escapeCsvValue('value, with comma')).toBe('"value, with comma"');
    });

    it('should escape values with quotes', () => {
      expect(exportService._escapeCsvValue('value "with" quotes')).toBe('"value ""with"" quotes"');
    });

    it('should escape values with newlines', () => {
      expect(exportService._escapeCsvValue('value\nwith\nnewlines')).toBe('"value\nwith\nnewlines"');
    });

    it('should not escape simple values', () => {
      expect(exportService._escapeCsvValue('simple value')).toBe('simple value');
    });

    it('should handle null and undefined', () => {
      expect(exportService._escapeCsvValue(null)).toBe('');
      expect(exportService._escapeCsvValue(undefined)).toBe('');
    });
  });
});