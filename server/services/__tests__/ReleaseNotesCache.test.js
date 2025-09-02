/**
 * Tests for ReleaseNotesCache
 */

import { describe, it, test, expect, beforeEach, afterEach } from 'vitest';
import ReleaseNotesCache from '../ReleaseNotesCache.js';

describe('ReleaseNotesCache', () => {
  let cache;

  beforeEach(() => {
    cache = new ReleaseNotesCache({
      maxCacheSize: 10,
      maxCacheAge: 1000, // 1 second for testing
      similarityThreshold: 0.8
    });
  });

  afterEach(() => {
    cache.clear();
  });

  describe('Cache Key Generation', () => {
    test('should generate consistent cache keys for same data', () => {
      const data = { title: 'Test Change', description: 'Test description' };
      const context = { provider: 'openai', model: 'gpt-3.5-turbo' };
      
      const key1 = cache.generateCacheKey(data, 'userImpact', context);
      const key2 = cache.generateCacheKey(data, 'userImpact', context);
      
      expect(key1).toBe(key2);
    });

    test('should generate different cache keys for different data', () => {
      const data1 = { title: 'Test Change 1', description: 'Test description 1' };
      const data2 = { title: 'Test Change 2', description: 'Test description 2' };
      const context = { provider: 'openai', model: 'gpt-3.5-turbo' };
      
      const key1 = cache.generateCacheKey(data1, 'userImpact', context);
      const key2 = cache.generateCacheKey(data2, 'userImpact', context);
      
      expect(key1).not.toBe(key2);
    });
  });

  describe('Basic Cache Operations', () => {
    test('should store and retrieve cached results', () => {
      const cacheKey = 'test-key';
      const result = { userFacingChanges: ['change1', 'change2'] };
      
      cache.set(cacheKey, 'userImpact', result);
      const retrieved = cache.get(cacheKey, 'userImpact');
      
      expect(retrieved).toEqual(result);
    });

    test('should return null for non-existent cache keys', () => {
      const retrieved = cache.get('non-existent-key', 'userImpact');
      expect(retrieved).toBeNull();
    });

    test('should handle cache expiration', async () => {
      const cacheKey = 'test-key';
      const result = { userFacingChanges: ['change1', 'change2'] };
      
      cache.set(cacheKey, 'userImpact', result);
      
      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const retrieved = cache.get(cacheKey, 'userImpact');
      expect(retrieved).toBeNull();
    });
  });

  describe('User Impact Analysis Caching', () => {
    test('should cache and retrieve user impact analysis', () => {
      const changes = [
        { title: 'Add new feature', description: 'Added user dashboard' },
        { title: 'Fix bug', description: 'Fixed login issue' }
      ];
      const result = { userFacingChanges: changes };
      const metadata = { provider: 'openai', model: 'gpt-3.5-turbo' };
      
      cache.cacheUserImpactAnalysis(changes, result, metadata);
      const retrieved = cache.getCachedUserImpactAnalysis(changes, metadata);
      
      expect(retrieved).toEqual(result);
    });

    test('should return null when cache is disabled', () => {
      const disabledCache = new ReleaseNotesCache({
        enableUserImpactCache: false
      });
      
      const changes = [{ title: 'Test change' }];
      const result = { userFacingChanges: changes };
      
      disabledCache.cacheUserImpactAnalysis(changes, result);
      const retrieved = disabledCache.getCachedUserImpactAnalysis(changes);
      
      expect(retrieved).toBeNull();
    });
  });

  describe('Categorization Caching', () => {
    test('should cache and retrieve categorization results', () => {
      const changes = [
        { title: 'Add feature', category: 'newFeatures' },
        { title: 'Fix bug', category: 'fixes' }
      ];
      const result = {
        newFeatures: [changes[0]],
        improvements: [],
        fixes: [changes[1]]
      };
      const metadata = { provider: 'openai', model: 'gpt-3.5-turbo' };
      
      cache.cacheCategorization(changes, result, metadata);
      const retrieved = cache.getCachedCategorization(changes, metadata);
      
      expect(retrieved).toEqual(result);
    });
  });

  describe('Translation Caching', () => {
    test('should cache and retrieve translation results', () => {
      const changes = {
        newFeatures: [{ title: 'Technical feature', description: 'Complex technical description' }]
      };
      const result = {
        newFeatures: [{ 
          title: 'User-friendly feature', 
          description: 'Simple user description',
          userValue: 'Makes your workflow easier'
        }]
      };
      const metadata = { provider: 'openai', model: 'gpt-3.5-turbo' };
      
      cache.cacheTranslation(changes, result, metadata);
      const retrieved = cache.getCachedTranslation(changes, metadata);
      
      expect(retrieved).toEqual(result);
    });
  });

  describe('Cache Statistics', () => {
    test('should track cache hits and misses', () => {
      const cacheKey = 'test-key';
      const result = { data: 'test' };
      
      // Miss
      cache.get(cacheKey, 'userImpact');
      
      // Set and hit
      cache.set(cacheKey, 'userImpact', result);
      cache.get(cacheKey, 'userImpact');
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.totalRequests).toBe(2);
    });

    test('should calculate hit rate correctly', () => {
      const cacheKey = 'test-key';
      const result = { data: 'test' };
      
      cache.set(cacheKey, 'userImpact', result);
      
      // 2 hits, 1 miss
      cache.get(cacheKey, 'userImpact');
      cache.get(cacheKey, 'userImpact');
      cache.get('non-existent', 'userImpact');
      
      const stats = cache.getStats();
      expect(stats.hitRate).toBe('66.7%');
    });
  });

  describe('Cache Size Management', () => {
    test('should evict entries when cache is full', () => {
      // Fill cache to capacity
      for (let i = 0; i < 10; i++) {
        cache.set(`key-${i}`, 'userImpact', { data: i });
      }
      
      // Add one more to trigger eviction
      cache.set('key-overflow', 'userImpact', { data: 'overflow' });
      
      const stats = cache.getStats();
      expect(stats.cacheSize.userImpact).toBeLessThanOrEqual(10);
      expect(stats.evictions).toBeGreaterThan(0);
    });
  });

  describe('Cache Cleanup', () => {
    test('should clear expired entries', async () => {
      const cacheKey = 'test-key';
      const result = { data: 'test' };
      
      cache.set(cacheKey, 'userImpact', result);
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      const evicted = cache.clearExpired();
      expect(evicted).toBeGreaterThan(0);
      
      const retrieved = cache.get(cacheKey, 'userImpact');
      expect(retrieved).toBeNull();
    });

    test('should clear all caches', () => {
      cache.set('key1', 'userImpact', { data: 1 });
      cache.set('key2', 'categorization', { data: 2 });
      cache.set('key3', 'translation', { data: 3 });
      
      cache.clear();
      
      const stats = cache.getStats();
      expect(stats.cacheSize.userImpact).toBe(0);
      expect(stats.cacheSize.categorization).toBe(0);
      expect(stats.cacheSize.translation).toBe(0);
    });
  });

  describe('Similarity Matching', () => {
    test('should find similar cached results', () => {
      const originalChange = { 
        title: 'Add user authentication feature',
        description: 'Implement login and registration system'
      };
      const similarChange = {
        title: 'Add user authentication feature', // Exact match for testing
        description: 'Implement login and registration system'
      };
      
      const result = { userFacingChanges: [originalChange] };
      const cacheKey = cache.generateCacheKey(originalChange, 'userImpact', {});
      
      const entry = {
        result,
        timestamp: Date.now(),
        lastAccessed: Date.now(),
        accessCount: 1,
        originalText: 'add user authentication feature implement login and registration system'
      };
      cache.caches.userImpact.set(cacheKey, entry);
      
      const retrieved = cache.findSimilar(similarChange, 'userImpact', {});
      expect(retrieved).toEqual(result);
    });

    test('should not match dissimilar changes', () => {
      const originalChange = { 
        title: 'Add user authentication',
        description: 'Login system'
      };
      const differentChange = {
        title: 'Fix database connection', 
        description: 'Resolve connection timeout'
      };
      
      const result = { userFacingChanges: [originalChange] };
      const cacheKey = cache.generateCacheKey(originalChange, 'userImpact', {});
      
      const entry = {
        result,
        timestamp: Date.now(),
        lastAccessed: Date.now(),
        accessCount: 1,
        originalText: 'Add user authentication Login system'
      };
      cache.caches.userImpact.set(cacheKey, entry);
      
      const retrieved = cache.findSimilar(differentChange, 'userImpact', {});
      expect(retrieved).toBeNull();
    });
  });
});