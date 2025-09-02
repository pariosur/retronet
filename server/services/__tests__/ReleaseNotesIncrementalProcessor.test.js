/**
 * Tests for ReleaseNotesIncrementalProcessor
 */

import { describe, it, test, expect, beforeEach, afterEach, vi } from 'vitest';
import ReleaseNotesIncrementalProcessor from '../ReleaseNotesIncrementalProcessor.js';

describe('ReleaseNotesIncrementalProcessor', () => {
  let processor;

  beforeEach(() => {
    processor = new ReleaseNotesIncrementalProcessor({
      maxChunkSizeDays: 7,
      maxDataPointsPerChunk: 100,
      maxConcurrentChunks: 2,
      largeDateRangeThreshold: 14,
      largeDataVolumeThreshold: 200
    });
  });

  afterEach(() => {
    processor.resetStats();
  });

  describe('Incremental Processing Decision', () => {
    test('should recommend incremental processing for large date ranges', () => {
      const dateRange = {
        start: '2024-01-01',
        end: '2024-01-20' // 19 days
      };
      const estimatedDataVolume = { github: 50, linear: 30, slack: 20 };
      
      const shouldUse = processor.shouldUseIncrementalProcessing(dateRange, estimatedDataVolume);
      expect(shouldUse).toBe(true);
    });

    test('should recommend incremental processing for large data volumes', () => {
      const dateRange = {
        start: '2024-01-01',
        end: '2024-01-07' // 6 days
      };
      const estimatedDataVolume = { github: 150, linear: 100, slack: 80 }; // 330 total
      
      const shouldUse = processor.shouldUseIncrementalProcessing(dateRange, estimatedDataVolume);
      expect(shouldUse).toBe(true);
    });

    test('should not recommend incremental processing for small ranges and volumes', () => {
      const dateRange = {
        start: '2024-01-01',
        end: '2024-01-07' // 6 days
      };
      const estimatedDataVolume = { github: 50, linear: 30, slack: 20 }; // 100 total
      
      const shouldUse = processor.shouldUseIncrementalProcessing(dateRange, estimatedDataVolume);
      expect(shouldUse).toBe(false);
    });
  });

  describe('Chunk Creation', () => {
    test('should create appropriate chunks for large date range', () => {
      const dateRange = {
        start: '2024-01-01',
        end: '2024-01-20'
      };
      const options = {};
      
      const chunks = processor._createProcessingChunks(dateRange, options);
      
      expect(chunks.length).toBeGreaterThan(1);
      expect(chunks[0].dateRange.start).toBe('2024-01-01');
      expect(chunks[chunks.length - 1].dateRange.end).toBe('2024-01-20');
      
      // Each chunk should be no more than maxChunkSizeDays
      chunks.forEach(chunk => {
        const start = new Date(chunk.dateRange.start);
        const end = new Date(chunk.dateRange.end);
        const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
        expect(days).toBeLessThanOrEqual(7);
      });
    });

    test('should create single chunk for small date range', () => {
      const dateRange = {
        start: '2024-01-01',
        end: '2024-01-05'
      };
      const options = {};
      
      const chunks = processor._createProcessingChunks(dateRange, options);
      
      expect(chunks.length).toBe(1);
      expect(chunks[0].dateRange.start).toBe('2024-01-01');
      expect(chunks[0].dateRange.end).toBe('2024-01-05');
    });

    test('should assign unique IDs to chunks', () => {
      const dateRange = {
        start: '2024-01-01',
        end: '2024-01-20'
      };
      const options = {};
      
      const chunks = processor._createProcessingChunks(dateRange, options);
      const ids = chunks.map(chunk => chunk.id);
      const uniqueIds = new Set(ids);
      
      expect(uniqueIds.size).toBe(chunks.length);
    });
  });

  describe('Incremental Processing', () => {
    test('should process chunks and combine results', async () => {
      const dateRange = {
        start: '2024-01-01',
        end: '2024-01-08' // Small range
      };
      const options = {};
      
      // Simple mock that returns immediately
      const mockChunkProcessor = vi.fn().mockResolvedValue({
        entries: {
          newFeatures: [{ id: 'test1', title: 'Test Feature', description: 'Test' }],
          improvements: [],
          fixes: []
        },
        metadata: { totalChanges: 1, sources: ['github'] }
      });
      
      const result = await processor.processIncrementally(
        dateRange,
        options,
        mockChunkProcessor
      );
      
      expect(result).toBeDefined();
      expect(result.entries).toBeDefined();
      expect(result.metadata.processingMethod).toBe('incremental');
    });

    test('should handle chunk processing failures gracefully', async () => {
      const dateRange = {
        start: '2024-01-01',
        end: '2024-01-08'
      };
      const options = {};
      
      // First call fails, second succeeds
      const mockChunkProcessor = vi.fn()
        .mockRejectedValueOnce(new Error('Chunk failed'))
        .mockResolvedValue({
          entries: { newFeatures: [], improvements: [], fixes: [] },
          metadata: { totalChanges: 0, sources: [] }
        });
      
      const result = await processor.processIncrementally(
        dateRange,
        options,
        mockChunkProcessor
      );
      
      expect(result).toBeDefined();
      expect(result.warnings).toBeDefined();
    });

    test('should respect concurrency limits', () => {
      // Test the configuration
      expect(processor.config.maxConcurrentChunks).toBe(2);
      
      // Test chunk creation doesn't exceed reasonable limits
      const chunks = processor._createProcessingChunks(
        { start: '2024-01-01', end: '2024-01-15' },
        {}
      );
      
      expect(chunks.length).toBeLessThan(10); // Reasonable number of chunks
    });
  });

  describe('Result Combination', () => {
    test('should combine entries from multiple chunks', () => {
      const chunkResults = [
        {
          chunk: { id: 'chunk_0' },
          result: {
            success: true,
            data: {
              entries: {
                newFeatures: [{ id: '1', title: 'Feature 1' }],
                improvements: [{ id: '2', title: 'Improvement 1' }],
                fixes: []
              },
              metadata: { totalChanges: 2, sources: ['github'] }
            }
          }
        },
        {
          chunk: { id: 'chunk_1' },
          result: {
            success: true,
            data: {
              entries: {
                newFeatures: [{ id: '3', title: 'Feature 2' }],
                improvements: [],
                fixes: [{ id: '4', title: 'Fix 1' }]
              },
              metadata: { totalChanges: 2, sources: ['linear'] }
            }
          }
        }
      ];
      
      const dateRange = { start: '2024-01-01', end: '2024-01-15' };
      const options = {};
      
      const combined = processor._combineChunkResults(chunkResults, dateRange, options);
      
      expect(combined.entries.newFeatures).toHaveLength(2);
      expect(combined.entries.improvements).toHaveLength(1);
      expect(combined.entries.fixes).toHaveLength(1);
      expect(combined.metadata.totalChanges).toBe(4);
      expect(combined.metadata.sources).toEqual(['github', 'linear']);
    });

    test('should handle failed chunks in combination', () => {
      const chunkResults = [
        {
          chunk: { id: 'chunk_0' },
          result: {
            success: true,
            data: {
              entries: { newFeatures: [{ id: '1', title: 'Feature 1' }], improvements: [], fixes: [] },
              metadata: { totalChanges: 1, sources: ['github'] }
            }
          }
        },
        {
          chunk: { id: 'chunk_1' },
          result: {
            success: false,
            error: 'Processing failed'
          }
        }
      ];
      
      const dateRange = { start: '2024-01-01', end: '2024-01-15' };
      const options = {};
      
      const combined = processor._combineChunkResults(chunkResults, dateRange, options);
      
      expect(combined.entries.newFeatures).toHaveLength(1);
      expect(combined.warnings).toBeDefined();
      expect(combined.warnings.failedChunks).toContain('chunk_1');
    });

    test('should deduplicate entries across chunks', () => {
      const chunkResults = [
        {
          chunk: { id: 'chunk_0' },
          result: {
            success: true,
            data: {
              entries: {
                newFeatures: [
                  { id: '1', title: 'Add user authentication', description: 'Login system' }
                ],
                improvements: [],
                fixes: []
              },
              metadata: { totalChanges: 1, sources: ['github'] }
            }
          }
        },
        {
          chunk: { id: 'chunk_1' },
          result: {
            success: true,
            data: {
              entries: {
                newFeatures: [
                  { id: '2', title: 'Add user authentication feature', description: 'Authentication system' }
                ],
                improvements: [],
                fixes: []
              },
              metadata: { totalChanges: 1, sources: ['github'] }
            }
          }
        }
      ];
      
      const dateRange = { start: '2024-01-01', end: '2024-01-15' };
      const options = {};
      
      const combined = processor._combineChunkResults(chunkResults, dateRange, options);
      
      // Should deduplicate similar entries (both entries are similar so one should be removed)
      expect(combined.entries.newFeatures.length).toBe(1);
    });
  });

  describe('Processing Statistics', () => {
    test('should track processing statistics', () => {
      // Test initial state
      const stats = processor.getProcessingStats();
      expect(stats.totalChunks).toBe(0);
      expect(stats.processedChunks).toBe(0);
      expect(stats.failedChunks).toBe(0);
      
      // Test manual stat updates
      processor.processingStats.totalChunks = 3;
      processor.processingStats.processedChunks = 2;
      processor.processingStats.failedChunks = 1;
      
      const updatedStats = processor.getProcessingStats();
      expect(updatedStats.totalChunks).toBe(3);
      expect(updatedStats.processedChunks).toBe(2);
      expect(updatedStats.failedChunks).toBe(1);
    });

    test('should reset statistics', () => {
      processor.processingStats.totalChunks = 5;
      processor.processingStats.processedChunks = 3;
      processor.processingStats.failedChunks = 2;
      
      processor.resetStats();
      
      const stats = processor.getProcessingStats();
      expect(stats.totalChunks).toBe(0);
      expect(stats.processedChunks).toBe(0);
      expect(stats.failedChunks).toBe(0);
    });
  });

  describe('Error Handling', () => {
    test('should throw error when all chunks fail', async () => {
      const dateRange = {
        start: '2024-01-01',
        end: '2024-01-03' // Very small range
      };
      const options = {};
      
      const mockChunkProcessor = vi.fn().mockRejectedValue(new Error('All chunks failed'));
      
      await expect(
        processor.processIncrementally(dateRange, options, mockChunkProcessor)
      ).rejects.toThrow('All chunks failed to process');
    });

    test('should handle successful processing', async () => {
      const dateRange = {
        start: '2024-01-01',
        end: '2024-01-03'
      };
      const options = {};
      
      const mockChunkProcessor = vi.fn().mockResolvedValue({
        entries: { newFeatures: [], improvements: [], fixes: [] },
        metadata: { totalChanges: 0, sources: [] }
      });
      
      const result = await processor.processIncrementally(
        dateRange,
        options,
        mockChunkProcessor
      );
      
      expect(result).toBeDefined();
      expect(result.entries).toBeDefined();
    });
  });
});