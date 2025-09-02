/**
 * ReleaseNotesIncrementalProcessor - Handles incremental processing for large date ranges
 * 
 * This service breaks down large date ranges into smaller chunks for better performance
 * and memory management, processing them incrementally and combining results.
 */

class ReleaseNotesIncrementalProcessor {
  constructor(config = {}) {
    this.config = {
      // Chunk configuration
      maxChunkSizeDays: config.maxChunkSizeDays || 7, // Process 1 week at a time
      maxDataPointsPerChunk: config.maxDataPointsPerChunk || 500,
      maxConcurrentChunks: config.maxConcurrentChunks || 3,
      
      // Processing thresholds
      largeDateRangeThreshold: config.largeDateRangeThreshold || 14, // Days
      largeDataVolumeThreshold: config.largeDataVolumeThreshold || 1000,
      
      // Memory management
      enableMemoryOptimization: config.enableMemoryOptimization !== false,
      maxMemoryUsageMB: config.maxMemoryUsageMB || 512,
      
      ...config
    };

    this.processingStats = {
      totalChunks: 0,
      processedChunks: 0,
      failedChunks: 0,
      totalDataPoints: 0,
      processingTime: 0
    };
  }

  /**
   * Determine if incremental processing is needed
   * @param {Object} dateRange - Date range to analyze
   * @param {Object} estimatedDataVolume - Estimated data volume
   * @returns {boolean} Whether incremental processing is recommended
   */
  shouldUseIncrementalProcessing(dateRange, estimatedDataVolume = {}) {
    const daysDiff = this._calculateDateRangeDays(dateRange);
    const totalDataPoints = Object.values(estimatedDataVolume).reduce((sum, count) => sum + (count || 0), 0);

    // Use incremental processing for large date ranges or large data volumes
    return daysDiff > this.config.largeDateRangeThreshold || 
           totalDataPoints > this.config.largeDataVolumeThreshold;
  }

  /**
   * Process release notes incrementally for large date ranges
   * @param {Object} dateRange - Original date range
   * @param {Object} options - Processing options
   * @param {Function} chunkProcessor - Function to process each chunk
   * @param {Object} progressTracker - Progress tracker instance
   * @returns {Promise<Object>} Combined results from all chunks
   */
  async processIncrementally(dateRange, options, chunkProcessor, progressTracker = null) {
    const startTime = Date.now();
    
    try {
      console.log('Starting incremental processing for large date range:', dateRange);
      
      // Create processing chunks
      const chunks = this._createProcessingChunks(dateRange, options);
      this.processingStats.totalChunks = chunks.length;
      this.processingStats.processedChunks = 0;
      this.processingStats.failedChunks = 0;

      if (progressTracker) {
        progressTracker.setIncrementalMode(chunks.length);
      }

      console.log(`Created ${chunks.length} processing chunks for incremental processing`);

      // Process chunks with controlled concurrency
      const results = await this._processChunksConcurrently(
        chunks, 
        chunkProcessor, 
        progressTracker
      );

      // Combine results from all chunks
      const combinedResult = this._combineChunkResults(results, dateRange, options);

      this.processingStats.processingTime = Date.now() - startTime;
      
      console.log('Incremental processing completed:', {
        totalChunks: this.processingStats.totalChunks,
        processedChunks: this.processingStats.processedChunks,
        failedChunks: this.processingStats.failedChunks,
        processingTime: `${this.processingStats.processingTime}ms`
      });

      return combinedResult;

    } catch (error) {
      console.error('Incremental processing failed:', error.message);
      throw new Error(`Incremental processing failed: ${error.message}`);
    }
  }

  /**
   * Create processing chunks from date range
   * @param {Object} dateRange - Original date range
   * @param {Object} options - Processing options
   * @returns {Array} Array of processing chunks
   * @private
   */
  _createProcessingChunks(dateRange, options) {
    const chunks = [];
    const startDate = new Date(dateRange.start);
    const endDate = new Date(dateRange.end);
    
    let currentStart = new Date(startDate);
    let chunkIndex = 0;

    while (currentStart < endDate) {
      // Calculate chunk end date
      const chunkEnd = new Date(currentStart);
      chunkEnd.setDate(chunkEnd.getDate() + this.config.maxChunkSizeDays);
      
      // Don't exceed the original end date
      if (chunkEnd > endDate) {
        chunkEnd.setTime(endDate.getTime());
      }

      const chunk = {
        id: `chunk_${chunkIndex}`,
        dateRange: {
          start: currentStart.toISOString().split('T')[0],
          end: chunkEnd.toISOString().split('T')[0]
        },
        options: { ...options },
        index: chunkIndex,
        estimatedSize: this._estimateChunkSize(currentStart, chunkEnd)
      };

      chunks.push(chunk);
      
      // Move to next chunk
      currentStart = new Date(chunkEnd);
      currentStart.setDate(currentStart.getDate() + 1);
      chunkIndex++;
    }

    return chunks;
  }

  /**
   * Process chunks with controlled concurrency
   * @param {Array} chunks - Processing chunks
   * @param {Function} chunkProcessor - Function to process each chunk
   * @param {Object} progressTracker - Progress tracker
   * @returns {Promise<Array>} Results from all chunks
   * @private
   */
  async _processChunksConcurrently(chunks, chunkProcessor, progressTracker) {
    const results = [];
    const processing = [];
    let chunkIndex = 0;

    while (chunkIndex < chunks.length || processing.length > 0) {
      // Start new chunks up to concurrency limit
      while (processing.length < this.config.maxConcurrentChunks && chunkIndex < chunks.length) {
        const chunk = chunks[chunkIndex];
        
        console.log(`Starting processing of chunk ${chunk.id} (${chunk.dateRange.start} to ${chunk.dateRange.end})`);
        
        const chunkPromise = this._processChunkWithErrorHandling(
          chunk, 
          chunkProcessor, 
          progressTracker
        );
        
        processing.push({
          promise: chunkPromise,
          chunk,
          startTime: Date.now()
        });
        
        chunkIndex++;
      }

      // Wait for at least one chunk to complete
      if (processing.length > 0) {
        const completed = await Promise.race(processing.map(p => p.promise));
        
        // Find and remove completed chunk
        const completedIndex = processing.findIndex(p => p.promise === completed);
        if (completedIndex !== -1) {
          const completedChunk = processing[completedIndex];
          processing.splice(completedIndex, 1);
          
          const processingTime = Date.now() - completedChunk.startTime;
          console.log(`Completed chunk ${completedChunk.chunk.id} in ${processingTime}ms`);
          
          try {
            const result = await completed;
            results.push({
              chunk: completedChunk.chunk,
              result,
              processingTime
            });
            this.processingStats.processedChunks++;
          } catch (error) {
            console.error(`Chunk ${completedChunk.chunk.id} failed:`, error.message);
            results.push({
              chunk: completedChunk.chunk,
              error: error.message,
              processingTime
            });
            this.processingStats.failedChunks++;
          }

          // Update progress
          if (progressTracker) {
            progressTracker.updateIncrementalProgress(
              this.processingStats.processedChunks + this.processingStats.failedChunks,
              this.processingStats.totalChunks
            );
          }
        }
      }

      // Memory optimization - force garbage collection if enabled
      if (this.config.enableMemoryOptimization && results.length % 5 === 0) {
        this._optimizeMemoryUsage();
      }
    }

    return results;
  }

  /**
   * Process a single chunk with error handling
   * @param {Object} chunk - Chunk to process
   * @param {Function} chunkProcessor - Processing function
   * @param {Object} progressTracker - Progress tracker
   * @returns {Promise<Object>} Chunk processing result
   * @private
   */
  async _processChunkWithErrorHandling(chunk, chunkProcessor, progressTracker) {
    try {
      // Create chunk-specific progress tracker
      const chunkProgressTracker = progressTracker ? {
        ...progressTracker,
        updateChunkProgress: (step, message) => {
          progressTracker.updateChunkProgress?.(chunk.id, step, message);
        }
      } : null;

      // Process the chunk
      const result = await chunkProcessor(chunk.dateRange, chunk.options, chunkProgressTracker);
      
      return {
        success: true,
        data: result,
        chunk: chunk.id,
        dataPoints: this._countDataPoints(result)
      };

    } catch (error) {
      console.error(`Error processing chunk ${chunk.id}:`, error.message);
      
      // Return partial result if possible
      return {
        success: false,
        error: error.message,
        chunk: chunk.id,
        partialData: null
      };
    }
  }

  /**
   * Combine results from all processed chunks
   * @param {Array} chunkResults - Results from all chunks
   * @param {Object} originalDateRange - Original date range
   * @param {Object} options - Processing options
   * @returns {Object} Combined release notes document
   * @private
   */
  _combineChunkResults(chunkResults, originalDateRange, options) {
    const successfulResults = chunkResults.filter(r => r.result?.success);
    const failedResults = chunkResults.filter(r => !r.result?.success);

    if (successfulResults.length === 0) {
      throw new Error('All chunks failed to process');
    }

    console.log(`Combining results from ${successfulResults.length} successful chunks`);

    // Initialize combined result structure
    const combinedResult = {
      id: `incremental_${Date.now()}`,
      title: `Release Notes - ${originalDateRange.start} to ${originalDateRange.end}`,
      dateRange: originalDateRange,
      generatedAt: new Date().toISOString(),
      entries: {
        newFeatures: [],
        improvements: [],
        fixes: []
      },
      metadata: {
        totalChanges: 0,
        userFacingChanges: 0,
        aiGenerated: 0,
        manuallyReviewed: 0,
        sources: new Set(),
        processingMethod: 'incremental',
        chunks: {
          total: this.processingStats.totalChunks,
          successful: successfulResults.length,
          failed: failedResults.length
        }
      },
      warnings: failedResults.length > 0 ? {
        message: `${failedResults.length} chunks failed to process`,
        failedChunks: failedResults.map(r => r.chunk.id)
      } : null
    };

    // Combine entries from all successful chunks
    for (const chunkResult of successfulResults) {
      const chunkData = chunkResult.result.data;
      
      if (chunkData && chunkData.entries) {
        // Merge entries by category
        Object.keys(combinedResult.entries).forEach(category => {
          if (chunkData.entries[category]) {
            combinedResult.entries[category].push(...chunkData.entries[category]);
          }
        });

        // Aggregate metadata
        if (chunkData.metadata) {
          combinedResult.metadata.totalChanges += chunkData.metadata.totalChanges || 0;
          combinedResult.metadata.userFacingChanges += chunkData.metadata.userFacingChanges || 0;
          combinedResult.metadata.aiGenerated += chunkData.metadata.aiGenerated || 0;
          
          // Collect unique sources
          if (chunkData.metadata.sources) {
            chunkData.metadata.sources.forEach(source => 
              combinedResult.metadata.sources.add(source)
            );
          }
        }
      }
    }

    // Convert sources set to array
    combinedResult.metadata.sources = Array.from(combinedResult.metadata.sources);

    // Remove duplicates and sort entries
    this._deduplicateAndSortEntries(combinedResult.entries);

    // Add processing statistics
    combinedResult.metadata.incrementalProcessing = {
      totalProcessingTime: this.processingStats.processingTime,
      averageChunkTime: this.processingStats.processingTime / this.processingStats.processedChunks,
      chunksProcessed: this.processingStats.processedChunks,
      chunksFailed: this.processingStats.failedChunks
    };

    console.log('Combined incremental processing results:', {
      totalEntries: Object.values(combinedResult.entries).flat().length,
      newFeatures: combinedResult.entries.newFeatures.length,
      improvements: combinedResult.entries.improvements.length,
      fixes: combinedResult.entries.fixes.length
    });

    return combinedResult;
  }

  /**
   * Remove duplicate entries and sort by relevance
   * @param {Object} entries - Entries object with categories
   * @private
   */
  _deduplicateAndSortEntries(entries) {
    Object.keys(entries).forEach(category => {
      const categoryEntries = entries[category];
      
      // Remove duplicates based on title similarity
      const uniqueEntries = [];
      const seenTitles = new Set();
      
      for (const entry of categoryEntries) {
        const normalizedTitle = entry.title.toLowerCase().trim();
        
        // Check for similar titles
        let isDuplicate = false;
        for (const seenTitle of seenTitles) {
          if (this._calculateTitleSimilarity(normalizedTitle, seenTitle) > 0.8) {
            isDuplicate = true;
            break;
          }
        }
        
        if (!isDuplicate) {
          uniqueEntries.push(entry);
          seenTitles.add(normalizedTitle);
        }
      }
      
      // Sort by confidence and impact
      uniqueEntries.sort((a, b) => {
        const scoreA = (a.confidence || 0.5) * this._getImpactScore(a.impact);
        const scoreB = (b.confidence || 0.5) * this._getImpactScore(b.impact);
        return scoreB - scoreA;
      });
      
      entries[category] = uniqueEntries;
    });
  }

  /**
   * Calculate similarity between two titles
   * @param {string} title1 - First title
   * @param {string} title2 - Second title
   * @returns {number} Similarity score (0-1)
   * @private
   */
  _calculateTitleSimilarity(title1, title2) {
    const words1 = new Set(title1.split(/\s+/));
    const words2 = new Set(title2.split(/\s+/));
    
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  /**
   * Get numeric score for impact level
   * @param {string} impact - Impact level
   * @returns {number} Numeric score
   * @private
   */
  _getImpactScore(impact) {
    switch (impact) {
      case 'high': return 3;
      case 'medium': return 2;
      case 'low': return 1;
      default: return 1;
    }
  }

  /**
   * Calculate date range in days
   * @param {Object} dateRange - Date range object
   * @returns {number} Number of days
   * @private
   */
  _calculateDateRangeDays(dateRange) {
    const start = new Date(dateRange.start);
    const end = new Date(dateRange.end);
    return Math.ceil((end - start) / (1000 * 60 * 60 * 24));
  }

  /**
   * Estimate chunk size for processing planning
   * @param {Date} startDate - Chunk start date
   * @param {Date} endDate - Chunk end date
   * @returns {string} Size estimate
   * @private
   */
  _estimateChunkSize(startDate, endDate) {
    const days = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24));
    
    if (days <= 3) return 'small';
    if (days <= 7) return 'medium';
    return 'large';
  }

  /**
   * Count data points in a result
   * @param {Object} result - Processing result
   * @returns {number} Number of data points
   * @private
   */
  _countDataPoints(result) {
    if (!result || !result.entries) return 0;
    
    return Object.values(result.entries).flat().length;
  }

  /**
   * Optimize memory usage during processing
   * @private
   */
  _optimizeMemoryUsage() {
    if (global.gc) {
      global.gc();
      console.log('Performed garbage collection for memory optimization');
    }
  }

  /**
   * Get processing statistics
   * @returns {Object} Processing statistics
   */
  getProcessingStats() {
    return {
      ...this.processingStats,
      averageChunkTime: this.processingStats.processedChunks > 0 
        ? this.processingStats.processingTime / this.processingStats.processedChunks 
        : 0,
      successRate: this.processingStats.totalChunks > 0 
        ? (this.processingStats.processedChunks / this.processingStats.totalChunks) * 100 
        : 0
    };
  }

  /**
   * Reset processing statistics
   */
  resetStats() {
    this.processingStats = {
      totalChunks: 0,
      processedChunks: 0,
      failedChunks: 0,
      totalDataPoints: 0,
      processingTime: 0
    };
  }
}

export default ReleaseNotesIncrementalProcessor;