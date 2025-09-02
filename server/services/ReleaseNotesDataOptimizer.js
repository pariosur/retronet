/**
 * ReleaseNotesDataOptimizer - Optimizes data collection queries for better performance
 * 
 * This service implements query optimization, data filtering, and efficient
 * data collection strategies to improve performance for release notes generation.
 */

class ReleaseNotesDataOptimizer {
  constructor(config = {}) {
    this.config = {
      // Query optimization settings
      maxItemsPerQuery: config.maxItemsPerQuery || 100,
      maxConcurrentQueries: config.maxConcurrentQueries || 3,
      queryTimeout: config.queryTimeout || 30000, // 30 seconds
      
      // Data filtering settings
      enablePreFiltering: config.enablePreFiltering !== false,
      relevanceThreshold: config.relevanceThreshold || 0.3,
      
      // Caching settings
      enableQueryCache: config.enableQueryCache !== false,
      queryCacheTTL: config.queryCacheTTL || 5 * 60 * 1000, // 5 minutes
      
      // Performance settings
      enableParallelQueries: config.enableParallelQueries !== false,
      enableQueryBatching: config.enableQueryBatching !== false,
      
      ...config
    };

    // Query cache
    this.queryCache = new Map();
    
    // Performance metrics
    this.metrics = {
      totalQueries: 0,
      cachedQueries: 0,
      optimizedQueries: 0,
      totalQueryTime: 0,
      dataPointsCollected: 0,
      dataPointsFiltered: 0
    };

    // Start cache cleanup
    this.startCacheCleanup();
  }

  /**
   * Optimize data collection for GitHub
   * @param {Object} githubService - GitHub service instance
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @param {Array} repositories - Repository list
   * @returns {Promise<Object>} Optimized GitHub data
   */
  async optimizeGitHubDataCollection(githubService, startDate, endDate, repositories = []) {
    const startTime = Date.now();
    
    try {
      console.log('Optimizing GitHub data collection...');
      
      // Create optimized query plan
      const queryPlan = this._createGitHubQueryPlan(startDate, endDate, repositories);
      
      // Execute queries with optimization
      const results = await this._executeOptimizedQueries(
        queryPlan,
        (query) => this._executeGitHubQuery(githubService, query)
      );
      
      // Combine and filter results
      const optimizedData = this._combineGitHubResults(results);
      
      // Apply post-processing filters
      const filteredData = this._applyRelevanceFiltering(optimizedData, 'github');
      
      this._updateMetrics(startTime, filteredData, optimizedData);
      
      console.log(`GitHub data collection optimized: ${filteredData.commits?.length || 0} commits, ${filteredData.pullRequests?.length || 0} PRs`);
      
      return filteredData;

    } catch (error) {
      console.error('GitHub data collection optimization failed:', error.message);
      throw error;
    }
  }

  /**
   * Optimize data collection for Linear
   * @param {Object} linearService - Linear service instance
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @param {Array} teamMembers - Team member list
   * @returns {Promise<Object>} Optimized Linear data
   */
  async optimizeLinearDataCollection(linearService, startDate, endDate, teamMembers = []) {
    const startTime = Date.now();
    
    try {
      console.log('Optimizing Linear data collection...');
      
      // Create optimized query plan
      const queryPlan = this._createLinearQueryPlan(startDate, endDate, teamMembers);
      
      // Execute queries with optimization
      const results = await this._executeOptimizedQueries(
        queryPlan,
        (query) => this._executeLinearQuery(linearService, query)
      );
      
      // Combine and filter results
      const optimizedData = this._combineLinearResults(results);
      
      // Apply post-processing filters
      const filteredData = this._applyRelevanceFiltering(optimizedData, 'linear');
      
      this._updateMetrics(startTime, filteredData, optimizedData);
      
      console.log(`Linear data collection optimized: ${filteredData.length || 0} issues`);
      
      return filteredData;

    } catch (error) {
      console.error('Linear data collection optimization failed:', error.message);
      throw error;
    }
  }

  /**
   * Optimize data collection for Slack
   * @param {Object} slackService - Slack service instance
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @param {Array} channels - Channel list
   * @returns {Promise<Object>} Optimized Slack data
   */
  async optimizeSlackDataCollection(slackService, startDate, endDate, channels = []) {
    const startTime = Date.now();
    
    try {
      console.log('Optimizing Slack data collection...');
      
      // Create optimized query plan
      const queryPlan = this._createSlackQueryPlan(startDate, endDate, channels);
      
      // Execute queries with optimization
      const results = await this._executeOptimizedQueries(
        queryPlan,
        (query) => this._executeSlackQuery(slackService, query)
      );
      
      // Combine and filter results
      const optimizedData = this._combineSlackResults(results);
      
      // Apply post-processing filters
      const filteredData = this._applyRelevanceFiltering(optimizedData, 'slack');
      
      this._updateMetrics(startTime, filteredData, optimizedData);
      
      console.log(`Slack data collection optimized: ${filteredData.length || 0} messages`);
      
      return filteredData;

    } catch (error) {
      console.error('Slack data collection optimization failed:', error.message);
      throw error;
    }
  }

  /**
   * Create optimized query plan for GitHub
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @param {Array} repositories - Repository list
   * @returns {Array} Query plan
   * @private
   */
  _createGitHubQueryPlan(startDate, endDate, repositories) {
    const queries = [];
    
    // If no specific repositories, create a general query
    if (!repositories || repositories.length === 0) {
      queries.push({
        type: 'general',
        startDate,
        endDate,
        priority: 1
      });
      return queries;
    }

    // Create repository-specific queries
    for (const repo of repositories) {
      // Commits query
      queries.push({
        type: 'commits',
        repository: repo,
        startDate,
        endDate,
        priority: 1,
        cacheKey: `github_commits_${repo}_${startDate}_${endDate}`
      });

      // Pull requests query
      queries.push({
        type: 'pullRequests',
        repository: repo,
        startDate,
        endDate,
        priority: 2,
        cacheKey: `github_prs_${repo}_${startDate}_${endDate}`
      });
    }

    return queries.sort((a, b) => a.priority - b.priority);
  }

  /**
   * Create optimized query plan for Linear
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @param {Array} teamMembers - Team member list
   * @returns {Array} Query plan
   * @private
   */
  _createLinearQueryPlan(startDate, endDate, teamMembers) {
    const queries = [];
    
    // Create date-based chunks for large date ranges
    const dateChunks = this._createDateChunks(startDate, endDate, 7); // 7-day chunks
    
    for (const chunk of dateChunks) {
      queries.push({
        type: 'issues',
        startDate: chunk.start,
        endDate: chunk.end,
        teamMembers,
        priority: 1,
        cacheKey: `linear_issues_${chunk.start}_${chunk.end}_${teamMembers.join(',')}`
      });
    }

    return queries;
  }

  /**
   * Create optimized query plan for Slack
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @param {Array} channels - Channel list
   * @returns {Array} Query plan
   * @private
   */
  _createSlackQueryPlan(startDate, endDate, channels) {
    const queries = [];
    
    // If no specific channels, create a general query
    if (!channels || channels.length === 0) {
      queries.push({
        type: 'general',
        startDate,
        endDate,
        priority: 1
      });
      return queries;
    }

    // Create channel-specific queries
    for (const channel of channels) {
      queries.push({
        type: 'messages',
        channel,
        startDate,
        endDate,
        priority: 1,
        cacheKey: `slack_messages_${channel}_${startDate}_${endDate}`
      });
    }

    return queries;
  }

  /**
   * Execute optimized queries with caching and parallelization
   * @param {Array} queryPlan - Query plan to execute
   * @param {Function} queryExecutor - Function to execute individual queries
   * @returns {Promise<Array>} Query results
   * @private
   */
  async _executeOptimizedQueries(queryPlan, queryExecutor) {
    const results = [];
    const executing = [];
    let queryIndex = 0;

    while (queryIndex < queryPlan.length || executing.length > 0) {
      // Start new queries up to concurrency limit
      while (executing.length < this.config.maxConcurrentQueries && queryIndex < queryPlan.length) {
        const query = queryPlan[queryIndex];
        
        // Check cache first
        if (query.cacheKey && this.config.enableQueryCache) {
          const cached = this._getCachedQuery(query.cacheKey);
          if (cached) {
            results.push({ query, result: cached, fromCache: true });
            this.metrics.cachedQueries++;
            queryIndex++;
            continue;
          }
        }

        // Execute query
        const queryPromise = this._executeQueryWithTimeout(query, queryExecutor);
        executing.push({ query, promise: queryPromise, startTime: Date.now() });
        queryIndex++;
      }

      // Wait for at least one query to complete
      if (executing.length > 0) {
        const completed = await Promise.race(executing.map(e => e.promise));
        
        // Find and remove completed query
        const completedIndex = executing.findIndex(e => e.promise === completed);
        if (completedIndex !== -1) {
          const completedQuery = executing[completedIndex];
          executing.splice(completedIndex, 1);
          
          try {
            const result = await completed;
            results.push({ 
              query: completedQuery.query, 
              result, 
              fromCache: false,
              executionTime: Date.now() - completedQuery.startTime
            });
            
            // Cache successful results
            if (completedQuery.query.cacheKey && this.config.enableQueryCache) {
              this._cacheQuery(completedQuery.query.cacheKey, result);
            }
            
            this.metrics.totalQueries++;
          } catch (error) {
            console.error(`Query failed:`, error.message);
            results.push({ 
              query: completedQuery.query, 
              error: error.message, 
              fromCache: false 
            });
          }
        }
      }
    }

    return results;
  }

  /**
   * Execute a single query with timeout
   * @param {Object} query - Query to execute
   * @param {Function} queryExecutor - Query executor function
   * @returns {Promise} Query result
   * @private
   */
  async _executeQueryWithTimeout(query, queryExecutor) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Query timeout after ${this.config.queryTimeout}ms`));
      }, this.config.queryTimeout);

      queryExecutor(query)
        .then(result => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Execute GitHub query
   * @param {Object} githubService - GitHub service
   * @param {Object} query - Query to execute
   * @returns {Promise} Query result
   * @private
   */
  async _executeGitHubQuery(githubService, query) {
    switch (query.type) {
      case 'commits':
        return await githubService.getCommits(query.repository, query.startDate, query.endDate);
      case 'pullRequests':
        return await githubService.getPullRequests(query.repository, query.startDate, query.endDate);
      case 'general':
      default:
        return await githubService.getTeamActivity(query.startDate, query.endDate);
    }
  }

  /**
   * Execute Linear query
   * @param {Object} linearService - Linear service
   * @param {Object} query - Query to execute
   * @returns {Promise} Query result
   * @private
   */
  async _executeLinearQuery(linearService, query) {
    return await linearService.getIssuesInDateRange(
      query.startDate, 
      query.endDate, 
      query.teamMembers
    );
  }

  /**
   * Execute Slack query
   * @param {Object} slackService - Slack service
   * @param {Object} query - Query to execute
   * @returns {Promise} Query result
   * @private
   */
  async _executeSlackQuery(slackService, query) {
    if (query.type === 'messages' && query.channel) {
      return await slackService.getChannelMessages(query.channel, query.startDate, query.endDate);
    }
    return await slackService.getTeamChannelMessages(query.startDate, query.endDate);
  }

  /**
   * Combine GitHub query results
   * @param {Array} results - Query results
   * @returns {Object} Combined GitHub data
   * @private
   */
  _combineGitHubResults(results) {
    const combined = {
      commits: [],
      pullRequests: []
    };

    for (const result of results) {
      if (result.error) continue;
      
      const data = result.result;
      if (data.commits) {
        combined.commits.push(...data.commits);
      }
      if (data.pullRequests) {
        combined.pullRequests.push(...data.pullRequests);
      }
    }

    // Remove duplicates
    combined.commits = this._removeDuplicates(combined.commits, 'sha');
    combined.pullRequests = this._removeDuplicates(combined.pullRequests, 'id');

    return combined;
  }

  /**
   * Combine Linear query results
   * @param {Array} results - Query results
   * @returns {Array} Combined Linear data
   * @private
   */
  _combineLinearResults(results) {
    const combined = [];

    for (const result of results) {
      if (result.error) continue;
      
      const data = result.result;
      if (Array.isArray(data)) {
        combined.push(...data);
      }
    }

    // Remove duplicates
    return this._removeDuplicates(combined, 'id');
  }

  /**
   * Combine Slack query results
   * @param {Array} results - Query results
   * @returns {Array} Combined Slack data
   * @private
   */
  _combineSlackResults(results) {
    const combined = [];

    for (const result of results) {
      if (result.error) continue;
      
      const data = result.result;
      if (Array.isArray(data)) {
        combined.push(...data);
      }
    }

    // Remove duplicates
    return this._removeDuplicates(combined, 'ts');
  }

  /**
   * Apply relevance filtering to collected data
   * @param {Object|Array} data - Data to filter
   * @param {string} source - Data source type
   * @returns {Object|Array} Filtered data
   * @private
   */
  _applyRelevanceFiltering(data, source) {
    if (!this.config.enablePreFiltering) {
      return data;
    }

    const originalCount = this._countDataPoints(data);
    let filtered;

    switch (source) {
      case 'github':
        filtered = this._filterGitHubData(data);
        break;
      case 'linear':
        filtered = this._filterLinearData(data);
        break;
      case 'slack':
        filtered = this._filterSlackData(data);
        break;
      default:
        filtered = data;
    }

    const filteredCount = this._countDataPoints(filtered);
    this.metrics.dataPointsCollected += originalCount;
    this.metrics.dataPointsFiltered += (originalCount - filteredCount);

    console.log(`Applied relevance filtering: ${originalCount} -> ${filteredCount} items`);
    
    return filtered;
  }

  /**
   * Filter GitHub data for relevance
   * @param {Object} data - GitHub data
   * @returns {Object} Filtered data
   * @private
   */
  _filterGitHubData(data) {
    const filtered = { ...data };

    // Filter commits
    if (data.commits) {
      filtered.commits = data.commits.filter(commit => {
        const message = commit.commit.message.toLowerCase();
        
        // Filter out merge commits and automated commits
        if (message.startsWith('merge') || 
            message.includes('automated') || 
            message.includes('ci:') ||
            message.includes('build:')) {
          return false;
        }
        
        return true;
      });
    }

    // Filter pull requests
    if (data.pullRequests) {
      filtered.pullRequests = data.pullRequests.filter(pr => {
        const title = pr.title.toLowerCase();
        
        // Filter out draft PRs and automated PRs
        if (pr.draft || 
            title.includes('automated') || 
            title.includes('dependabot') ||
            title.includes('ci:')) {
          return false;
        }
        
        return true;
      });
    }

    return filtered;
  }

  /**
   * Filter Linear data for relevance
   * @param {Array} data - Linear data
   * @returns {Array} Filtered data
   * @private
   */
  _filterLinearData(data) {
    return data.filter(issue => {
      // Filter out issues that are not user-facing
      const title = issue.title.toLowerCase();
      const labels = issue.labels?.nodes?.map(l => l.name.toLowerCase()) || [];
      
      // Skip internal or infrastructure issues
      if (labels.includes('internal') || 
          labels.includes('infrastructure') ||
          labels.includes('tech-debt') ||
          title.includes('refactor')) {
        return false;
      }
      
      return true;
    });
  }

  /**
   * Filter Slack data for relevance
   * @param {Array} data - Slack data
   * @returns {Array} Filtered data
   * @private
   */
  _filterSlackData(data) {
    return data.filter(message => {
      const text = message.text.toLowerCase();
      
      // Keep messages that mention releases, features, or deployments
      const releaseKeywords = ['release', 'deploy', 'ship', 'launch', 'feature', 'update', 'fix'];
      
      return releaseKeywords.some(keyword => text.includes(keyword));
    });
  }

  /**
   * Remove duplicates from array based on key
   * @param {Array} array - Array to deduplicate
   * @param {string} key - Key to use for deduplication
   * @returns {Array} Deduplicated array
   * @private
   */
  _removeDuplicates(array, key) {
    const seen = new Set();
    return array.filter(item => {
      const value = item[key];
      if (seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
  }

  /**
   * Create date chunks for large date ranges
   * @param {string} startDate - Start date
   * @param {string} endDate - End date
   * @param {number} chunkDays - Days per chunk
   * @returns {Array} Date chunks
   * @private
   */
  _createDateChunks(startDate, endDate, chunkDays) {
    const chunks = [];
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    let current = new Date(start);
    
    while (current < end) {
      const chunkEnd = new Date(current);
      chunkEnd.setDate(chunkEnd.getDate() + chunkDays);
      
      if (chunkEnd > end) {
        chunkEnd.setTime(end.getTime());
      }
      
      chunks.push({
        start: current.toISOString().split('T')[0],
        end: chunkEnd.toISOString().split('T')[0]
      });
      
      current = new Date(chunkEnd);
      current.setDate(current.getDate() + 1);
    }
    
    return chunks;
  }

  /**
   * Count data points in data structure
   * @param {Object|Array} data - Data to count
   * @returns {number} Number of data points
   * @private
   */
  _countDataPoints(data) {
    if (Array.isArray(data)) {
      return data.length;
    }
    
    if (typeof data === 'object' && data !== null) {
      return Object.values(data).reduce((sum, value) => {
        if (Array.isArray(value)) {
          return sum + value.length;
        }
        return sum;
      }, 0);
    }
    
    return 0;
  }

  /**
   * Cache query result
   * @param {string} cacheKey - Cache key
   * @param {Object} result - Query result
   * @private
   */
  _cacheQuery(cacheKey, result) {
    this.queryCache.set(cacheKey, {
      result,
      timestamp: Date.now()
    });
  }

  /**
   * Get cached query result
   * @param {string} cacheKey - Cache key
   * @returns {Object|null} Cached result or null
   * @private
   */
  _getCachedQuery(cacheKey) {
    const cached = this.queryCache.get(cacheKey);
    if (!cached) return null;
    
    // Check if cache has expired
    if (Date.now() - cached.timestamp > this.config.queryCacheTTL) {
      this.queryCache.delete(cacheKey);
      return null;
    }
    
    return cached.result;
  }

  /**
   * Update performance metrics
   * @param {number} startTime - Start time
   * @param {Object} filteredData - Filtered data
   * @param {Object} originalData - Original data
   * @private
   */
  _updateMetrics(startTime, filteredData, originalData) {
    const queryTime = Date.now() - startTime;
    this.metrics.totalQueryTime += queryTime;
    this.metrics.optimizedQueries++;
  }

  /**
   * Start cache cleanup interval
   * @private
   */
  startCacheCleanup() {
    setInterval(() => {
      const now = Date.now();
      let cleaned = 0;
      
      for (const [key, value] of this.queryCache.entries()) {
        if (now - value.timestamp > this.config.queryCacheTTL) {
          this.queryCache.delete(key);
          cleaned++;
        }
      }
      
      if (cleaned > 0) {
        console.log(`Cleaned ${cleaned} expired query cache entries`);
      }
    }, this.config.queryCacheTTL);
  }

  /**
   * Get optimization metrics
   * @returns {Object} Optimization metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      averageQueryTime: this.metrics.totalQueries > 0 
        ? this.metrics.totalQueryTime / this.metrics.totalQueries 
        : 0,
      cacheHitRate: this.metrics.totalQueries > 0 
        ? (this.metrics.cachedQueries / this.metrics.totalQueries) * 100 
        : 0,
      filteringEfficiency: this.metrics.dataPointsCollected > 0 
        ? (this.metrics.dataPointsFiltered / this.metrics.dataPointsCollected) * 100 
        : 0,
      cacheSize: this.queryCache.size
    };
  }

  /**
   * Clear all caches and reset metrics
   */
  reset() {
    this.queryCache.clear();
    this.metrics = {
      totalQueries: 0,
      cachedQueries: 0,
      optimizedQueries: 0,
      totalQueryTime: 0,
      dataPointsCollected: 0,
      dataPointsFiltered: 0
    };
  }
}

export default ReleaseNotesDataOptimizer;