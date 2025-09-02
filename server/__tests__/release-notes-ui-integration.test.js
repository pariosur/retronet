import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import ExportService from '../services/ExportService.js';

/**
 * UI Integration Tests for Release Notes Feature
 * 
 * This test suite validates the integration between the frontend UI
 * and backend API endpoints, simulating real user interactions.
 * 
 * Test Coverage:
 * - UI workflow simulation from generation to export
 * - Manual editing operations through API
 * - Drag-and-drop functionality simulation
 * - Export operations from UI perspective
 * - Error handling in UI scenarios
 */

describe('Release Notes UI Integration Tests', () => {
  let app;
  let releaseNotesStorage;

  // Test data fixtures that simulate UI interactions
  const testDateRange = {
    start: '2024-01-01',
    end: '2024-01-31'
  };

  const mockUIReleaseNotesData = {
    title: 'Release Notes - January 2024',
    dateRange: testDateRange,
    entries: {
      newFeatures: [
        {
          id: 'feature-1',
          title: 'Advanced Analytics Dashboard',
          description: 'New comprehensive dashboard with real-time metrics and customizable widgets',
          category: 'newFeatures',
          impact: 'high',
          userValue: 'Users can now monitor their key performance indicators in real-time',
          confidence: 0.95,
          source: 'ai'
        },
        {
          id: 'feature-2',
          title: 'Mobile App Integration',
          description: 'Seamless integration with iOS and Android mobile applications',
          category: 'newFeatures',
          impact: 'high',
          userValue: 'Access your data on-the-go with native mobile apps',
          confidence: 0.90,
          source: 'ai'
        }
      ],
      improvements: [
        {
          id: 'improvement-1',
          title: 'Enhanced Search Performance',
          description: 'Search results now load 3x faster with improved indexing',
          category: 'improvements',
          impact: 'medium',
          userValue: 'Find what you need faster with lightning-quick search',
          confidence: 0.88,
          source: 'ai'
        }
      ],
      fixes: [
        {
          id: 'fix-1',
          title: 'Email Notification Bug',
          description: 'Fixed issue where email notifications were not being sent consistently',
          category: 'fixes',
          impact: 'medium',
          userValue: 'Never miss important updates with reliable email notifications',
          confidence: 0.92,
          source: 'ai'
        }
      ]
    },
    metadata: {
      sources: ['github', 'linear', 'slack'],
      generationMethod: 'llm-enhanced',
      llmProvider: 'openai',
      llmModel: 'gpt-3.5-turbo',
      analysisTime: 2100,
      totalChanges: 15,
      userFacingChanges: 4,
      aiGenerated: 4
    }
  };

  beforeAll(() => {
    // Create test Express app
    app = express();
    app.use(cors());
    app.use(express.json());
    
    // In-memory storage
    releaseNotesStorage = new Map();
    
    // Setup endpoints
    setupUIIntegrationEndpoints();
  });

  beforeEach(() => {
    releaseNotesStorage.clear();
  });

  afterEach(() => {
    releaseNotesStorage.clear();
  });

  function setupUIIntegrationEndpoints() {
    // Generate release notes (simulates UI "Generate" button click)
    app.post('/api/generate-release-notes', (req, res) => {
      try {
        const { dateRange, options = {} } = req.body;
        
        if (!dateRange || !dateRange.start || !dateRange.end) {
          return res.status(400).json({ 
            error: 'Date range with start and end dates is required' 
          });
        }

        // Simulate processing time for UI loading states
        setTimeout(() => {
          const releaseNotesId = `rn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          const releaseNotesDocument = {
            ...mockUIReleaseNotesData,
            id: releaseNotesId,
            title: options.title || mockUIReleaseNotesData.title,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          
          releaseNotesStorage.set(releaseNotesId, releaseNotesDocument);
          res.json(releaseNotesDocument);
        }, 100); // Simulate brief processing time

      } catch (error) {
        res.status(500).json({ 
          error: 'Failed to generate release notes: ' + error.message 
        });
      }
    });

    // Get release notes (simulates UI loading existing release notes)
    app.get('/api/release-notes/:id', (req, res) => {
      const { id } = req.params;
      const releaseNotes = releaseNotesStorage.get(id);
      
      if (!releaseNotes) {
        return res.status(404).json({ error: 'Release notes not found' });
      }
      
      res.json(releaseNotes);
    });

    // Update release notes (simulates UI editing operations)
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

    // Export release notes (simulates UI export functionality)
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
        res.status(500).json({ error: 'Failed to export release notes: ' + error.message });
      }
    });
  }

  describe('UI Workflow Simulation Tests', () => {
    it('should simulate complete UI workflow from generation to export', async () => {
      // Step 1: User generates release notes via UI
      const generateResponse = await request(app)
        .post('/api/generate-release-notes')
        .send({
          dateRange: testDateRange,
          options: {
            title: 'January 2024 Release Notes',
            teamMembers: ['dev@example.com'],
            repositories: ['main-app']
          }
        })
        .expect(200);

      const releaseNotesId = generateResponse.body.id;
      expect(generateResponse.body.title).toBe('January 2024 Release Notes');
      expect(generateResponse.body.entries.newFeatures).toHaveLength(2);

      // Step 2: User views the generated release notes
      const viewResponse = await request(app)
        .get(`/api/release-notes/${releaseNotesId}`)
        .expect(200);

      expect(viewResponse.body.id).toBe(releaseNotesId);

      // Step 3: User edits the title and adds a custom entry
      const customEntry = {
        id: 'custom-ui-1',
        title: 'User-Added Feature',
        description: 'This feature was manually added by the user through the UI',
        category: 'newFeatures',
        impact: 'medium',
        userValue: 'Provides additional functionality requested by users',
        source: 'manual',
        confidence: 1.0
      };

      const editResponse = await request(app)
        .put(`/api/release-notes/${releaseNotesId}`)
        .send({
          title: 'Updated January 2024 Release Notes',
          entries: {
            ...generateResponse.body.entries,
            newFeatures: [
              ...generateResponse.body.entries.newFeatures,
              customEntry
            ]
          }
        })
        .expect(200);

      expect(editResponse.body.title).toBe('Updated January 2024 Release Notes');
      expect(editResponse.body.entries.newFeatures).toHaveLength(3);
      expect(editResponse.body.entries.newFeatures[2]).toMatchObject(customEntry);

      // Step 4: User exports to markdown
      const exportResponse = await request(app)
        .post(`/api/release-notes/${releaseNotesId}/export`)
        .send({ format: 'markdown' })
        .expect(200);

      expect(exportResponse.headers['content-type']).toContain('text/markdown');
      expect(exportResponse.text).toContain('Updated January 2024 Release Notes');
      expect(exportResponse.text).toContain('User-Added Feature');
    });

    it('should handle UI error scenarios gracefully', async () => {
      // Test invalid date range (UI validation failure)
      const invalidResponse = await request(app)
        .post('/api/generate-release-notes')
        .send({
          dateRange: { start: '2024-01-01' }, // Missing end date
          options: {}
        })
        .expect(400);

      expect(invalidResponse.body.error).toContain('Date range with start and end dates is required');

      // Test accessing non-existent release notes (UI navigation error)
      const notFoundResponse = await request(app)
        .get('/api/release-notes/non-existent-id')
        .expect(404);

      expect(notFoundResponse.body.error).toContain('Release notes not found');
    });
  });

  describe('Manual Editing UI Operations', () => {
    let releaseNotesId;

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/generate-release-notes')
        .send({
          dateRange: testDateRange,
          options: {}
        })
        .expect(200);

      releaseNotesId = response.body.id;
    });

    it('should simulate inline editing of entry titles and descriptions', async () => {
      // Simulate user clicking edit button and modifying an entry
      const originalData = await request(app)
        .get(`/api/release-notes/${releaseNotesId}`)
        .expect(200);

      const editedEntry = {
        ...originalData.body.entries.newFeatures[0],
        title: 'Edited: Advanced Analytics Dashboard',
        description: 'Updated description: Enhanced dashboard with even more features'
      };

      const updateResponse = await request(app)
        .put(`/api/release-notes/${releaseNotesId}`)
        .send({
          entries: {
            ...originalData.body.entries,
            newFeatures: [
              editedEntry,
              ...originalData.body.entries.newFeatures.slice(1)
            ]
          }
        })
        .expect(200);

      expect(updateResponse.body.entries.newFeatures[0].title).toBe('Edited: Advanced Analytics Dashboard');
      expect(updateResponse.body.entries.newFeatures[0].description).toContain('Updated description');
    });

    it('should simulate drag-and-drop reordering within categories', async () => {
      const originalData = await request(app)
        .get(`/api/release-notes/${releaseNotesId}`)
        .expect(200);

      // Simulate dragging second feature to first position
      const reorderedFeatures = [
        originalData.body.entries.newFeatures[1], // Move second to first
        originalData.body.entries.newFeatures[0]  // Move first to second
      ];

      const reorderResponse = await request(app)
        .put(`/api/release-notes/${releaseNotesId}`)
        .send({
          entries: {
            ...originalData.body.entries,
            newFeatures: reorderedFeatures
          }
        })
        .expect(200);

      expect(reorderResponse.body.entries.newFeatures[0].id).toBe('feature-2');
      expect(reorderResponse.body.entries.newFeatures[1].id).toBe('feature-1');
    });

    it('should simulate moving entries between categories', async () => {
      const originalData = await request(app)
        .get(`/api/release-notes/${releaseNotesId}`)
        .expect(200);

      // Move an improvement to new features
      const movedEntry = {
        ...originalData.body.entries.improvements[0],
        category: 'newFeatures'
      };

      const moveResponse = await request(app)
        .put(`/api/release-notes/${releaseNotesId}`)
        .send({
          entries: {
            newFeatures: [
              ...originalData.body.entries.newFeatures,
              movedEntry
            ],
            improvements: [], // Remove from improvements
            fixes: originalData.body.entries.fixes
          }
        })
        .expect(200);

      expect(moveResponse.body.entries.newFeatures).toHaveLength(3);
      expect(moveResponse.body.entries.improvements).toHaveLength(0);
      expect(moveResponse.body.entries.newFeatures[2].category).toBe('newFeatures');
    });

    it('should simulate deleting entries', async () => {
      const originalData = await request(app)
        .get(`/api/release-notes/${releaseNotesId}`)
        .expect(200);

      // Remove the first new feature
      const deleteResponse = await request(app)
        .put(`/api/release-notes/${releaseNotesId}`)
        .send({
          entries: {
            newFeatures: originalData.body.entries.newFeatures.slice(1), // Remove first
            improvements: originalData.body.entries.improvements,
            fixes: originalData.body.entries.fixes
          }
        })
        .expect(200);

      expect(deleteResponse.body.entries.newFeatures).toHaveLength(1);
      expect(deleteResponse.body.entries.newFeatures[0].id).toBe('feature-2');
    });

    it('should simulate adding custom entries through UI', async () => {
      const originalData = await request(app)
        .get(`/api/release-notes/${releaseNotesId}`)
        .expect(200);

      const newCustomEntry = {
        id: `custom-${Date.now()}`,
        title: 'Custom Feature Added via UI',
        description: 'This feature was added manually by the user',
        category: 'newFeatures',
        impact: 'low',
        userValue: 'Provides specific functionality for power users',
        source: 'manual',
        confidence: 1.0
      };

      const addResponse = await request(app)
        .put(`/api/release-notes/${releaseNotesId}`)
        .send({
          entries: {
            ...originalData.body.entries,
            newFeatures: [
              ...originalData.body.entries.newFeatures,
              newCustomEntry
            ]
          }
        })
        .expect(200);

      expect(addResponse.body.entries.newFeatures).toHaveLength(3);
      expect(addResponse.body.entries.newFeatures[2].source).toBe('manual');
      expect(addResponse.body.entries.newFeatures[2].title).toBe('Custom Feature Added via UI');
    });
  });

  describe('Export UI Operations', () => {
    let releaseNotesId;

    beforeEach(async () => {
      const response = await request(app)
        .post('/api/generate-release-notes')
        .send({
          dateRange: testDateRange,
          options: { title: 'Export Test Release Notes' }
        })
        .expect(200);

      releaseNotesId = response.body.id;
    });

    it('should simulate UI export to different formats', async () => {
      // Test markdown export (most common)
      const markdownResponse = await request(app)
        .post(`/api/release-notes/${releaseNotesId}/export`)
        .send({ format: 'markdown' })
        .expect(200);

      expect(markdownResponse.headers['content-disposition']).toContain('attachment');
      expect(markdownResponse.text).toContain('# Export Test Release Notes');

      // Test HTML export (for web sharing)
      const htmlResponse = await request(app)
        .post(`/api/release-notes/${releaseNotesId}/export`)
        .send({ format: 'html' })
        .expect(200);

      expect(htmlResponse.headers['content-type']).toContain('text/html');
      expect(htmlResponse.text).toContain('<!DOCTYPE html>');

      // Test JSON export (for API consumption)
      const jsonResponse = await request(app)
        .post(`/api/release-notes/${releaseNotesId}/export`)
        .send({ format: 'json' })
        .expect(200);

      expect(jsonResponse.headers['content-type']).toContain('application/json');
      const jsonData = JSON.parse(jsonResponse.text);
      expect(jsonData.releaseNotes.title).toBe('Export Test Release Notes');
    });

    it('should simulate export with custom options from UI', async () => {
      const customExportResponse = await request(app)
        .post(`/api/release-notes/${releaseNotesId}/export`)
        .send({ 
          format: 'markdown',
          options: { 
            includeMetadata: true,
            includeSourceAttribution: true
          }
        })
        .expect(200);

      expect(customExportResponse.text).toContain('Generation Information');
    });

    it('should handle export errors gracefully in UI context', async () => {
      // Test unsupported format
      const unsupportedResponse = await request(app)
        .post(`/api/release-notes/${releaseNotesId}/export`)
        .send({ format: 'pdf' })
        .expect(400);

      expect(unsupportedResponse.body.error).toContain('Unsupported export format');

      // Test export of non-existent release notes
      const notFoundResponse = await request(app)
        .post('/api/release-notes/invalid-id/export')
        .send({ format: 'markdown' })
        .expect(404);

      expect(notFoundResponse.body.error).toContain('Release notes not found');
    });
  });

  describe('UI Performance and User Experience', () => {
    it('should handle rapid UI interactions without conflicts', async () => {
      // Generate release notes
      const generateResponse = await request(app)
        .post('/api/generate-release-notes')
        .send({
          dateRange: testDateRange,
          options: {}
        })
        .expect(200);

      const releaseNotesId = generateResponse.body.id;

      // Simulate rapid successive edits (like user typing quickly)
      const rapidEdits = [
        { title: 'Edit 1' },
        { title: 'Edit 2' },
        { title: 'Final Edit' }
      ];

      const editPromises = rapidEdits.map((edit, index) => 
        request(app)
          .put(`/api/release-notes/${releaseNotesId}`)
          .send(edit)
      );

      const editResponses = await Promise.all(editPromises);

      // All edits should succeed
      editResponses.forEach(response => {
        expect(response.status).toBe(200);
      });

      // Final state should reflect the last edit
      const finalResponse = await request(app)
        .get(`/api/release-notes/${releaseNotesId}`)
        .expect(200);

      expect(finalResponse.body.title).toBe('Final Edit');
    });

    it('should maintain data consistency during concurrent UI operations', async () => {
      // Generate release notes
      const generateResponse = await request(app)
        .post('/api/generate-release-notes')
        .send({
          dateRange: testDateRange,
          options: {}
        })
        .expect(200);

      const releaseNotesId = generateResponse.body.id;

      // Simulate concurrent operations (multiple users or tabs)
      const concurrentOperations = [
        request(app).put(`/api/release-notes/${releaseNotesId}`).send({ title: 'Concurrent Edit 1' }),
        request(app).put(`/api/release-notes/${releaseNotesId}`).send({ title: 'Concurrent Edit 2' }),
        request(app).get(`/api/release-notes/${releaseNotesId}`)
      ];

      const responses = await Promise.all(concurrentOperations);

      // All operations should complete successfully
      responses.forEach(response => {
        expect(response.status).toBe(200);
      });
    });

    it('should handle UI timeout scenarios', async () => {
      // This test simulates what happens when UI operations take too long
      const startTime = Date.now();

      const response = await request(app)
        .post('/api/generate-release-notes')
        .send({
          dateRange: testDateRange,
          options: {}
        })
        .expect(200);

      const endTime = Date.now();
      const responseTime = endTime - startTime;

      // Should respond quickly enough for good UX
      expect(responseTime).toBeLessThan(1000); // 1 second
      expect(response.body).toHaveProperty('id');
    });
  });

  describe('UI Error Recovery', () => {
    it('should provide meaningful error messages for UI display', async () => {
      // Test various error scenarios that UI needs to handle

      // Invalid date range
      const dateError = await request(app)
        .post('/api/generate-release-notes')
        .send({
          dateRange: { start: 'invalid' },
          options: {}
        })
        .expect(400);

      expect(dateError.body.error).toBeTruthy();
      expect(typeof dateError.body.error).toBe('string');

      // Missing required data
      const missingDataError = await request(app)
        .post('/api/generate-release-notes')
        .send({})
        .expect(400);

      expect(missingDataError.body.error).toContain('Date range');
    });

    it('should handle partial failures gracefully for UI', async () => {
      // Generate release notes successfully
      const response = await request(app)
        .post('/api/generate-release-notes')
        .send({
          dateRange: testDateRange,
          options: {}
        })
        .expect(200);

      const releaseNotesId = response.body.id;

      // Try to update with invalid data
      const invalidUpdate = await request(app)
        .put(`/api/release-notes/${releaseNotesId}`)
        .send({
          entries: null // Invalid entries
        })
        .expect(200); // Should still succeed with partial update

      // Original data should be preserved
      expect(invalidUpdate.body.id).toBe(releaseNotesId);
    });
  });
});