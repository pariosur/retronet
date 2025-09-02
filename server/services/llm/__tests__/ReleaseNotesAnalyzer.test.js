/**
 * Tests for ReleaseNotesAnalyzer
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ReleaseNotesAnalyzer } from '../ReleaseNotesAnalyzer.js';

// Mock the base LLMAnalyzer
vi.mock('../LLMAnalyzer.js', () => ({
  LLMAnalyzer: class MockLLMAnalyzer {
    constructor(config) {
      this.config = {
        enabled: true,
        provider: 'openai',
        model: 'gpt-4',
        ...config
      };
      this.provider = {
        getModel: () => this.config.model,
        generateInsights: vi.fn()
      };
    }

    async _callLLMWithRetry(prompt, context, progressTracker) {
      // Mock implementation that returns different responses based on prompt type
      if (prompt.metadata?.promptType === 'user-impact-analysis') {
        return JSON.stringify({
          userFacingChanges: [
            {
              title: 'Added new dashboard feature',
              description: 'Users can now view analytics dashboard',
              impact: 'high',
              category: 'feature',
              confidence: 0.9,
              reasoning: 'New user-visible functionality'
            }
          ],
          internalChanges: [
            {
              title: 'Refactored database queries',
              reasoning: 'Internal optimization without user impact'
            }
          ],
          confidence: 0.85
        });
      }

      if (prompt.metadata?.promptType === 'user-friendly-translation') {
        return JSON.stringify({
          translatedChanges: [
            {
              originalTitle: 'Added new dashboard feature',
              userFriendlyTitle: 'New Analytics Dashboard',
              userFriendlyDescription: 'View your data insights in a beautiful new dashboard',
              userValue: 'Better understanding of your data trends',
              translationConfidence: 0.9
            }
          ],
          confidence: 0.85
        });
      }

      if (prompt.metadata?.promptType === 'categorization') {
        return JSON.stringify({
          newFeatures: [
            {
              title: 'New Analytics Dashboard',
              description: 'View your data insights in a beautiful new dashboard',
              userValue: 'Better understanding of your data trends',
              confidence: 0.9,
              reasoning: 'Completely new functionality for users'
            }
          ],
          improvements: [],
          fixes: [],
          confidence: 0.87
        });
      }

      return 'Mock LLM response';
    }

    getStatus() {
      return {
        enabled: this.config.enabled,
        provider: this.config.provider,
        model: this.config.model
      };
    }
  }
}));

describe('ReleaseNotesAnalyzer', () => {
  let analyzer;
  let mockDevelopmentData;
  let mockContext;

  beforeEach(() => {
    analyzer = new ReleaseNotesAnalyzer({
      enabled: true,
      provider: 'openai',
      model: 'gpt-4'
    });

    mockDevelopmentData = {
      github: {
        commits: [
          {
            sha: 'abc123',
            commit: {
              message: 'Add new dashboard feature',
              author: { date: '2024-01-15T10:00:00Z' }
            }
          }
        ],
        pullRequests: [
          {
            id: 1,
            title: 'Feature: Analytics Dashboard',
            body: 'Adds new analytics dashboard for users',
            merged_at: '2024-01-15T12:00:00Z'
          }
        ]
      },
      linear: [
        {
          id: 'LIN-123',
          title: 'Implement analytics dashboard',
          description: 'Create dashboard for user analytics',
          state: { name: 'Done', type: 'completed' },
          updatedAt: '2024-01-15T14:00:00Z'
        }
      ],
      slack: [
        {
          ts: '1705320000.123456',
          text: 'Shipped the new analytics dashboard! Users love it.',
          channel: 'general'
        }
      ]
    };

    mockContext = {
      dateRange: {
        start: '2024-01-01',
        end: '2024-01-31'
      },
      teamSize: 5,
      productType: 'Web application'
    };
  });

  describe('constructor', () => {
    it('should initialize with default configuration', () => {
      const defaultAnalyzer = new ReleaseNotesAnalyzer();
      
      expect(defaultAnalyzer.releaseNotesConfig).toBeDefined();
      expect(defaultAnalyzer.releaseNotesConfig.categories).toEqual(['newFeatures', 'improvements', 'fixes']);
      expect(defaultAnalyzer.releaseNotesConfig.tone).toBe('professional-friendly');
      expect(defaultAnalyzer.releaseNotesConfig.audienceLevel).toBe('business-user');
    });

    it('should accept custom configuration', () => {
      const customAnalyzer = new ReleaseNotesAnalyzer({
        tone: 'casual',
        audienceLevel: 'technical',
        maxEntriesPerCategory: 5
      });

      expect(customAnalyzer.releaseNotesConfig.tone).toBe('casual');
      expect(customAnalyzer.releaseNotesConfig.audienceLevel).toBe('technical');
      expect(customAnalyzer.releaseNotesConfig.maxEntriesPerCategory).toBe(5);
    });
  });

  describe('analyzeForReleaseNotes', () => {
    it('should perform complete release notes analysis', async () => {
      const result = await analyzer.analyzeForReleaseNotes(mockDevelopmentData, mockContext);

      expect(result).toBeDefined();
      expect(result.userImpactAnalysis).toBeDefined();
      expect(result.userFriendlyDescriptions).toBeDefined();
      expect(result.categorizedChanges).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.metadata.analysisType).toBe('release-notes');
    });

    it('should return null when LLM is disabled', async () => {
      const disabledAnalyzer = new ReleaseNotesAnalyzer({ enabled: false });
      const result = await disabledAnalyzer.analyzeForReleaseNotes(mockDevelopmentData, mockContext);

      expect(result).toBeNull();
    });

    it('should handle progress tracking', async () => {
      const mockProgressTracker = {
        startStep: vi.fn(),
        completeStep: vi.fn(),
        updateStepProgress: vi.fn()
      };

      await analyzer.analyzeForReleaseNotes(mockDevelopmentData, mockContext, mockProgressTracker);

      expect(mockProgressTracker.startStep).toHaveBeenCalledTimes(3);
      expect(mockProgressTracker.completeStep).toHaveBeenCalledTimes(3);
    });

    it('should handle errors gracefully', async () => {
      // Mock an error in the LLM call
      analyzer._callLLMWithRetry = vi.fn().mockRejectedValue(new Error('LLM error'));

      await expect(analyzer.analyzeForReleaseNotes(mockDevelopmentData, mockContext))
        .rejects.toThrow('Release notes analysis failed: User impact analysis failed: LLM error');
    });
  });

  describe('identifyUserImpact', () => {
    it('should identify user-facing changes', async () => {
      const result = await analyzer.identifyUserImpact(mockDevelopmentData, mockContext);

      expect(result).toBeDefined();
      expect(result.userFacingChanges).toBeInstanceOf(Array);
      expect(result.internalChanges).toBeInstanceOf(Array);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.reasoning).toBeDefined();
    });

    it('should handle empty development data', async () => {
      const result = await analyzer.identifyUserImpact({}, mockContext);

      expect(result).toBeDefined();
      expect(result.userFacingChanges).toBeInstanceOf(Array);
      expect(result.internalChanges).toBeInstanceOf(Array);
    });

    it('should parse JSON responses correctly', async () => {
      const result = await analyzer.identifyUserImpact(mockDevelopmentData, mockContext);

      expect(result.userFacingChanges).toHaveLength(1);
      expect(result.userFacingChanges[0].title).toBe('Added new dashboard feature');
      expect(result.userFacingChanges[0].confidence).toBe(0.9);
      expect(result.internalChanges).toHaveLength(1);
    });
  });

  describe('generateUserFriendlyDescriptions', () => {
    it('should generate user-friendly descriptions', async () => {
      const changes = [
        {
          title: 'Added new dashboard feature',
          description: 'Technical implementation of analytics dashboard',
          confidence: 0.8
        }
      ];

      const result = await analyzer.generateUserFriendlyDescriptions(changes, mockContext);

      expect(result).toBeInstanceOf(Array);
      expect(result).toHaveLength(1);
      expect(result[0].userFriendlyTitle).toBe('New Analytics Dashboard');
      expect(result[0].userFriendlyDescription).toBe('View your data insights in a beautiful new dashboard');
    });

    it('should handle empty changes array', async () => {
      const result = await analyzer.generateUserFriendlyDescriptions([], mockContext);

      expect(result).toBeInstanceOf(Array);
      expect(result).toHaveLength(0);
    });

    it('should return original changes if translation fails', async () => {
      // Mock translation failure
      analyzer._callLLMWithRetry = vi.fn().mockRejectedValue(new Error('Translation failed'));

      const changes = [{ title: 'Test change', description: 'Test description' }];
      const result = await analyzer.generateUserFriendlyDescriptions(changes, mockContext);

      expect(result).toEqual(changes);
    });
  });

  describe('categorizeByUserValue', () => {
    it('should categorize changes correctly', async () => {
      const changes = [
        {
          title: 'New Analytics Dashboard',
          description: 'View your data insights in a beautiful new dashboard',
          confidence: 0.9
        }
      ];

      const result = await analyzer.categorizeByUserValue(changes, mockContext);

      expect(result).toBeDefined();
      expect(result.newFeatures).toBeInstanceOf(Array);
      expect(result.improvements).toBeInstanceOf(Array);
      expect(result.fixes).toBeInstanceOf(Array);
      expect(result.metadata).toBeDefined();
      expect(result.newFeatures).toHaveLength(1);
    });

    it('should handle empty changes array', async () => {
      const result = await analyzer.categorizeByUserValue([], mockContext);

      expect(result.newFeatures).toHaveLength(0);
      expect(result.improvements).toHaveLength(0);
      expect(result.fixes).toHaveLength(0);
    });

    it('should use fallback categorization on LLM failure', async () => {
      // Mock categorization failure
      analyzer._callLLMWithRetry = vi.fn().mockRejectedValue(new Error('Categorization failed'));

      const changes = [
        { title: 'Fix bug in login', description: 'Fixed login issue' },
        { title: 'Add new feature', description: 'Added new functionality' },
        { title: 'Improve performance', description: 'Made system faster' }
      ];

      const result = await analyzer.categorizeByUserValue(changes, mockContext);

      expect(result.fixes).toHaveLength(1);
      expect(result.newFeatures).toHaveLength(1);
      expect(result.improvements).toHaveLength(1);
    });
  });

  describe('_parseUserImpactResponse', () => {
    it('should parse JSON response correctly', () => {
      const jsonResponse = JSON.stringify({
        userFacingChanges: [{ title: 'Test change' }],
        internalChanges: [{ title: 'Internal change' }],
        confidence: 0.8
      });

      const result = analyzer._parseUserImpactResponse(jsonResponse);

      expect(result.userFacingChanges).toHaveLength(1);
      expect(result.internalChanges).toHaveLength(1);
      expect(result.confidence).toBe(0.8);
    });

    it('should handle malformed JSON gracefully', () => {
      const malformedResponse = 'This is not JSON';

      const result = analyzer._parseUserImpactResponse(malformedResponse);

      expect(result.userFacingChanges).toBeInstanceOf(Array);
      expect(result.internalChanges).toBeInstanceOf(Array);
      expect(result.confidence).toBe(0.7); // Updated to match actual implementation
    });

    it('should parse text response as fallback', () => {
      const textResponse = `
        User-facing changes:
        * Added new dashboard
        * Fixed login bug
        
        Internal changes:
        * Refactored database code
      `;

      const result = analyzer._parseUserImpactResponse(textResponse);

      expect(result.userFacingChanges.length).toBeGreaterThan(0);
      expect(result.internalChanges.length).toBeGreaterThan(0);
    });
  });

  describe('_fallbackCategorization', () => {
    it('should categorize changes using keywords', () => {
      const changes = [
        { title: 'Fix login bug', description: 'Fixed issue with login' },
        { title: 'Add new dashboard', description: 'Added analytics dashboard' },
        { title: 'Improve performance', description: 'Made system faster' }
      ];

      const result = analyzer._fallbackCategorization(changes);

      expect(result.fixes).toHaveLength(1);
      expect(result.newFeatures).toHaveLength(1);
      expect(result.improvements).toHaveLength(1);
      expect(result.fixes[0].title).toBe('Fix login bug');
      expect(result.newFeatures[0].title).toBe('Add new dashboard');
    });

    it('should default to improvements for unclear changes', () => {
      const changes = [
        { title: 'Updated system', description: 'Made some updates' }
      ];

      const result = analyzer._fallbackCategorization(changes);

      expect(result.improvements).toHaveLength(1);
      expect(result.fixes).toHaveLength(0);
      expect(result.newFeatures).toHaveLength(0);
    });
  });

  describe('getStatus', () => {
    it('should return comprehensive status information', () => {
      const status = analyzer.getStatus();

      expect(status).toBeDefined();
      expect(status.releaseNotesConfig).toBeDefined();
      expect(status.capabilities).toBeDefined();
      expect(status.capabilities.userImpactAnalysis).toBe(true);
      expect(status.capabilities.userFriendlyTranslation).toBe(true);
      expect(status.capabilities.categorization).toBe(true);
    });
  });

  describe('ReleaseNotesPromptBuilder', () => {
    let promptBuilder;

    beforeEach(() => {
      // Access the prompt builder through the analyzer
      promptBuilder = analyzer.releaseNotesPromptBuilder;
    });

    it('should generate user impact prompt', () => {
      const prompt = promptBuilder.generateUserImpactPrompt(mockDevelopmentData, mockContext);

      expect(prompt).toBeDefined();
      expect(prompt.system).toContain('user-facing changes');
      expect(prompt.user).toContain('development data');
      expect(prompt.metadata.promptType).toBe('user-impact-analysis');
    });

    it('should generate user-friendly prompt', () => {
      const changes = [{ title: 'Test change', description: 'Test description' }];
      const prompt = promptBuilder.generateUserFriendlyPrompt(changes, mockContext);

      expect(prompt).toBeDefined();
      expect(prompt.system).toContain('user-friendly language');
      expect(prompt.user).toContain('translate');
      expect(prompt.metadata.promptType).toBe('user-friendly-translation');
    });

    it('should generate categorization prompt', () => {
      const changes = [{ title: 'Test change', description: 'Test description' }];
      const prompt = promptBuilder.generateCategorizationPrompt(changes, mockContext);

      expect(prompt).toBeDefined();
      expect(prompt.system).toContain('New Features');
      expect(prompt.system).toContain('Improvements');
      expect(prompt.system).toContain('Bug Fixes');
      expect(prompt.metadata.promptType).toBe('categorization');
    });

    it('should include context information in prompts', () => {
      const prompt = promptBuilder.generateUserImpactPrompt(mockDevelopmentData, mockContext);

      expect(prompt.system).toContain(mockContext.dateRange.start);
      expect(prompt.system).toContain(mockContext.dateRange.end);
      expect(prompt.system).toContain(mockContext.teamSize.toString());
    });

    it('should handle different tone configurations', () => {
      const casualAnalyzer = new ReleaseNotesAnalyzer({ tone: 'casual' });
      const prompt = casualAnalyzer.releaseNotesPromptBuilder.generateUserFriendlyPrompt([], mockContext);

      expect(prompt.system).toContain('casual tone');
    });
  });
});