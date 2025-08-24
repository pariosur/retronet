/**
 * Integration tests for export retro endpoints
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import ExportService from '../services/ExportService.js';

// Create test app
const app = express();
app.use(express.json());

// Import the export endpoints (we'll mock them here for testing)
app.post('/api/export-retro', (req, res) => {
  try {
    const { retroData, format = 'markdown', options = {} } = req.body;
    
    if (!retroData || typeof retroData !== 'object') {
      return res.status(400).json({ 
        error: 'Invalid retro data provided' 
      });
    }

    const exportService = new ExportService();
    let exportedContent;
    let contentType;
    let filename;

    switch (format.toLowerCase()) {
      case 'markdown':
      case 'md':
        exportedContent = exportService.exportToMarkdown(retroData, options);
        contentType = 'text/markdown';
        filename = `retro-${new Date().toISOString().split('T')[0]}.md`;
        break;
      
      case 'json':
        exportedContent = exportService.exportToJSON(retroData, options);
        contentType = 'application/json';
        filename = `retro-${new Date().toISOString().split('T')[0]}.json`;
        break;
      
      case 'csv':
        exportedContent = exportService.exportToCSV(retroData, options);
        contentType = 'text/csv';
        filename = `retro-${new Date().toISOString().split('T')[0]}.csv`;
        break;
      
      default:
        return res.status(400).json({ 
          error: 'Unsupported format. Supported formats: markdown, json, csv' 
        });
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', Buffer.byteLength(exportedContent, 'utf8'));
    
    res.send(exportedContent);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to export retro: ' + error.message 
    });
  }
});

app.post('/api/export-retro/preview', (req, res) => {
  try {
    const { retroData, format = 'markdown', options = {} } = req.body;
    
    if (!retroData || typeof retroData !== 'object') {
      return res.status(400).json({ 
        error: 'Invalid retro data provided' 
      });
    }

    const exportService = new ExportService();
    let preview;
    let metadata = {
      format,
      generatedAt: new Date().toISOString(),
      options
    };

    switch (format.toLowerCase()) {
      case 'markdown':
      case 'md':
        preview = exportService.exportToMarkdown(retroData, options);
        metadata.contentType = 'text/markdown';
        break;
      
      case 'json':
        preview = exportService.exportToJSON(retroData, options);
        metadata.contentType = 'application/json';
        break;
      
      case 'csv':
        preview = exportService.exportToCSV(retroData, options);
        metadata.contentType = 'text/csv';
        break;
      
      default:
        return res.status(400).json({ 
          error: 'Unsupported format. Supported formats: markdown, json, csv' 
        });
    }

    res.json({
      preview,
      metadata,
      stats: {
        size: Buffer.byteLength(preview, 'utf8'),
        lines: preview.split('\n').length,
        totalInsights: (retroData.wentWell?.length || 0) + 
                      (retroData.didntGoWell?.length || 0) + 
                      (retroData.actionItems?.length || 0)
      }
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to generate export preview: ' + error.message 
    });
  }
});

describe('Export Retro Integration Tests', () => {
  let mockRetroData;

  beforeEach(() => {
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
        }
      ],
      didntGoWell: [
        {
          title: 'High bug count',
          details: 'Found 15 bugs in production',
          source: 'rules',
          category: 'technical',
          priority: 0.9
        }
      ],
      actionItems: [
        {
          title: 'Implement code review checklist',
          details: 'Create a comprehensive checklist for code reviews',
          source: 'hybrid',
          confidence: 0.8,
          category: 'process',
          priority: 0.8,
          assignee: 'John Doe'
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
        llmAnalysisUsed: true
      }
    };
  });

  describe('POST /api/export-retro', () => {
    it('should export retro data as markdown', async () => {
      const response = await request(app)
        .post('/api/export-retro')
        .send({
          retroData: mockRetroData,
          format: 'markdown'
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('text/markdown; charset=utf-8');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain('.md');
      expect(response.text).toContain('# Sprint Retro Results');
      expect(response.text).toContain('Great team collaboration');
      expect(response.text).toContain('High bug count');
      expect(response.text).toContain('Implement code review checklist');
    });

    it('should export retro data as JSON', async () => {
      const response = await request(app)
        .post('/api/export-retro')
        .send({
          retroData: mockRetroData,
          format: 'json'
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
      expect(response.headers['content-disposition']).toContain('.json');
      
      const jsonData = JSON.parse(response.text);
      expect(jsonData).toHaveProperty('metadata');
      expect(jsonData).toHaveProperty('insights');
      expect(jsonData.insights.wentWell).toHaveLength(1);
      expect(jsonData.insights.didntGoWell).toHaveLength(1);
      expect(jsonData.insights.actionItems).toHaveLength(1);
    });

    it('should export retro data as CSV', async () => {
      const response = await request(app)
        .post('/api/export-retro')
        .send({
          retroData: mockRetroData,
          format: 'csv'
        });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(response.headers['content-disposition']).toContain('.csv');
      expect(response.text).toContain('Section,Title,Details,Source');
      expect(response.text).toContain('What Went Well,Great team collaboration');
      expect(response.text).toContain('What Didn\'t Go Well,High bug count');
      expect(response.text).toContain('Action Items,Implement code review checklist');
    });

    it('should include source attribution when requested', async () => {
      const response = await request(app)
        .post('/api/export-retro')
        .send({
          retroData: mockRetroData,
          format: 'markdown',
          options: {
            includeSourceAttribution: true,
            includeConfidenceScores: true,
            includeReasoningForAI: true
          }
        });

      expect(response.status).toBe(200);
      expect(response.text).toContain('**Source:** AI Analysis');
      expect(response.text).toContain('85% confidence');
      expect(response.text).toContain('via openai');
      expect(response.text).toContain('**AI Reasoning:**');
      expect(response.text).toContain('Multiple positive interactions observed in Slack');
    });

    it('should return 400 for invalid retro data', async () => {
      const response = await request(app)
        .post('/api/export-retro')
        .send({
          retroData: null,
          format: 'markdown'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid retro data provided');
    });

    it('should return 400 for unsupported format', async () => {
      const response = await request(app)
        .post('/api/export-retro')
        .send({
          retroData: mockRetroData,
          format: 'xml'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Unsupported format');
    });

    it('should handle empty retro data gracefully', async () => {
      const emptyRetroData = {
        wentWell: [],
        didntGoWell: [],
        actionItems: []
      };

      const response = await request(app)
        .post('/api/export-retro')
        .send({
          retroData: emptyRetroData,
          format: 'markdown'
        });

      expect(response.status).toBe(200);
      expect(response.text).toContain('# Sprint Retro Results');
      expect(response.text).toContain('_No insights found for this category._');
    });
  });

  describe('POST /api/export-retro/preview', () => {
    it('should generate export preview for markdown', async () => {
      const response = await request(app)
        .post('/api/export-retro/preview')
        .send({
          retroData: mockRetroData,
          format: 'markdown'
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('preview');
      expect(response.body).toHaveProperty('metadata');
      expect(response.body).toHaveProperty('stats');
      
      expect(response.body.metadata.format).toBe('markdown');
      expect(response.body.metadata.contentType).toBe('text/markdown');
      expect(response.body.stats.totalInsights).toBe(3);
      expect(response.body.preview).toContain('# Sprint Retro Results');
    });

    it('should generate export preview for JSON', async () => {
      const response = await request(app)
        .post('/api/export-retro/preview')
        .send({
          retroData: mockRetroData,
          format: 'json'
        });

      expect(response.status).toBe(200);
      expect(response.body.metadata.format).toBe('json');
      expect(response.body.metadata.contentType).toBe('application/json');
      
      const previewData = JSON.parse(response.body.preview);
      expect(previewData).toHaveProperty('insights');
      expect(previewData.insights.wentWell).toHaveLength(1);
    });

    it('should generate export preview for CSV', async () => {
      const response = await request(app)
        .post('/api/export-retro/preview')
        .send({
          retroData: mockRetroData,
          format: 'csv'
        });

      expect(response.status).toBe(200);
      expect(response.body.metadata.format).toBe('csv');
      expect(response.body.metadata.contentType).toBe('text/csv');
      expect(response.body.preview).toContain('Section,Title,Details,Source');
    });

    it('should include stats in preview response', async () => {
      const response = await request(app)
        .post('/api/export-retro/preview')
        .send({
          retroData: mockRetroData,
          format: 'markdown'
        });

      expect(response.status).toBe(200);
      expect(response.body.stats).toHaveProperty('size');
      expect(response.body.stats).toHaveProperty('lines');
      expect(response.body.stats).toHaveProperty('totalInsights');
      expect(response.body.stats.totalInsights).toBe(3);
      expect(response.body.stats.size).toBeGreaterThan(0);
      expect(response.body.stats.lines).toBeGreaterThan(0);
    });

    it('should return 400 for invalid preview data', async () => {
      const response = await request(app)
        .post('/api/export-retro/preview')
        .send({
          retroData: 'invalid',
          format: 'markdown'
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Invalid retro data provided');
    });
  });

  describe('Export with different options', () => {
    it('should respect includeMetadata option', async () => {
      const response = await request(app)
        .post('/api/export-retro')
        .send({
          retroData: mockRetroData,
          format: 'markdown',
          options: {
            includeMetadata: false
          }
        });

      expect(response.status).toBe(200);
      expect(response.text).not.toContain('## Analysis Information');
    });

    it('should respect includeSourceAttribution option', async () => {
      const response = await request(app)
        .post('/api/export-retro')
        .send({
          retroData: mockRetroData,
          format: 'markdown',
          options: {
            includeSourceAttribution: false
          }
        });

      expect(response.status).toBe(200);
      expect(response.text).not.toContain('**Source:**');
    });

    it('should respect includeReasoningForAI option', async () => {
      const response = await request(app)
        .post('/api/export-retro')
        .send({
          retroData: mockRetroData,
          format: 'markdown',
          options: {
            includeReasoningForAI: false
          }
        });

      expect(response.status).toBe(200);
      expect(response.text).not.toContain('**AI Reasoning:**');
    });
  });

  describe('Content-Type and Headers', () => {
    it('should set correct headers for markdown export', async () => {
      const response = await request(app)
        .post('/api/export-retro')
        .send({
          retroData: mockRetroData,
          format: 'markdown'
        });

      expect(response.headers['content-type']).toBe('text/markdown; charset=utf-8');
      expect(response.headers['content-disposition']).toMatch(/attachment; filename="retro-\d{4}-\d{2}-\d{2}\.md"/);
      expect(response.headers['content-length']).toBeDefined();
    });

    it('should set correct headers for JSON export', async () => {
      const response = await request(app)
        .post('/api/export-retro')
        .send({
          retroData: mockRetroData,
          format: 'json'
        });

      expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
      expect(response.headers['content-disposition']).toMatch(/attachment; filename="retro-\d{4}-\d{2}-\d{2}\.json"/);
    });

    it('should set correct headers for CSV export', async () => {
      const response = await request(app)
        .post('/api/export-retro')
        .send({
          retroData: mockRetroData,
          format: 'csv'
        });

      expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
      expect(response.headers['content-disposition']).toMatch(/attachment; filename="retro-\d{4}-\d{2}-\d{2}\.csv"/);
    });
  });
});