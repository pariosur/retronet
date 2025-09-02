/**
 * ReleaseNotesCache - Caching service for release notes analysis to reduce LLM calls
 * 
 * This service implements intelligent caching for similar change analysis,
 * reducing redundant LLM calls and improving performance.
 */

import crypto from 'crypto';

class ReleaseNotesCache {
  constructor(config = {}) {
    this.config = {
      // Cache configuration
      maxCacheSize: config.maxCacheSize || 1000,
      maxCacheAge: config.maxCacheAge || 24 * 60 * 60 * 1000, // 24 hours
      similarityThreshold: config.similarityThreshold || 0.8,
      
      // Cache categories
      enableUserImpactCache: config.enableUserImpactCache !== false,
      enableCategorizationCache: config.enableCategorizationCache !== false,
      enableTranslationCache: config.enableTranslationCache !== false,
      
      ...config
    };

    // In-memory cache stores
    this.caches = {
      userImpact: new Map(),
      categorization: new Map(),
      translation: new Map(),
      analysis: new Map() // Full analysis results
    };

    // Cache statistics
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalSavings: 0 // Estimated cost savings
    };

    // Start periodic cleanup
    this.startCleanupInterval();
  }

  /**
   * Generate cache key for a change or set of changes
   * @param {Object|Array} data - Change data or array of changes
   * @param {string} analysisType - Type of analysis (userImpact, categorization, translation)
   * @param {Object} context - Additional context for cache key
   * @returns {string} Cache key
   */
  generateCacheKey(data, analysisType, context = {}) {
    // Normalize data for consistent hashing
    const normalizedData = this._normalizeDataForCaching(data);
    
    // Include relevant context in cache key
    const cacheContext = {
      analysisType,
      provider: context.provider,
      model: context.model,
      // Include configuration that affects analysis results
      confidenceThreshold: context.confidenceThreshold,
      categories: context.categories
    };

    const keyData = {
      data: normalizedData,
      context: cacheContext
    };

    // Generate hash-based cache key
    const keyString = JSON.stringify(keyData);
    return crypto.createHash('sha256').update(keyString).digest('hex').substring(0, 16);
  }

  /**
   * Check if analysis result exists in cache
   * @param {string} cacheKey - Cache key
   * @param {string} cacheType - Cache type (userImpact, categorization, translation, analysis)
   * @returns {Object|null} Cached result or null
   */
  get(cacheKey, cacheType) {
    const cache = this.caches[cacheType];
    if (!cache) {
      return null;
    }

    const entry = cache.get(cacheKey);
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if entry has expired
    if (Date.now() - entry.timestamp > this.config.maxCacheAge) {
      cache.delete(cacheKey);
      this.stats.evictions++;
      this.stats.misses++;
      return null;
    }

    // Update access time for LRU
    entry.lastAccessed = Date.now();
    entry.accessCount++;
    
    this.stats.hits++;
    this.stats.totalSavings += entry.estimatedCost || 0;
    
    console.log(`Cache hit for ${cacheType}: ${cacheKey}`);
    return entry.result;
  }

  /**
   * Store analysis result in cache
   * @param {string} cacheKey - Cache key
   * @param {string} cacheType - Cache type
   * @param {Object} result - Analysis result to cache
   * @param {Object} metadata - Additional metadata
   */
  set(cacheKey, cacheType, result, metadata = {}) {
    const cache = this.caches[cacheType];
    if (!cache) {
      return;
    }

    // Check cache size and evict if necessary
    this._evictIfNecessary(cache);

    const entry = {
      result,
      timestamp: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 1,
      estimatedCost: metadata.estimatedCost || 0,
      provider: metadata.provider,
      model: metadata.model,
      dataSize: metadata.dataSize || 0
    };

    cache.set(cacheKey, entry);
    console.log(`Cached ${cacheType} result: ${cacheKey}`);
  }

  /**
   * Find similar cached results for a change
   * @param {Object} change - Change to find similar results for
   * @param {string} cacheType - Cache type to search
   * @param {Object} context - Analysis context
   * @returns {Object|null} Similar cached result or null
   */
  findSimilar(change, cacheType, context = {}) {
    const cache = this.caches[cacheType];
    if (!cache || cache.size === 0) {
      return null;
    }

    const changeText = this._extractTextForSimilarity(change);
    let bestMatch = null;
    let bestSimilarity = 0;

    // Search through cache entries for similar changes
    for (const [cacheKey, entry] of cache.entries()) {
      // Skip expired entries
      if (Date.now() - entry.timestamp > this.config.maxCacheAge) {
        continue;
      }

      // Calculate similarity
      const similarity = this._calculateSimilarity(changeText, entry);
      
      if (similarity > this.config.similarityThreshold && similarity > bestSimilarity) {
        bestMatch = entry;
        bestSimilarity = similarity;
      }
    }

    if (bestMatch) {
      console.log(`Found similar cached result with ${(bestSimilarity * 100).toFixed(1)}% similarity`);
      this.stats.hits++;
      this.stats.totalSavings += bestMatch.estimatedCost || 0;
      
      // Update access statistics
      bestMatch.lastAccessed = Date.now();
      bestMatch.accessCount++;
      
      return bestMatch.result;
    }

    this.stats.misses++;
    return null;
  }

  /**
   * Cache user impact analysis result
   * @param {Array} changes - Changes that were analyzed
   * @param {Object} result - Analysis result
   * @param {Object} metadata - Analysis metadata
   */
  cacheUserImpactAnalysis(changes, result, metadata = {}) {
    if (!this.config.enableUserImpactCache) return;

    const cacheKey = this.generateCacheKey(changes, 'userImpact', metadata);
    this.set(cacheKey, 'userImpact', result, metadata);
  }

  /**
   * Get cached user impact analysis
   * @param {Array} changes - Changes to analyze
   * @param {Object} context - Analysis context
   * @returns {Object|null} Cached result or null
   */
  getCachedUserImpactAnalysis(changes, context = {}) {
    if (!this.config.enableUserImpactCache) return null;

    const cacheKey = this.generateCacheKey(changes, 'userImpact', context);
    return this.get(cacheKey, 'userImpact');
  }

  /**
   * Cache categorization result
   * @param {Array} changes - Changes that were categorized
   * @param {Object} result - Categorization result
   * @param {Object} metadata - Analysis metadata
   */
  cacheCategorization(changes, result, metadata = {}) {
    if (!this.config.enableCategorizationCache) return;

    const cacheKey = this.generateCacheKey(changes, 'categorization', metadata);
    this.set(cacheKey, 'categorization', result, metadata);
  }

  /**
   * Get cached categorization
   * @param {Array} changes - Changes to categorize
   * @param {Object} context - Analysis context
   * @returns {Object|null} Cached result or null
   */
  getCachedCategorization(changes, context = {}) {
    if (!this.config.enableCategorizationCache) return null;

    const cacheKey = this.generateCacheKey(changes, 'categorization', context);
    return this.get(cacheKey, 'categorization');
  }

  /**
   * Cache translation result
   * @param {Array} changes - Changes that were translated
   * @param {Object} result - Translation result
   * @param {Object} metadata - Analysis metadata
   */
  cacheTranslation(changes, result, metadata = {}) {
    if (!this.config.enableTranslationCache) return;

    const cacheKey = this.generateCacheKey(changes, 'translation', metadata);
    this.set(cacheKey, 'translation', result, metadata);
  }

  /**
   * Get cached translation
   * @param {Array} changes - Changes to translate
   * @param {Object} context - Analysis context
   * @returns {Object|null} Cached result or null
   */
  getCachedTranslation(changes, context = {}) {
    if (!this.config.enableTranslationCache) return null;

    const cacheKey = this.generateCacheKey(changes, 'translation', context);
    return this.get(cacheKey, 'translation');
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getStats() {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? (this.stats.hits / totalRequests) * 100 : 0;

    return {
      ...this.stats,
      hitRate: hitRate.toFixed(1) + '%',
      totalRequests,
      cacheSize: {
        userImpact: this.caches.userImpact.size,
        categorization: this.caches.categorization.size,
        translation: this.caches.translation.size,
        analysis: this.caches.analysis.size
      },
      estimatedSavings: `$${this.stats.totalSavings.toFixed(4)}`
    };
  }

  /**
   * Clear all caches
   */
  clear() {
    Object.values(this.caches).forEach(cache => cache.clear());
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalSavings: 0
    };
    console.log('Release notes cache cleared');
  }

  /**
   * Clear expired entries from all caches
   */
  clearExpired() {
    const now = Date.now();
    let totalEvicted = 0;

    Object.entries(this.caches).forEach(([cacheType, cache]) => {
      const initialSize = cache.size;
      
      for (const [key, entry] of cache.entries()) {
        if (now - entry.timestamp > this.config.maxCacheAge) {
          cache.delete(key);
        }
      }
      
      const evicted = initialSize - cache.size;
      totalEvicted += evicted;
      
      if (evicted > 0) {
        console.log(`Evicted ${evicted} expired entries from ${cacheType} cache`);
      }
    });

    this.stats.evictions += totalEvicted;
    return totalEvicted;
  }

  /**
   * Normalize data for consistent caching
   * @param {Object|Array} data - Data to normalize
   * @returns {Object} Normalized data
   * @private
   */
  _normalizeDataForCaching(data) {
    if (Array.isArray(data)) {
      return data.map(item => this._normalizeChangeForCaching(item));
    }
    return this._normalizeChangeForCaching(data);
  }

  /**
   * Normalize a single change for caching
   * @param {Object} change - Change to normalize
   * @returns {Object} Normalized change
   * @private
   */
  _normalizeChangeForCaching(change) {
    // Extract only the fields that affect analysis results
    return {
      title: change.title?.toLowerCase().trim(),
      description: change.description?.toLowerCase().trim(),
      source: change.source,
      sourceType: change.sourceType,
      labels: change.labels?.map(l => l.toLowerCase()).sort(),
      priority: change.priority,
      state: change.state
    };
  }

  /**
   * Extract text for similarity comparison
   * @param {Object} change - Change object
   * @returns {string} Text for similarity comparison
   * @private
   */
  _extractTextForSimilarity(change) {
    const parts = [
      change.title || '',
      change.description || ''
    ].filter(Boolean);
    
    return parts.join(' ').toLowerCase().trim();
  }

  /**
   * Calculate similarity between change text and cached entry
   * @param {string} changeText - Text from current change
   * @param {Object} cacheEntry - Cached entry
   * @returns {number} Similarity score (0-1)
   * @private
   */
  _calculateSimilarity(changeText, cacheEntry) {
    // Simple similarity calculation using Jaccard similarity
    // In a production system, you might want to use more sophisticated algorithms
    
    const words1 = new Set(changeText.split(/\s+/).filter(w => w.length > 2));
    const words2 = new Set(
      (cacheEntry.originalText || '').split(/\s+/).filter(w => w.length > 2)
    );
    
    if (words1.size === 0 && words2.size === 0) return 1;
    if (words1.size === 0 || words2.size === 0) return 0;
    
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  /**
   * Evict entries if cache is too large
   * @param {Map} cache - Cache to check
   * @private
   */
  _evictIfNecessary(cache) {
    if (cache.size < this.config.maxCacheSize) {
      return;
    }

    // Evict least recently used entries
    const entries = Array.from(cache.entries());
    entries.sort((a, b) => a[1].lastAccessed - b[1].lastAccessed);
    
    const toEvict = Math.floor(this.config.maxCacheSize * 0.2); // Evict 20%
    
    for (let i = 0; i < toEvict && i < entries.length; i++) {
      cache.delete(entries[i][0]);
      this.stats.evictions++;
    }
    
    console.log(`Evicted ${toEvict} entries from cache (LRU policy)`);
  }

  /**
   * Start periodic cleanup of expired entries
   * @private
   */
  startCleanupInterval() {
    // Clean up expired entries every hour
    setInterval(() => {
      this.clearExpired();
    }, 60 * 60 * 1000);
  }
}

export default ReleaseNotesCache;