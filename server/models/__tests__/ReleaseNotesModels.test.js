/**
 * Tests for Release Notes Data Models
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { 
  ReleaseNotesEntry, 
  ReleaseNotesDocument, 
  ValidationError, 
  ReleaseNotesUtils 
} from '../ReleaseNotesModels.js';

describe('ReleaseNotesEntry', () => {
  describe('constructor', () => {
    it('should create a valid entry with minimal data', () => {
      const entry = new ReleaseNotesEntry({
        title: 'Test Feature',
        description: 'A test feature for users'
      });

      expect(entry.id).toBeDefined();
      expect(entry.title).toBe('Test Feature');
      expect(entry.description).toBe('A test feature for users');
      expect(entry.category).toBe('improvement');
      expect(entry.impact).toBe('medium');
      expect(entry.confidence).toBe(0.5);
      expect(entry.source).toBe('rules');
      expect(entry.metadata.createdAt).toBeDefined();
    });

    it('should create a valid entry with full data', () => {
      const entryData = {
        title: 'New Dashboard',
        description: 'Added a new analytics dashboard',
        category: 'feature',
        impact: 'high',
        userValue: 'Provides better insights into data',
        confidence: 0.9,
        source: 'ai',
        technicalDetails: {
          commits: ['abc123'],
          issues: ['issue-1'],
          pullRequests: ['pr-1']
        },
        metadata: {
          originalTitle: 'feat: add dashboard',
          translationConfidence: 0.8,
          reviewRequired: false
        }
      };

      const entry = new ReleaseNotesEntry(entryData);

      expect(entry.title).toBe('New Dashboard');
      expect(entry.category).toBe('feature');
      expect(entry.impact).toBe('high');
      expect(entry.confidence).toBe(0.9);
      expect(entry.source).toBe('ai');
      expect(entry.technicalDetails.commits).toEqual(['abc123']);
      expect(entry.metadata.originalTitle).toBe('feat: add dashboard');
    });

    it('should throw validation error for invalid data', () => {
      expect(() => new ReleaseNotesEntry({})).toThrow(ValidationError);
      expect(() => new ReleaseNotesEntry({ title: '' })).toThrow(ValidationError);
      expect(() => new ReleaseNotesEntry({ 
        title: 'Test', 
        description: 'Test',
        category: 'invalid' 
      })).toThrow(ValidationError);
    });

    it('should validate category values', () => {
      expect(() => new ReleaseNotesEntry({
        title: 'Test',
        description: 'Test',
        category: 'invalid-category'
      })).toThrow('Category must be one of: feature, improvement, fix');
    });

    it('should validate impact values', () => {
      expect(() => new ReleaseNotesEntry({
        title: 'Test',
        description: 'Test',
        impact: 'invalid-impact'
      })).toThrow('Impact must be one of: high, medium, low');
    });

    it('should validate confidence range', () => {
      expect(() => new ReleaseNotesEntry({
        title: 'Test',
        description: 'Test',
        confidence: 1.5
      })).toThrow('Confidence must be a number between 0 and 1');

      expect(() => new ReleaseNotesEntry({
        title: 'Test',
        description: 'Test',
        confidence: -0.1
      })).toThrow('Confidence must be a number between 0 and 1');
    });

    it('should validate source values', () => {
      expect(() => new ReleaseNotesEntry({
        title: 'Test',
        description: 'Test',
        source: 'invalid-source'
      })).toThrow('Source must be one of: ai, rules, manual');
    });
  });

  describe('update', () => {
    let entry;

    beforeEach(() => {
      entry = new ReleaseNotesEntry({
        title: 'Original Title',
        description: 'Original description'
      });
    });

    it('should update allowed fields', () => {
      const originalUpdatedAt = entry.metadata.updatedAt;
      
      // Wait a bit to ensure timestamp changes
      setTimeout(() => {
        entry.update({
          title: 'Updated Title',
          description: 'Updated description',
          category: 'feature',
          impact: 'high'
        });

        expect(entry.title).toBe('Updated Title');
        expect(entry.description).toBe('Updated description');
        expect(entry.category).toBe('feature');
        expect(entry.impact).toBe('high');
        expect(entry.metadata.updatedAt).not.toBe(originalUpdatedAt);
      }, 1);
    });

    it('should ignore non-allowed fields', () => {
      const originalId = entry.id;
      
      entry.update({
        id: 'new-id',
        title: 'Updated Title',
        invalidField: 'should be ignored'
      });

      expect(entry.id).toBe(originalId);
      expect(entry.title).toBe('Updated Title');
      expect(entry.invalidField).toBeUndefined();
    });

    it('should validate updates', () => {
      expect(() => entry.update({ category: 'invalid' })).toThrow(ValidationError);
      expect(() => entry.update({ confidence: 2 })).toThrow(ValidationError);
    });

    it('should update metadata', () => {
      entry.update({
        title: 'Updated',
        metadata: { reviewRequired: true }
      });

      expect(entry.metadata.reviewRequired).toBe(true);
      expect(entry.metadata.updatedAt).toBeDefined();
    });
  });

  describe('serialization', () => {
    it('should convert to JSON correctly', () => {
      const entry = new ReleaseNotesEntry({
        title: 'Test Entry',
        description: 'Test description',
        category: 'feature'
      });

      const json = entry.toJSON();

      expect(json.id).toBe(entry.id);
      expect(json.title).toBe('Test Entry');
      expect(json.category).toBe('feature');
      expect(json.metadata).toBeDefined();
    });

    it('should create from JSON correctly', () => {
      const data = {
        title: 'Test Entry',
        description: 'Test description',
        category: 'feature',
        impact: 'high'
      };

      const entry = ReleaseNotesEntry.fromJSON(data);

      expect(entry).toBeInstanceOf(ReleaseNotesEntry);
      expect(entry.title).toBe('Test Entry');
      expect(entry.category).toBe('feature');
      expect(entry.impact).toBe('high');
    });
  });

  describe('static validation', () => {
    it('should validate valid data', () => {
      const result = ReleaseNotesEntry.validate({
        title: 'Valid Entry',
        description: 'Valid description'
      });

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should return errors for invalid data', () => {
      const result = ReleaseNotesEntry.validate({
        title: '',
        description: 'Valid description'
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

describe('ReleaseNotesDocument', () => {
  describe('constructor', () => {
    it('should create a valid document with minimal data', () => {
      const doc = new ReleaseNotesDocument({
        title: 'Release v1.0.0',
        dateRange: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-31T23:59:59Z'
        }
      });

      expect(doc.id).toBeDefined();
      expect(doc.title).toBe('Release v1.0.0');
      expect(doc.dateRange.start).toBe('2024-01-01T00:00:00Z');
      expect(doc.entries.newFeatures).toEqual([]);
      expect(doc.entries.improvements).toEqual([]);
      expect(doc.entries.fixes).toEqual([]);
      expect(doc.metadata.totalChanges).toBe(0);
    });

    it('should create a valid document with entries', () => {
      const entries = [
        {
          title: 'New Feature',
          description: 'Added new feature',
          category: 'feature'
        },
        {
          title: 'Bug Fix',
          description: 'Fixed a bug',
          category: 'fix'
        }
      ];

      const doc = new ReleaseNotesDocument({
        title: 'Release v1.0.0',
        dateRange: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-31T23:59:59Z'
        },
        entries: {
          newFeatures: [entries[0]],
          improvements: [],
          fixes: [entries[1]]
        }
      });

      expect(doc.entries.newFeatures).toHaveLength(1);
      expect(doc.entries.fixes).toHaveLength(1);
      expect(doc.entries.newFeatures[0]).toBeInstanceOf(ReleaseNotesEntry);
      expect(doc.metadata.totalChanges).toBe(2);
    });

    it('should throw validation error for invalid data', () => {
      expect(() => new ReleaseNotesDocument({})).toThrow(ValidationError);
      
      expect(() => new ReleaseNotesDocument({
        title: 'Test',
        dateRange: { start: 'invalid-date', end: '2024-01-31' }
      })).toThrow(ValidationError);

      expect(() => new ReleaseNotesDocument({
        title: 'Test',
        dateRange: { start: '2024-01-31', end: '2024-01-01' }
      })).toThrow('Date range start must be before end date');
    });
  });

  describe('entry management', () => {
    let doc;

    beforeEach(() => {
      doc = new ReleaseNotesDocument({
        title: 'Test Release',
        dateRange: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-31T23:59:59Z'
        }
      });
    });

    it('should add entries correctly', () => {
      const entry = new ReleaseNotesEntry({
        title: 'New Feature',
        description: 'Added new feature',
        category: 'feature'
      });

      doc.addEntry(entry);

      expect(doc.entries.newFeatures).toHaveLength(1);
      expect(doc.entries.newFeatures[0]).toBe(entry);
      expect(doc.metadata.totalChanges).toBe(1);
    });

    it('should add entries from plain objects', () => {
      doc.addEntry({
        title: 'Bug Fix',
        description: 'Fixed a bug',
        category: 'fix'
      });

      expect(doc.entries.fixes).toHaveLength(1);
      expect(doc.entries.fixes[0]).toBeInstanceOf(ReleaseNotesEntry);
      expect(doc.metadata.totalChanges).toBe(1);
    });

    it('should remove entries correctly', () => {
      const entry = new ReleaseNotesEntry({
        title: 'Test Entry',
        description: 'Test description'
      });

      doc.addEntry(entry);
      expect(doc.metadata.totalChanges).toBe(1);

      const removed = doc.removeEntry(entry.id);
      expect(removed).toBe(true);
      expect(doc.metadata.totalChanges).toBe(0);
    });

    it('should update entries correctly', () => {
      const entry = new ReleaseNotesEntry({
        title: 'Original Title',
        description: 'Original description',
        category: 'improvement'
      });

      doc.addEntry(entry);

      const updated = doc.updateEntry(entry.id, {
        title: 'Updated Title',
        category: 'feature'
      });

      expect(updated).toBe(true);
      expect(doc.entries.improvements).toHaveLength(0);
      expect(doc.entries.newFeatures).toHaveLength(1);
      expect(doc.entries.newFeatures[0].title).toBe('Updated Title');
    });

    it('should get entries by ID', () => {
      const entry = new ReleaseNotesEntry({
        title: 'Test Entry',
        description: 'Test description'
      });

      doc.addEntry(entry);

      const retrieved = doc.getEntry(entry.id);
      expect(retrieved).toBe(entry);

      const notFound = doc.getEntry('non-existent-id');
      expect(notFound).toBeNull();
    });

    it('should get all entries as flat array', () => {
      doc.addEntry({ title: 'Feature', description: 'Feature desc', category: 'feature' });
      doc.addEntry({ title: 'Improvement', description: 'Improvement desc', category: 'improvement' });
      doc.addEntry({ title: 'Fix', description: 'Fix desc', category: 'fix' });

      const allEntries = doc.getAllEntries();
      expect(allEntries).toHaveLength(3);
      expect(allEntries.every(entry => entry instanceof ReleaseNotesEntry)).toBe(true);
    });
  });

  describe('metadata management', () => {
    let doc;

    beforeEach(() => {
      doc = new ReleaseNotesDocument({
        title: 'Test Release',
        dateRange: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-31T23:59:59Z'
        }
      });
    });

    it('should calculate metadata automatically', () => {
      // Add entries with different sources
      doc.addEntry({
        title: 'AI Generated',
        description: 'AI generated entry',
        source: 'ai',
        confidence: 0.9
      });

      doc.addEntry({
        title: 'Manual Entry',
        description: 'Manually created entry',
        source: 'manual',
        confidence: 0.8
      });

      expect(doc.metadata.totalChanges).toBe(2);
      expect(doc.metadata.aiGenerated).toBe(1);
      expect(doc.metadata.confidence).toBeCloseTo(0.85, 2); // Average of 0.9 and 0.8
    });

    it('should update metadata manually', () => {
      doc.updateMetadata({
        version: '2.0.0',
        customField: 'custom value'
      });

      expect(doc.metadata.version).toBe('2.0.0');
      expect(doc.metadata.customField).toBe('custom value');
    });
  });

  describe('serialization', () => {
    it('should convert to JSON correctly', () => {
      const doc = new ReleaseNotesDocument({
        title: 'Test Release',
        dateRange: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-31T23:59:59Z'
        }
      });

      doc.addEntry({
        title: 'Test Entry',
        description: 'Test description'
      });

      const json = doc.toJSON();

      expect(json.id).toBe(doc.id);
      expect(json.title).toBe('Test Release');
      expect(json.entries.improvements).toHaveLength(1);
      expect(json.metadata.totalChanges).toBe(1);
    });

    it('should create from JSON correctly', () => {
      const data = {
        title: 'Test Release',
        dateRange: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-31T23:59:59Z'
        },
        entries: {
          newFeatures: [{
            title: 'New Feature',
            description: 'Feature description',
            category: 'feature'
          }],
          improvements: [],
          fixes: []
        }
      };

      const doc = ReleaseNotesDocument.fromJSON(data);

      expect(doc).toBeInstanceOf(ReleaseNotesDocument);
      expect(doc.title).toBe('Test Release');
      expect(doc.entries.newFeatures).toHaveLength(1);
      expect(doc.entries.newFeatures[0]).toBeInstanceOf(ReleaseNotesEntry);
    });
  });

  describe('static validation', () => {
    it('should validate valid data', () => {
      const result = ReleaseNotesDocument.validate({
        title: 'Valid Document',
        dateRange: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-31T23:59:59Z'
        }
      });

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should return errors for invalid data', () => {
      const result = ReleaseNotesDocument.validate({
        title: '',
        dateRange: { start: 'invalid', end: 'invalid' }
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

describe('ReleaseNotesUtils', () => {
  describe('createEntryFromChange', () => {
    it('should create entry from change data', () => {
      const changeData = {
        title: 'Add new feature',
        description: 'Added a new feature for users',
        category: 'feature',
        confidence: 0.8,
        commits: ['abc123'],
        originalTitle: 'feat: add new feature'
      };

      const entry = ReleaseNotesUtils.createEntryFromChange(changeData);

      expect(entry).toBeInstanceOf(ReleaseNotesEntry);
      expect(entry.title).toBe('Add new feature');
      expect(entry.category).toBe('feature');
      expect(entry.confidence).toBe(0.8);
      expect(entry.technicalDetails.commits).toEqual(['abc123']);
      expect(entry.metadata.originalTitle).toBe('feat: add new feature');
    });

    it('should handle minimal change data', () => {
      const changeData = {
        title: 'Simple change'
      };

      const entry = ReleaseNotesUtils.createEntryFromChange(changeData);

      expect(entry).toBeInstanceOf(ReleaseNotesEntry);
      expect(entry.title).toBe('Simple change');
      expect(entry.category).toBe('improvement');
      expect(entry.confidence).toBe(0.5);
    });
  });

  describe('mergeDocuments', () => {
    it('should merge multiple documents', () => {
      const doc1 = new ReleaseNotesDocument({
        title: 'Release 1',
        dateRange: {
          start: '2024-01-01T00:00:00Z',
          end: '2024-01-15T23:59:59Z'
        }
      });

      const doc2 = new ReleaseNotesDocument({
        title: 'Release 2',
        dateRange: {
          start: '2024-01-16T00:00:00Z',
          end: '2024-01-31T23:59:59Z'
        }
      });

      doc1.addEntry({
        title: 'Feature 1',
        description: 'First feature',
        category: 'feature'
      });

      doc2.addEntry({
        title: 'Feature 2',
        description: 'Second feature',
        category: 'feature'
      });

      const merged = ReleaseNotesUtils.mergeDocuments([doc1, doc2]);

      expect(merged).toBeInstanceOf(ReleaseNotesDocument);
      expect(merged.entries.newFeatures).toHaveLength(2);
      expect(merged.dateRange.start).toBe('2024-01-01T00:00:00.000Z');
      expect(merged.dateRange.end).toBe('2024-01-31T23:59:59.000Z');
      expect(merged.metadata.mergedFrom).toEqual([doc1.id, doc2.id]);
    });

    it('should throw error for empty documents array', () => {
      expect(() => ReleaseNotesUtils.mergeDocuments([])).toThrow('Documents array is required and must not be empty');
    });
  });

  describe('filterEntries', () => {
    let entries;

    beforeEach(() => {
      entries = [
        new ReleaseNotesEntry({
          title: 'Feature 1',
          description: 'Feature description',
          category: 'feature',
          impact: 'high',
          confidence: 0.9,
          source: 'ai'
        }),
        new ReleaseNotesEntry({
          title: 'Improvement 1',
          description: 'Improvement description',
          category: 'improvement',
          impact: 'medium',
          confidence: 0.7,
          source: 'rules'
        }),
        new ReleaseNotesEntry({
          title: 'Fix 1',
          description: 'Fix description',
          category: 'fix',
          impact: 'low',
          confidence: 0.5,
          source: 'manual'
        })
      ];
    });

    it('should filter by category', () => {
      const filtered = ReleaseNotesUtils.filterEntries(entries, { category: 'feature' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].category).toBe('feature');
    });

    it('should filter by impact', () => {
      const filtered = ReleaseNotesUtils.filterEntries(entries, { impact: 'high' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].impact).toBe('high');
    });

    it('should filter by minimum confidence', () => {
      const filtered = ReleaseNotesUtils.filterEntries(entries, { minConfidence: 0.8 });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].confidence).toBe(0.9);
    });

    it('should filter by source', () => {
      const filtered = ReleaseNotesUtils.filterEntries(entries, { source: 'ai' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].source).toBe('ai');
    });

    it('should apply multiple filters', () => {
      const filtered = ReleaseNotesUtils.filterEntries(entries, {
        category: 'feature',
        impact: 'high',
        minConfidence: 0.8
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe('Feature 1');
    });
  });

  describe('sortEntries', () => {
    let entries;

    beforeEach(() => {
      entries = [
        new ReleaseNotesEntry({
          title: 'B Feature',
          description: 'Feature B',
          confidence: 0.7,
          impact: 'medium'
        }),
        new ReleaseNotesEntry({
          title: 'A Feature',
          description: 'Feature A',
          confidence: 0.9,
          impact: 'high'
        }),
        new ReleaseNotesEntry({
          title: 'C Feature',
          description: 'Feature C',
          confidence: 0.5,
          impact: 'low'
        })
      ];
    });

    it('should sort by confidence descending by default', () => {
      const sorted = ReleaseNotesUtils.sortEntries(entries);
      expect(sorted[0].confidence).toBe(0.9);
      expect(sorted[1].confidence).toBe(0.7);
      expect(sorted[2].confidence).toBe(0.5);
    });

    it('should sort by confidence ascending', () => {
      const sorted = ReleaseNotesUtils.sortEntries(entries, { by: 'confidence', order: 'asc' });
      expect(sorted[0].confidence).toBe(0.5);
      expect(sorted[1].confidence).toBe(0.7);
      expect(sorted[2].confidence).toBe(0.9);
    });

    it('should sort by impact', () => {
      const sorted = ReleaseNotesUtils.sortEntries(entries, { by: 'impact' });
      expect(sorted[0].impact).toBe('high');
      expect(sorted[1].impact).toBe('medium');
      expect(sorted[2].impact).toBe('low');
    });

    it('should sort by title', () => {
      const sorted = ReleaseNotesUtils.sortEntries(entries, { by: 'title', order: 'asc' });
      expect(sorted[0].title).toBe('A Feature');
      expect(sorted[1].title).toBe('B Feature');
      expect(sorted[2].title).toBe('C Feature');
    });
  });
});

describe('ValidationError', () => {
  it('should create validation error correctly', () => {
    const error = new ValidationError('Test validation error');
    
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.name).toBe('ValidationError');
    expect(error.message).toBe('Test validation error');
  });
});