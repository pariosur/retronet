import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import ReleaseNotesService from '../services/ReleaseNotesService.js';
import ExportService from '../services/ExportService.js';

// Mock the services to avoid external dependencies
const mockReleaseNotesService = {
  generateReleaseNotes: async (dateRange, options) => ({
    title: `Release Notes - ${dateRange.start} to ${dateRange.end}`,
    dateRange,
    entries: {
      newFeatures: [
        {
          id: 'feature-1',
          title: 'New User Dashboard',
          description: 'Added a comprehensive user dashboard with analytics',
          category: 'newFeatures',
          impact: 'high',
          userValue: 'Users can now track their progress and performance'
        }
      ],
      improvements: [
        {
          id: 'improvement-1',
          title: 'Faster Loading Times',
          description: 'Optimized database queries for 50% faster page loads',
          category: 'improvements',
          impact: 'medium',
          userValue: 'Pages load much faster for a better user experience'
        }
      ],
      fixes: [
        {
          id: 'fix-1',
          title: 'Login Issue Fixed',
          description: 'Resolved authentication bug affecting mobile users',
          category: 'fixes',
          impact: 'high',
          userValue: 'Mobile users can now log in without issues'
        }
      ]
    },
    metadata: {
      sources: ['github', 'linear'],
      generationMethod: 'rule-based'
    }
  })
};

// Create test app with release notes endpoints
function createTestApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // In-memory storage for tests
  const releaseNotesStorage = new Map();

  // Generate release notes endpoint
  app.post('/api/generate-release-notes', async (req, res) => {
    try {
      const { dateRange, options = {} } = req.body;
      
      if (!dateRange || !dateRange.start || !dateRange.end) {
        return res.status(400).json({ 
          error: 'Date range with start and end dates is required' 
        });
      }

      // Use mock service for testing
      const releaseNotesDocument = await mockReleaseNotesService.generateReleaseNotes(dateRange, options);

      // Store the generated release notes with a unique ID
      const releaseNotesId = `rn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      releaseNotesStorage.set(releaseNotesId, {
        ...releaseNotesDocument,
        id: releaseNotesId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

      res.json({
        id: releaseNotesId,
        ...releaseNotesDocument,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });

    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to generate release notes: ' + error.message 
      });
    }
  });

  // Get release notes by ID endpoint
  app.get('/api/release-notes/:id', (req, res) => {
    try {
      const { id } = req.params;
      
      if (!releaseNotesStorage.has(id)) {
        return res.status(404).json({ 
          error: 'Release notes not found',
          id 
        });
      }

      const releaseNotes = releaseNotesStorage.get(id);
      res.json(releaseNotes);

    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to retrieve release notes: ' + error.message 
      });
    }
  });

  // Update release notes endpoint
  app.put('/api/release-notes/:id', (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      if (!releaseNotesStorage.has(id)) {
        return res.status(404).json({ 
          error: 'Release notes not found',
          id 
        });
      }

      const existingReleaseNotes = releaseNotesStorage.get(id);
      
      // Merge updates with existing data
      const updatedReleaseNotes = {
        ...existingReleaseNotes,
        ...updates,
        id, // Ensure ID doesn't change
        createdAt: existingReleaseNotes.createdAt, // Preserve creation time
        updatedAt: new Date().toISOString()
      };

      // Store updated release notes
      releaseNotesStorage.set(id, updatedReleaseNotes);

      res.json(updatedReleaseNotes);

    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to update release notes: ' + error.message 
      });
    }
  });

  // Export release notes endpoint
  app.post('/api/release-notes/:id/export', (req, res) => {
    try {
      const { id } = req.params;
      const { format = 'markdown', options = {} } = req.body;
      
      if (!releaseNotesStorage.has(id)) {
        return res.status(404).json({ 
          error: 'Release notes not found',
          id 
        });
      }

      const releaseNotes = releaseNotesStorage.get(id);
      const exportService = new ExportService();
      
      let exportedContent;
      let contentType;
      let filename;

      switch (format.toLowerCase()) {
        case 'markdown':
        case 'md':
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
          return res.status(400).json({ 
            error: 'Unsupported format. Supported formats: markdown, html, json' 
          });
      }

      // Set appropriate headers for download
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', Buffer.byteLength(exportedContent, 'utf8'));
      
      res.send(exportedContent);

    } catch (error) {
      res.status(500).json({ 
        error: 'Failed to export release notes: ' + error.message 
      });
    }
  });

  return app;
}

describe('Release Notes API Endpoints', () => {
  let app;

  beforeAll(() => {
    app = createTestApp();
  });

  describe('POST /api/generate-release-notes', () => {
    it('should generate release notes successfully', async () => {
      const dateRange = {
        start: '2024-01-01',
        end: '2024-01-31'
      };

      const response = await request(app)
        .post('/api/generate-release-notes')
        .send({ dateRange })
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('title');
      expect(response.body).toHaveProperty('dateRange');
      expect(response.body).toHaveProperty('entries');
      expect(response.body).toHaveProperty('createdAt');
      expect(response.body).toHaveProperty('updatedAt');
      
      expect(response.body.entries).toHaveProperty('newFeatures');
      expect(response.body.entries).toHaveProperty('improvements');
      expect(response.body.entries).toHaveProperty('fixes');
      
      expect(response.body.entries.newFeatures).toHaveLength(1);
      expect(response.body.entries.improvements).toHaveLength(1);
      expect(response.body.entries.fixes).toHaveLength(1);
    });

    it('should return 400 for missing date range', async () => {
      const response = await request(app)
        .post('/api/generate-release-notes')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Date range');
    });

    it('should return 400 for invalid date range', async () => {
      const response = await request(app)
        .post('/api/generate-release-notes')
        .send({ dateRange: { start: '2024-01-01' } })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Date range');
    });
  });

  describe('GET /api/release-notes/:id', () => {
    it('should retrieve release notes by ID', async () => {
      // First generate release notes
      const dateRange = { start: '2024-01-01', end: '2024-01-31' };
      const generateResponse = await request(app)
        .post('/api/generate-release-notes')
        .send({ dateRange });

      const releaseNotesId = generateResponse.body.id;

      // Then retrieve them
      const response = await request(app)
        .get(`/api/release-notes/${releaseNotesId}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', releaseNotesId);
      expect(response.body).toHaveProperty('title');
      expect(response.body).toHaveProperty('entries');
    });

    it('should return 404 for non-existent release notes', async () => {
      const response = await request(app)
        .get('/api/release-notes/non-existent-id')
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('not found');
    });
  });

  describe('PUT /api/release-notes/:id', () => {
    it('should update release notes successfully', async () => {
      // First generate release notes
      const dateRange = { start: '2024-01-01', end: '2024-01-31' };
      const generateResponse = await request(app)
        .post('/api/generate-release-notes')
        .send({ dateRange });

      const releaseNotesId = generateResponse.body.id;
      const originalCreatedAt = generateResponse.body.createdAt;

      // Update the title
      const updates = { title: 'Updated Release Notes Title' };
      const response = await request(app)
        .put(`/api/release-notes/${releaseNotesId}`)
        .send(updates)
        .expect(200);

      expect(response.body).toHaveProperty('id', releaseNotesId);
      expect(response.body).toHaveProperty('title', 'Updated Release Notes Title');
      expect(response.body).toHaveProperty('createdAt', originalCreatedAt);
      expect(response.body).toHaveProperty('updatedAt');
      expect(response.body.updatedAt).not.toBe(originalCreatedAt);
    });

    it('should return 404 for non-existent release notes', async () => {
      const response = await request(app)
        .put('/api/release-notes/non-existent-id')
        .send({ title: 'Updated Title' })
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('not found');
    });
  });

  describe('POST /api/release-notes/:id/export', () => {
    it('should export release notes in markdown format', async () => {
      // First generate release notes
      const dateRange = { start: '2024-01-01', end: '2024-01-31' };
      const generateResponse = await request(app)
        .post('/api/generate-release-notes')
        .send({ dateRange });

      const releaseNotesId = generateResponse.body.id;

      // Export as markdown
      const response = await request(app)
        .post(`/api/release-notes/${releaseNotesId}/export`)
        .send({ format: 'markdown' })
        .expect(200);

      expect(response.headers['content-type']).toBe('text/markdown; charset=utf-8');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.text).toContain('# Release Notes');
      expect(response.text).toContain('## 🚀 New Features');
      expect(response.text).toContain('## ✨ Improvements');
      expect(response.text).toContain('## 🐛 Bug Fixes');
    });

    it('should export release notes in HTML format', async () => {
      // First generate release notes
      const dateRange = { start: '2024-01-01', end: '2024-01-31' };
      const generateResponse = await request(app)
        .post('/api/generate-release-notes')
        .send({ dateRange });

      const releaseNotesId = generateResponse.body.id;

      // Export as HTML
      const response = await request(app)
        .post(`/api/release-notes/${releaseNotesId}/export`)
        .send({ format: 'html' })
        .expect(200);

      expect(response.headers['content-type']).toBe('text/html; charset=utf-8');
      expect(response.text).toContain('<!DOCTYPE html>');
      expect(response.text).toContain('<h1>');
      expect(response.text).toContain('🚀 New Features');
    });

    it('should export release notes in JSON format', async () => {
      // First generate release notes
      const dateRange = { start: '2024-01-01', end: '2024-01-31' };
      const generateResponse = await request(app)
        .post('/api/generate-release-notes')
        .send({ dateRange });

      const releaseNotesId = generateResponse.body.id;

      // Export as JSON
      const response = await request(app)
        .post(`/api/release-notes/${releaseNotesId}/export`)
        .send({ format: 'json' })
        .expect(200);

      expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
      
      const exportData = JSON.parse(response.text);
      expect(exportData).toHaveProperty('metadata');
      expect(exportData).toHaveProperty('releaseNotes');
      expect(exportData).toHaveProperty('summary');
      expect(exportData.releaseNotes).toHaveProperty('entries');
    });

    it('should return 400 for unsupported format', async () => {
      // First generate release notes
      const dateRange = { start: '2024-01-01', end: '2024-01-31' };
      const generateResponse = await request(app)
        .post('/api/generate-release-notes')
        .send({ dateRange });

      const releaseNotesId = generateResponse.body.id;

      // Try to export with unsupported format
      const response = await request(app)
        .post(`/api/release-notes/${releaseNotesId}/export`)
        .send({ format: 'pdf' })
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Unsupported format');
    });

    it('should return 404 for non-existent release notes', async () => {
      const response = await request(app)
        .post('/api/release-notes/non-existent-id/export')
        .send({ format: 'markdown' })
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('not found');
    });
  });
});