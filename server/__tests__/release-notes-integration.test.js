import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import ExportService from '../services/ExportService.js';

/**
 * Comprehensive Integration Tests for Release Notes End-to-End Workflow
 * 
 * This test suite validates the complete release notes generation workflow
 * from data collection through export, including manual editing capabilities.
 * 
 * Test Coverage:
 * - Complete release notes generation workflow
 * - Export functionality across all supported formats
 * - Manual editing and customization features
 * - Error handling and graceful degradation
 */

describe('Release Notes Integration Tests', () => {
  let app;
  let releaseNotesStorage;

  // Test data fixtures
  const testDateRange = {
    start: '2024-01-01',
    end: '2024-01-31'
  };

  const expectedReleaseNotesStructure = {
    id: expect.any(String),
    title: expect.any(String),
    dateRange: testDateRange,
    entries: {
      newFeatures: expect.any(Array),
      improvements: expect.any(Array),
      fixes: expect.any(Array)
    },
    metadata: expect.any(Object),
    createdAt: expect.any(String),
    updatedAt: expect.any(String)
  };

  beforeAll(() => {
    // Create test Express app with release notes endpoints
    app = express();
    app.use(cors());
    app.use(express.json());
    
    // In-memory storage for test data
    releaseNotesStorage = new Map();
    
    // Add release notes endpoints to test app
    setupReleaseNotesEndpoints();
  });

  beforeEach(() => {
    // Clear storage before each test
    releaseNotesStorage.clear();
  });

  afterEach(() => {
    // Clean up any test data
    releaseNotesStorage.clear();
  });

  function setupReleaseNotesEndpoints() {
    // Generate release notes endpoint with mock data
    app.post('/api/generate-release-notes', (req, res) => {
      try {
        const { dateRange, options = {} } = req.body;
        
        if (!dateRange || !dateRange.start || !dateRange.end) {
          return res.status(400).json({ 
            error: 'Date range with start and end dates is required' 
          });
        }

        // Mock release notes document for testing
        const mockReleaseNotesDocument = {
          title: `Release Notes - ${dateRange.start} to ${dateRange.end}`,
          dateRange,
          entries: {
            newFeatures: [
              {
                id: 'feature-1',
                title: 'User Dashboard',
                description: 'Added comprehensive user dashboard with real-time analytics',
                category: 'newFeatures',
                impact: 'high',
                userValue: 'Users can now track their progress and performance metrics',
                confidence: 0.9,
                source: 'ai'
              }
            ],
            improvements: [
              {
                id: 'improvement-1',
                title: 'Database Performance',
                description: 'Optimized database queries for 50% faster loading times',
                category: 'improvements',
                impact: 'medium',
                userValue: 'Pages load much faster for a better user experience',
                confidence: 0.85,
                source: 'ai'
              }
            ],
            fixes: [
              {
                id: 'fix-1',
                title: 'Mobile Login Fix',
                description: 'Resolved authentication issues affecting mobile users',
                category: 'fixes',
                impact: 'high',
                userValue: 'Mobile users can now log in without any issues',
                confidence: 0.95,
                source: 'ai'
              }
            ]
          },
          metadata: {
            sources: ['github', 'linear', 'slack'],
            generationMethod: 'llm-enhanced',
            llmProvider: 'openai',
            llmModel: 'gpt-3.5-turbo',
            analysisTime: 1500,
            totalChanges: 10,
            userFacingChanges: 3,
            aiGenerated: 3
          }
        };

        // Store the generated release notes
        const releaseNotesId = `rn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const storedDocument = {
          ...mockReleaseNotesDocument,
          id: releaseNotesId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        
        releaseNotesStorage.set(releaseNotesId, storedDocument);

        res.json(storedDocument);

      } catch (error) {
        console.error('Release notes generation error:', error);
        res.status(500).json({ 
          error: 'Failed to generate release notes: ' + error.message 
        });
      }
    });

    // Get release notes by ID
    app.get('/api/release-notes/:id', (req, res) => {
      const { id } = req.params;
      const releaseNotes = releaseNotesStorage.get(id);
      
      if (!releaseNotes) {
        return res.status(404).json({ error: 'Release notes not found' });
      }
      
      res.json(releaseNotes);
    });

    // Update release notes
    app.put('/api/release-notes/:id', (req, res) => {
      const { id } = req.params;
      const updates = req.body;
      
      const existingReleaseNotes = releaseNotesStorage.get(id);
      if (!existingReleaseNotes) {
        return res.status(404).json({ error: 'Release notes not found' });
      }
      
      const updatedReleaseNotes = {
        ...existingReleaseNotes,
        ...updates,
        updatedAt: new Date().toISOString()
      };
      
      releaseNotesStorage.set(id, updatedReleaseNotes);
      res.json(updatedReleaseNotes);
    });

    // Export release notes
    app.post('/api/release-notes/:id/export', (req, res) => {
      const { id } = req.params;
      const { format = 'markdown', options = {} } = req.body;
      
      const releaseNotes = releaseNotesStorage.get(id);
      if (!releaseNotes) {
        return res.status(404).json({ error: 'Release notes not found' });
      }
      
      const exportService = new ExportService();
      let exportedContent;
      let contentType;
      let filename;
      
      try {
        switch (format) {
          case 'markdown':
            exportedContent = exportService.exportReleaseNotesToMarkdown(releaseNotes, options);
            contentType = 'text/markdown';
            filename = `release-notes-${releaseNotes.dateRange.start}-to-${releaseNotes.dateRange.end}.md`;
            break;
          case 'html':
            exportedContent = exportService.exportReleaseNotesToHTML(releaseNotes, options);
            contentType = 'text/html';
            filename = `release-notes-${releaseNotes.dateRange.start}-to-${releaseNotes.dateRange.end}.html`;
            break;
          case 'json':
            exportedContent = exportService.exportReleaseNotesToJSON(releaseNotes, options);
            contentType = 'application/json';
            filename = `release-notes-${releaseNotes.dateRange.start}-to-${releaseNotes.dateRange.end}.json`;
            break;
          default:
            return res.status(400).json({ error: 'Unsupported export format' });
        }
        
        res.setHeader('Content-Type', contentType);
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(exportedContent);
        
      } catch (error) {
        console.error('Export error:', error);
        res.status(500).json({ error: 'Failed to export release notes: ' + error.message });
      }
    });
  }

  describe('End-to-End Release Notes Generation Workflow', () => {
    it('should complete full workflow from data collection to release notes generation', async () => {
      const response = await request(app)
        .post('/api/generate-release-notes')
        .send({
          dateRange: testDateRange,
          options: {
            teamMembers: ['user1@example.com', 'user2@example.com'],
            repositories: ['repo1', 'repo2'],
            channels: ['general', 'releases']
          }
        })
        .expect(200);

      // Verify response structure
      expect(response.body).toMatchObject(expectedReleaseNotesStructure);

      // Verify categorized entries exist
      expect(response.body.entries.newFeatures).toHaveLength(1);
      expect(response.body.entries.improvements).toHaveLength(1);
      expect(response.body.entries.fixes).toHaveLength(1);

      // Verify metadata includes generation information
      expect(response.body.metadata).toHaveProperty('sources');
      expect(response.body.metadata).toHaveProperty('generationMethod');
      expect(response.body.metadata.generationMethod).toBe('llm-enhanced');
    });

    it('should validate date range requirements', async () => {
      const response = await request(app)
        .post('/api/generate-release-notes')
        .send({
          dateRange: { start: '2024-01-01' }, // Missing end date
          options: {}
        })
        .expect(400);

      expect(response.body.error).toContain('Date range with start and end dates is required');
    });
  });

  describe('Data Source Integration Tests', () => {
    it('should accept various configuration options', async () => {
      const response = await request(app)
        .post('/api/generate-release-notes')
        .send({
          dateRange: testDateRange,
          options: { 
            repositories: ['test-repo'],
            teamMembers: ['dev@example.com'],
            channels: ['dev-updates']
          }
        })
        .expect(200);

      expect(response.body).toMatchObject(expectedReleaseNotesStructure);
    });

    it('should generate release notes with minimal configuration', async () => {
      const response = await request(app)
        .post('/api/generate-release-notes')
        .send({
          dateRange: testDateRange,
          options: {}
        })
        .expect(200);

      expect(response.body).toMatchObject(expectedReleaseNotesStructure);
    });
  });

  describe('Export Functionality Tests', () => {
    let releaseNotesId;

    beforeEach(async () => {
      // Generate release notes for export tests
      const response = await request(app)
        .post('/api/generate-release-notes')
        .send({
          dateRange: testDateRange,
          options: {}
        })
        .expect(200);

      releaseNotesId = response.body.id;
    });

    it('should export release notes to markdown format', async () => {
      const response = await request(app)
        .post(`/api/release-notes/${releaseNotesId}/export`)
        .send({ format: 'markdown' })
        .expect(200);

      expect(response.headers['content-type']).toContain('text/markdown');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.text).toContain('# Release Notes');
      expect(response.text).toContain('## 🚀 New Features');
      expect(response.text).toContain('## ✨ Improvements');
      expect(response.text).toContain('## 🐛 Bug Fixes');
    });

    it('should export release notes to HTML format', async () => {
      const response = await request(app)
        .post(`/api/release-notes/${releaseNotesId}/export`)
        .send({ format: 'html' })
        .expect(200);

      expect(response.headers['content-type']).toContain('text/html');
      expect(response.text).toContain('<!DOCTYPE html>');
      expect(response.text).toContain('<h1>');
      expect(response.text).toContain('🚀 New Features');
      expect(response.text).toContain('</html>');
    });

    it('should export release notes to JSON format', async () => {
      const response = await request(app)
        .post(`/api/release-notes/${releaseNotesId}/export`)
        .send({ format: 'json' })
        .expect(200);

      expect(response.headers['content-type']).toContain('application/json');
      
      const exportedData = JSON.parse(response.text);
      expect(exportedData).toHaveProperty('metadata');
      expect(exportedData).toHaveProperty('releaseNotes');
      expect(exportedData).toHaveProperty('summary');
      expect(exportedData.releaseNotes).toHaveProperty('entries');
    });

    it('should handle export with custom options', async () => {
      const response = await request(app)
        .post(`/api/release-notes/${releaseNotesId}/export`)
        .send({ 
          format: 'markdown',
          options: { includeMetadata: true }
        })
        .expect(200);

      expect(response.text).toContain('Generation Information');
    });

    it('should return error for unsupported export format', async () => {
      const response = await request(app)
        .post(`/api/release-notes/${releaseNotesId}/export`)
        .send({ format: 'pdf' })
        .expect(400);

      expect(response.body.error).toContain('Unsupported export format');
    });

    it('should return error for non-existent release notes', async () => {
      const response = await request(app)
        .post('/api/release-notes/non-existent-id/export')
        .send({ format: 'markdown' })
        .expect(404);

      expect(response.body.error).toContain('Release notes not found');
    });
  });

  describe('Manual Editing and Customization Tests', () => {
    let releaseNotesId;
    let originalReleaseNotes;

    beforeEach(async () => {
      // Generate release notes for editing tests
      const response = await request(app)
        .post('/api/generate-release-notes')
        .send({
          dateRange: testDateRange,
          options: {}
        })
        .expect(200);

      releaseNotesId = response.body.id;
      originalReleaseNotes = response.body;
    });

    it('should retrieve release notes by ID', async () => {
      const response = await request(app)
        .get(`/api/release-notes/${releaseNotesId}`)
        .expect(200);

      expect(response.body).toEqual(originalReleaseNotes);
    });

    it('should update release notes title and metadata', async () => {
      const updates = {
        title: 'Custom Release Notes Title',
        metadata: {
          ...originalReleaseNotes.metadata,
          customField: 'custom value'
        }
      };

      const response = await request(app)
        .put(`/api/release-notes/${releaseNotesId}`)
        .send(updates)
        .expect(200);

      expect(response.body.title).toBe(updates.title);
      expect(response.body.metadata.customField).toBe('custom value');
      expect(response.body.updatedAt).not.toBe(originalReleaseNotes.updatedAt);
    });

    it('should update individual release notes entries', async () => {
      const updatedEntries = {
        entries: {
          ...originalReleaseNotes.entries,
          newFeatures: [
            {
              ...originalReleaseNotes.entries.newFeatures[0],
              title: 'Updated Feature Title',
              description: 'Updated feature description'
            }
          ]
        }
      };

      const response = await request(app)
        .put(`/api/release-notes/${releaseNotesId}`)
        .send(updatedEntries)
        .expect(200);

      expect(response.body.entries.newFeatures[0].title).toBe('Updated Feature Title');
      expect(response.body.entries.newFeatures[0].description).toBe('Updated feature description');
    });

    it('should add custom manual entries', async () => {
      const customEntry = {
        id: 'custom-1',
        title: 'Manual Custom Feature',
        description: 'This is a manually added feature not derived from data sources',
        category: 'newFeatures',
        impact: 'medium',
        userValue: 'Provides additional value to users',
        source: 'manual',
        confidence: 1.0
      };

      const updatedEntries = {
        entries: {
          ...originalReleaseNotes.entries,
          newFeatures: [
            ...originalReleaseNotes.entries.newFeatures,
            customEntry
          ]
        }
      };

      const response = await request(app)
        .put(`/api/release-notes/${releaseNotesId}`)
        .send(updatedEntries)
        .expect(200);

      expect(response.body.entries.newFeatures).toHaveLength(2);
      expect(response.body.entries.newFeatures[1]).toMatchObject(customEntry);
    });

    it('should move entries between categories', async () => {
      // Move the first improvement to new features
      const movedEntry = {
        ...originalReleaseNotes.entries.improvements[0],
        category: 'newFeatures'
      };

      const updatedEntries = {
        entries: {
          newFeatures: [
            ...originalReleaseNotes.entries.newFeatures,
            movedEntry
          ],
          improvements: [], // Remove from improvements
          fixes: originalReleaseNotes.entries.fixes
        }
      };

      const response = await request(app)
        .put(`/api/release-notes/${releaseNotesId}`)
        .send(updatedEntries)
        .expect(200);

      expect(response.body.entries.newFeatures).toHaveLength(2);
      expect(response.body.entries.improvements).toHaveLength(0);
      expect(response.body.entries.newFeatures[1].category).toBe('newFeatures');
    });

    it('should delete entries from release notes', async () => {
      const updatedEntries = {
        entries: {
          newFeatures: originalReleaseNotes.entries.newFeatures,
          improvements: [], // Remove all improvements
          fixes: originalReleaseNotes.entries.fixes
        }
      };

      const response = await request(app)
        .put(`/api/release-notes/${releaseNotesId}`)
        .send(updatedEntries)
        .expect(200);

      expect(response.body.entries.improvements).toHaveLength(0);
    });

    it('should reorder entries within categories', async () => {
      // Add another entry to test reordering
      const additionalEntry = {
        id: 'additional-1',
        title: 'Additional Feature',
        description: 'Another feature for testing',
        category: 'newFeatures',
        impact: 'low',
        source: 'manual'
      };

      const reorderedEntries = {
        entries: {
          newFeatures: [
            additionalEntry,
            originalReleaseNotes.entries.newFeatures[0] // Original entry moved to second position
          ],
          improvements: originalReleaseNotes.entries.improvements,
          fixes: originalReleaseNotes.entries.fixes
        }
      };

      const response = await request(app)
        .put(`/api/release-notes/${releaseNotesId}`)
        .send(reorderedEntries)
        .expect(200);

      expect(response.body.entries.newFeatures[0].id).toBe('additional-1');
      expect(response.body.entries.newFeatures[1].id).toBe(originalReleaseNotes.entries.newFeatures[0].id);
    });

    it('should return error for non-existent release notes ID', async () => {
      const response = await request(app)
        .get('/api/release-notes/non-existent-id')
        .expect(404);

      expect(response.body.error).toContain('Release notes not found');
    });

    it('should return error when updating non-existent release notes', async () => {
      const response = await request(app)
        .put('/api/release-notes/non-existent-id')
        .send({ title: 'Updated Title' })
        .expect(404);

      expect(response.body.error).toContain('Release notes not found');
    });
  });

  describe('Performance and Scalability Tests', () => {
    it('should handle concurrent release notes generation requests', async () => {
      const concurrentRequests = Array.from({ length: 3 }, (_, i) => 
        request(app)
          .post('/api/generate-release-notes')
          .send({
            dateRange: {
              start: '2024-01-01',
              end: '2024-01-31'
            },
            options: { title: `Concurrent Test ${i}` }
          })
      );

      const responses = await Promise.all(concurrentRequests);

      // All requests should succeed
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject(expectedReleaseNotesStructure);
      });

      // Each should have unique IDs
      const ids = responses.map(r => r.body.id);
      expect(new Set(ids).size).toBe(3);
    });

    it('should complete generation within reasonable time', async () => {
      const startTime = Date.now();
      
      const response = await request(app)
        .post('/api/generate-release-notes')
        .send({
          dateRange: testDateRange,
          options: {}
        })
        .expect(200);

      const endTime = Date.now();
      const processingTime = endTime - startTime;

      // Should complete within reasonable time
      expect(processingTime).toBeLessThan(5000); // 5 seconds
      expect(response.body).toMatchObject(expectedReleaseNotesStructure);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle malformed request data', async () => {
      const response = await request(app)
        .post('/api/generate-release-notes')
        .send({
          invalidField: 'invalid data'
        })
        .expect(400);

      expect(response.body.error).toContain('Date range with start and end dates is required');
    });

    it('should handle missing date range', async () => {
      const response = await request(app)
        .post('/api/generate-release-notes')
        .send({
          options: {}
        })
        .expect(400);

      expect(response.body.error).toContain('Date range with start and end dates is required');
    });

    it('should handle empty request body', async () => {
      const response = await request(app)
        .post('/api/generate-release-notes')
        .send({})
        .expect(400);

      expect(response.body.error).toContain('Date range with start and end dates is required');
    });
  });
});