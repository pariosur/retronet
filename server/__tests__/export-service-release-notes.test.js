import { describe, it, expect } from 'vitest';
import ExportService from '../services/ExportService.js';

describe('ExportService Release Notes Methods', () => {
  const exportService = new ExportService();
  
  const mockReleaseNotes = {
    id: 'rn_test_123',
    title: 'Release Notes - January 2024',
    dateRange: {
      start: '2024-01-01',
      end: '2024-01-31'
    },
    entries: {
      newFeatures: [
        {
          id: 'feature-1',
          title: 'New User Dashboard',
          description: 'Added a comprehensive user dashboard with analytics and reporting capabilities',
          category: 'newFeatures',
          impact: 'high',
          userValue: 'Users can now track their progress and performance metrics in real-time'
        },
        {
          id: 'feature-2',
          title: 'Advanced Search',
          description: 'Implemented advanced search functionality with filters and sorting',
          category: 'newFeatures',
          impact: 'medium',
          userValue: 'Finding content is now faster and more intuitive'
        }
      ],
      improvements: [
        {
          id: 'improvement-1',
          title: 'Faster Loading Times',
          description: 'Optimized database queries and caching for 50% faster page loads',
          category: 'improvements',
          impact: 'medium',
          userValue: 'Pages load much faster for a better user experience'
        }
      ],
      fixes: [
        {
          id: 'fix-1',
          title: 'Login Issue Fixed',
          description: 'Resolved authentication bug that was affecting mobile users',
          category: 'fixes',
          impact: 'high',
          userValue: 'Mobile users can now log in without encountering errors'
        }
      ]
    },
    metadata: {
      sources: ['github', 'linear', 'slack'],
      generationMethod: 'llm-enhanced',
      llmProvider: 'openai',
      llmModel: 'gpt-4',
      analysisTime: 2500
    },
    createdAt: '2024-01-31T10:00:00Z',
    updatedAt: '2024-01-31T10:00:00Z'
  };

  describe('exportReleaseNotesToMarkdown', () => {
    it('should export release notes to markdown format', () => {
      const markdown = exportService.exportReleaseNotesToMarkdown(mockReleaseNotes);
      
      expect(markdown).toContain('# Release Notes - January 2024');
      expect(markdown).toContain('**Release Period:** 2024-01-01 to 2024-01-31');
      expect(markdown).toContain('## 🚀 New Features');
      expect(markdown).toContain('## ✨ Improvements');
      expect(markdown).toContain('## 🐛 Bug Fixes');
      expect(markdown).toContain('- **New User Dashboard**: Added a comprehensive user dashboard');
      expect(markdown).toContain('- **Faster Loading Times**: Optimized database queries');
      expect(markdown).toContain('- **Login Issue Fixed**: Resolved authentication bug');
      expect(markdown).toContain('*Generated on');
    });

    it('should include metadata when enabled', () => {
      const markdown = exportService.exportReleaseNotesToMarkdown(mockReleaseNotes, { includeMetadata: true });
      
      expect(markdown).toContain('## Generation Information');
      expect(markdown).toContain('**Analysis Method:** AI-Enhanced Analysis');
      expect(markdown).toContain('**AI Provider:** openai (gpt-4)');
      expect(markdown).toContain('**Data Sources:** github, linear, slack');
      expect(markdown).toContain('**Analysis Time:** 2500ms');
    });

    it('should handle empty categories gracefully', () => {
      const emptyReleaseNotes = {
        ...mockReleaseNotes,
        entries: {
          newFeatures: [],
          improvements: [],
          fixes: []
        }
      };
      
      const markdown = exportService.exportReleaseNotesToMarkdown(emptyReleaseNotes);
      
      expect(markdown).toContain('# Release Notes - January 2024');
      expect(markdown).not.toContain('## 🚀 New Features');
      expect(markdown).not.toContain('## ✨ Improvements');
      expect(markdown).not.toContain('## 🐛 Bug Fixes');
    });
  });

  describe('exportReleaseNotesToHTML', () => {
    it('should export release notes to HTML format', () => {
      const html = exportService.exportReleaseNotesToHTML(mockReleaseNotes);
      
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('<title>Release Notes - January 2024</title>');
      expect(html).toContain('<h1>Release Notes - January 2024</h1>');
      expect(html).toContain('<h2>🚀 New Features</h2>');
      expect(html).toContain('<h2>✨ Improvements</h2>');
      expect(html).toContain('<h2>🐛 Bug Fixes</h2>');
      expect(html).toContain('<div class="entry">');
      expect(html).toContain('<div class="entry-title">New User Dashboard</div>');
      expect(html).toContain('</body>');
      expect(html).toContain('</html>');
    });

    it('should include CSS styling', () => {
      const html = exportService.exportReleaseNotesToHTML(mockReleaseNotes);
      
      expect(html).toContain('<style>');
      expect(html).toContain('font-family:');
      expect(html).toContain('.entry {');
      expect(html).toContain('.entry-title {');
      expect(html).toContain('</style>');
    });

    it('should include metadata when enabled', () => {
      const html = exportService.exportReleaseNotesToHTML(mockReleaseNotes, { includeMetadata: true });
      
      expect(html).toContain('<div class="metadata">');
      expect(html).toContain('<h3>Generation Information</h3>');
      expect(html).toContain('<strong>Analysis Method:</strong> AI-Enhanced Analysis');
      expect(html).toContain('<strong>AI Provider:</strong> openai (gpt-4)');
    });
  });

  describe('exportReleaseNotesToJSON', () => {
    it('should export release notes to JSON format', () => {
      const jsonString = exportService.exportReleaseNotesToJSON(mockReleaseNotes);
      const exportData = JSON.parse(jsonString);
      
      expect(exportData).toHaveProperty('metadata');
      expect(exportData).toHaveProperty('releaseNotes');
      expect(exportData).toHaveProperty('summary');
      
      expect(exportData.metadata).toHaveProperty('exportedAt');
      expect(exportData.metadata).toHaveProperty('format', 'json');
      expect(exportData.metadata).toHaveProperty('version', '1.0');
      
      expect(exportData.releaseNotes).toHaveProperty('id', 'rn_test_123');
      expect(exportData.releaseNotes).toHaveProperty('title', 'Release Notes - January 2024');
      expect(exportData.releaseNotes).toHaveProperty('entries');
      
      expect(exportData.releaseNotes.entries).toHaveProperty('newFeatures');
      expect(exportData.releaseNotes.entries).toHaveProperty('improvements');
      expect(exportData.releaseNotes.entries).toHaveProperty('fixes');
      
      expect(exportData.summary).toHaveProperty('totalEntries', 4);
      expect(exportData.summary).toHaveProperty('newFeatures', 2);
      expect(exportData.summary).toHaveProperty('improvements', 1);
      expect(exportData.summary).toHaveProperty('fixes', 1);
    });

    it('should include generation metadata when enabled', () => {
      const jsonString = exportService.exportReleaseNotesToJSON(mockReleaseNotes, { includeMetadata: true });
      const exportData = JSON.parse(jsonString);
      
      expect(exportData.releaseNotes).toHaveProperty('generationMetadata');
      expect(exportData.releaseNotes.generationMetadata).toHaveProperty('generationMethod', 'llm-enhanced');
      expect(exportData.releaseNotes.generationMetadata).toHaveProperty('llmProvider', 'openai');
      expect(exportData.releaseNotes.generationMetadata).toHaveProperty('llmModel', 'gpt-4');
    });

    it('should exclude generation metadata when disabled', () => {
      const jsonString = exportService.exportReleaseNotesToJSON(mockReleaseNotes, { includeMetadata: false });
      const exportData = JSON.parse(jsonString);
      
      expect(exportData.releaseNotes.generationMetadata).toBeUndefined();
    });
  });

  describe('_formatReleaseNotesEntriesForMarkdown', () => {
    it('should format entries correctly for markdown', () => {
      const entries = mockReleaseNotes.entries.newFeatures;
      const formatted = exportService._formatReleaseNotesEntriesForMarkdown(entries, {});
      
      expect(formatted).toContain('- **New User Dashboard**: Added a comprehensive user dashboard');
      expect(formatted).toContain('- **Advanced Search**: Implemented advanced search functionality');
    });

    it('should include user value when metadata is enabled', () => {
      const entries = mockReleaseNotes.entries.newFeatures;
      const formatted = exportService._formatReleaseNotesEntriesForMarkdown(entries, { includeMetadata: true });
      
      expect(formatted).toContain('_Users can now track their progress and performance metrics in real-time_');
      expect(formatted).toContain('_Finding content is now faster and more intuitive_');
    });

    it('should handle empty entries', () => {
      const formatted = exportService._formatReleaseNotesEntriesForMarkdown([], {});
      
      expect(formatted).toBe('_No entries in this category._\n');
    });
  });

  describe('_formatReleaseNotesEntriesForHTML', () => {
    it('should format entries correctly for HTML', () => {
      const entries = mockReleaseNotes.entries.newFeatures;
      const formatted = exportService._formatReleaseNotesEntriesForHTML(entries, {});
      
      expect(formatted).toContain('<div class="entry">');
      expect(formatted).toContain('<div class="entry-title">New User Dashboard</div>');
      expect(formatted).toContain('<div class="entry-description">Added a comprehensive user dashboard');
    });

    it('should include user value when metadata is enabled', () => {
      const entries = mockReleaseNotes.entries.newFeatures;
      const formatted = exportService._formatReleaseNotesEntriesForHTML(entries, { includeMetadata: true });
      
      expect(formatted).toContain('<div class="entry-value">Users can now track their progress');
    });

    it('should handle empty entries', () => {
      const formatted = exportService._formatReleaseNotesEntriesForHTML([], {});
      
      expect(formatted).toBe('    <p><em>No entries in this category.</em></p>\n');
    });
  });

  describe('_formatReleaseNotesEntriesForJSON', () => {
    it('should format entries correctly for JSON', () => {
      const entries = mockReleaseNotes.entries.newFeatures;
      const formatted = exportService._formatReleaseNotesEntriesForJSON(entries, {});
      
      expect(formatted).toHaveLength(2);
      expect(formatted[0]).toHaveProperty('id', 'feature-1');
      expect(formatted[0]).toHaveProperty('title', 'New User Dashboard');
      expect(formatted[0]).toHaveProperty('description');
      expect(formatted[0]).toHaveProperty('category', 'newFeatures');
      expect(formatted[0]).toHaveProperty('impact', 'high');
      expect(formatted[0]).toHaveProperty('userValue');
    });

    it('should include metadata when enabled', () => {
      const entriesWithMetadata = mockReleaseNotes.entries.newFeatures.map(entry => ({
        ...entry,
        metadata: { source: 'github', confidence: 0.9 }
      }));
      
      const formatted = exportService._formatReleaseNotesEntriesForJSON(entriesWithMetadata, { includeMetadata: true });
      
      expect(formatted[0]).toHaveProperty('metadata');
      expect(formatted[0].metadata).toHaveProperty('source', 'github');
      expect(formatted[0].metadata).toHaveProperty('confidence', 0.9);
    });
  });
});