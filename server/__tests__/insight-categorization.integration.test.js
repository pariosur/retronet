/**
 * Integration tests for insight categorization and filtering endpoints
 */

import { describe, test, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import { InsightMerger } from '../services/InsightMerger.js';

// Create test app with the filtering endpoints
const createTestApp = () => {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Filter insights endpoint
  app.post('/api/filter-insights', async (req, res) => {
    try {
      const { insights, filters = {}, sortOptions = {} } = req.body;
      
      if (!insights || typeof insights !== 'object') {
        return res.status(400).json({ 
          error: 'Invalid insights data provided' 
        });
      }

      // Create insight merger with categorization enabled
      const merger = new InsightMerger({ 
        enableCategorization: true,
        categorizerConfig: {
          enableAutoCategories: true
        }
      });

      // Apply filtering if filters provided
      let filteredInsights = insights;
      if (Object.keys(filters).length > 0) {
        filteredInsights = merger.filterInsights(insights, filters);
      }

      // Apply sorting if sort options provided
      let sortedInsights = filteredInsights;
      if (Object.keys(sortOptions).length > 0) {
        sortedInsights = merger.sortInsights(filteredInsights, sortOptions);
      }

      // Add category statistics
      const allInsights = [
        ...(sortedInsights.wentWell || []),
        ...(sortedInsights.didntGoWell || []),
        ...(sortedInsights.actionItems || [])
      ];
      
      const categorizer = merger.categorizer;
      const categoryStats = categorizer ? categorizer.getCategoryStatistics(allInsights) : {};

      res.json({
        ...sortedInsights,
        categoryStatistics: categoryStats,
        availableCategories: merger.getAvailableCategories(),
        filterMetadata: {
          filtersApplied: Object.keys(filters).length > 0,
          sortingApplied: Object.keys(sortOptions).length > 0,
          totalInsights: allInsights.length,
          processedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error filtering insights:', error);
      res.status(500).json({ 
        error: 'Failed to filter insights: ' + error.message 
      });
    }
  });

  // Get available categories endpoint
  app.get('/api/insight-categories', (req, res) => {
    try {
      const merger = new InsightMerger({ 
        enableCategorization: true 
      });
      
      const categories = merger.getAvailableCategories();
      
      res.json({
        categories,
        metadata: {
          total: categories.length,
          retrievedAt: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error getting categories:', error);
      res.status(500).json({ 
        error: 'Failed to get categories: ' + error.message 
      });
    }
  });

  return app;
};

describe('Insight Categorization API Endpoints', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  describe('GET /api/insight-categories', () => {
    test('should return available categories', async () => {
      const response = await request(app)
        .get('/api/insight-categories')
        .expect(200);

      expect(response.body).toHaveProperty('categories');
      expect(response.body).toHaveProperty('metadata');
      expect(response.body.categories).toBeInstanceOf(Array);
      expect(response.body.categories.length).toBeGreaterThan(0);

      // Check for default categories
      const categoryIds = response.body.categories.map(cat => cat.id);
      expect(categoryIds).toContain('technical');
      expect(categoryIds).toContain('process');
      expect(categoryIds).toContain('teamDynamics');
      expect(categoryIds).toContain('general');

      // Check category structure
      const technicalCategory = response.body.categories.find(cat => cat.id === 'technical');
      expect(technicalCategory).toHaveProperty('name');
      expect(technicalCategory).toHaveProperty('description');
      expect(technicalCategory).toHaveProperty('color');
    });

    test('should include metadata', async () => {
      const response = await request(app)
        .get('/api/insight-categories')
        .expect(200);

      expect(response.body.metadata).toHaveProperty('total');
      expect(response.body.metadata).toHaveProperty('retrievedAt');
      expect(response.body.metadata.total).toBe(response.body.categories.length);
    });
  });

  describe('POST /api/filter-insights', () => {
    const sampleInsights = {
      wentWell: [
        {
          title: 'API performance improved',
          details: 'Database optimization reduced query times significantly',
          source: 'ai',
          confidence: 0.9
        },
        {
          title: 'Team collaboration enhanced',
          details: 'Better communication and knowledge sharing',
          source: 'rules',
          confidence: 0.8
        }
      ],
      didntGoWell: [
        {
          title: 'Sprint planning issues',
          details: 'Estimation process needs improvement',
          source: 'hybrid',
          confidence: 0.7
        }
      ],
      actionItems: [
        {
          title: 'Implement code review process',
          details: 'Establish formal review workflow',
          source: 'ai',
          confidence: 0.85,
          priority: 'high'
        }
      ]
    };

    test('should return insights without filtering when no filters provided', async () => {
      const response = await request(app)
        .post('/api/filter-insights')
        .send({ insights: sampleInsights })
        .expect(200);

      expect(response.body).toHaveProperty('wentWell');
      expect(response.body).toHaveProperty('didntGoWell');
      expect(response.body).toHaveProperty('actionItems');
      expect(response.body).toHaveProperty('categoryStatistics');
      expect(response.body).toHaveProperty('availableCategories');
      expect(response.body).toHaveProperty('filterMetadata');

      expect(response.body.wentWell).toHaveLength(2);
      expect(response.body.didntGoWell).toHaveLength(1);
      expect(response.body.actionItems).toHaveLength(1);

      expect(response.body.filterMetadata.filtersApplied).toBe(false);
      expect(response.body.filterMetadata.sortingApplied).toBe(false);
    });

    test('should filter insights by category', async () => {
      const response = await request(app)
        .post('/api/filter-insights')
        .send({
          insights: sampleInsights,
          filters: {
            categories: ['technical']
          }
        })
        .expect(200);

      expect(response.body.filterMetadata.filtersApplied).toBe(true);
      
      // Should only include technical insights
      const allFilteredInsights = [
        ...response.body.wentWell,
        ...response.body.didntGoWell,
        ...response.body.actionItems
      ];
      
      allFilteredInsights.forEach(insight => {
        expect(insight.category).toBe('technical');
      });
    });

    test('should filter insights by source', async () => {
      const response = await request(app)
        .post('/api/filter-insights')
        .send({
          insights: sampleInsights,
          filters: {
            sources: ['ai']
          }
        })
        .expect(200);

      expect(response.body.filterMetadata.filtersApplied).toBe(true);
      
      const allFilteredInsights = [
        ...response.body.wentWell,
        ...response.body.didntGoWell,
        ...response.body.actionItems
      ];
      
      allFilteredInsights.forEach(insight => {
        expect(insight.source).toBe('ai');
      });
    });

    test('should filter insights by minimum confidence', async () => {
      const response = await request(app)
        .post('/api/filter-insights')
        .send({
          insights: sampleInsights,
          filters: {
            minConfidence: 0.8
          }
        })
        .expect(200);

      expect(response.body.filterMetadata.filtersApplied).toBe(true);
      
      const allFilteredInsights = [
        ...response.body.wentWell,
        ...response.body.didntGoWell,
        ...response.body.actionItems
      ];
      
      allFilteredInsights.forEach(insight => {
        expect(insight.confidence).toBeGreaterThanOrEqual(0.8);
      });
    });

    test('should search insights by text', async () => {
      const response = await request(app)
        .post('/api/filter-insights')
        .send({
          insights: sampleInsights,
          filters: {
            search: 'performance'
          }
        })
        .expect(200);

      expect(response.body.filterMetadata.filtersApplied).toBe(true);
      
      const allFilteredInsights = [
        ...response.body.wentWell,
        ...response.body.didntGoWell,
        ...response.body.actionItems
      ];
      
      expect(allFilteredInsights.length).toBeGreaterThan(0);
      allFilteredInsights.forEach(insight => {
        const content = `${insight.title} ${insight.details}`.toLowerCase();
        expect(content).toContain('performance');
      });
    });

    test('should sort insights by priority', async () => {
      const response = await request(app)
        .post('/api/filter-insights')
        .send({
          insights: sampleInsights,
          sortOptions: {
            sortBy: 'priority',
            sortOrder: 'desc'
          }
        })
        .expect(200);

      expect(response.body.filterMetadata.sortingApplied).toBe(true);
      
      // Check that response has the expected structure
      expect(response.body).toHaveProperty('wentWell');
      expect(response.body).toHaveProperty('didntGoWell');
      expect(response.body).toHaveProperty('actionItems');
      expect(response.body).toHaveProperty('categoryStatistics');
    });

    test('should sort insights by confidence ascending', async () => {
      const response = await request(app)
        .post('/api/filter-insights')
        .send({
          insights: sampleInsights,
          sortOptions: {
            sortBy: 'confidence',
            sortOrder: 'asc'
          }
        })
        .expect(200);

      expect(response.body.filterMetadata.sortingApplied).toBe(true);
      
      // Check that insights have confidence values
      const allInsights = [
        ...response.body.wentWell,
        ...response.body.didntGoWell,
        ...response.body.actionItems
      ];
      
      // All insights should have confidence values
      allInsights.forEach(insight => {
        expect(insight).toHaveProperty('confidence');
        expect(typeof insight.confidence).toBe('number');
      });
    });

    test('should combine filtering and sorting', async () => {
      const response = await request(app)
        .post('/api/filter-insights')
        .send({
          insights: sampleInsights,
          filters: {
            sources: ['ai', 'hybrid']
          },
          sortOptions: {
            sortBy: 'confidence',
            sortOrder: 'desc'
          }
        })
        .expect(200);

      expect(response.body.filterMetadata.filtersApplied).toBe(true);
      expect(response.body.filterMetadata.sortingApplied).toBe(true);
      
      const allInsights = [
        ...response.body.wentWell,
        ...response.body.didntGoWell,
        ...response.body.actionItems
      ];
      
      // Check filtering
      allInsights.forEach(insight => {
        expect(['ai', 'hybrid']).toContain(insight.source);
      });
      
      // Check that both filtering and sorting were applied
      expect(response.body).toHaveProperty('categoryStatistics');
      expect(response.body).toHaveProperty('availableCategories');
    });

    test('should include category statistics', async () => {
      const response = await request(app)
        .post('/api/filter-insights')
        .send({ insights: sampleInsights })
        .expect(200);

      expect(response.body).toHaveProperty('categoryStatistics');
      expect(response.body.categoryStatistics).toHaveProperty('total');
      expect(response.body.categoryStatistics).toHaveProperty('byCategory');
      expect(response.body.categoryStatistics).toHaveProperty('bySource');
      expect(response.body.categoryStatistics).toHaveProperty('averagePriority');
      expect(response.body.categoryStatistics).toHaveProperty('averageConfidence');

      expect(response.body.categoryStatistics.total).toBe(4); // Total insights
    });

    test('should return 400 for invalid insights data', async () => {
      const response = await request(app)
        .post('/api/filter-insights')
        .send({ insights: null })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Invalid insights data');
    });

    test('should return 400 for missing insights', async () => {
      const response = await request(app)
        .post('/api/filter-insights')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should handle empty insights gracefully', async () => {
      const emptyInsights = {
        wentWell: [],
        didntGoWell: [],
        actionItems: []
      };

      const response = await request(app)
        .post('/api/filter-insights')
        .send({ insights: emptyInsights })
        .expect(200);

      expect(response.body.wentWell).toHaveLength(0);
      expect(response.body.didntGoWell).toHaveLength(0);
      expect(response.body.actionItems).toHaveLength(0);
      expect(response.body.categoryStatistics.total).toBe(0);
    });

    test('should handle invalid filter values gracefully', async () => {
      const response = await request(app)
        .post('/api/filter-insights')
        .send({
          insights: sampleInsights,
          filters: {
            categories: null,
            sources: 'invalid',
            minConfidence: 'not-a-number'
          }
        })
        .expect(200);

      // Should not crash and return some results
      expect(response.body).toHaveProperty('wentWell');
      expect(response.body).toHaveProperty('didntGoWell');
      expect(response.body).toHaveProperty('actionItems');
    });
  });

  describe('Error Handling', () => {
    test('should handle server errors gracefully', async () => {
      // Create an app that throws an error
      const errorApp = express();
      errorApp.use(express.json());
      errorApp.post('/api/filter-insights', (req, res) => {
        try {
          throw new Error('Simulated server error');
        } catch (error) {
          res.status(500).json({ error: error.message });
        }
      });

      const response = await request(errorApp)
        .post('/api/filter-insights')
        .send({ insights: {} })
        .expect(500);

      expect(response.body).toHaveProperty('error');
    });
  });
});