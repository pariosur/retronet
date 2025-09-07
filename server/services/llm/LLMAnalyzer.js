/**
 * LLMAnalyzer - Main LLM analyzer service that orchestrates the complete analysis workflow
 * 
 * This class coordinates data preparation, prompt generation, LLM calling, and response processing
 * with timeout handling and graceful fallback to rule-based analysis.
 */

import { LLMServiceFactory } from './LLMServiceFactory.js';
import { PromptBuilder } from './PromptBuilder.js';
import ResponseParser from './ResponseParser.js';
import DataSanitizer from '../DataSanitizer.js';
import PerformanceMonitor from './PerformanceMonitor.js';
import PerformanceOptimizer from './PerformanceOptimizer.js';
import { LLMErrorHandler, LLMError } from './ErrorHandler.js';
import { ProgressTracker, DEFAULT_LLM_STEPS } from './ProgressTracker.js';
import { TemporalDataProcessor } from './TemporalDataProcessor.js';

export class LLMAnalyzer {
  constructor(config = {}) {
    this.config = {
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      privacyMode: config.privacyMode || false,
      privacyLevel: config.privacyLevel || 'moderate',
      enabled: config.enabled !== false,
      ...config
    };

    this.provider = null;
    this.promptBuilder = null;
    this.dataSanitizer = null;
    
    // Initialize performance monitoring
    this.performanceMonitor = new PerformanceMonitor();
    this.performanceOptimizer = new PerformanceOptimizer(this.performanceMonitor);
    
    // Initialize temporal data processor
    this.temporalProcessor = new TemporalDataProcessor({
      chunkSizeHours: config.chunkSizeHours || 24,
      minChunkSizeHours: config.minChunkSizeHours || 4,
      maxChunkSizeHours: config.maxChunkSizeHours || 72,
      overlapHours: config.overlapHours || 2
    });
    
    // Initialize components if LLM is enabled
    if (this.config.enabled && this.config.provider) {
      this._initializeComponents();
    }
  }

  /**
   * Initialize LLM components
   * @private
   */
  _initializeComponents() {
    try {
      // Create LLM provider with performance monitor
      this.provider = LLMServiceFactory.createProvider(this.config, this.performanceMonitor);
      
      // Create prompt builder with explicit provider/model so logs and limits match actual usage
      this.promptBuilder = new PromptBuilder({
        provider: this.config.provider,
        model: this.config.model,
        maxTokens: this.config.maxTokens || 4000,
        systemPromptTokens: 800,
        reserveTokens: 200,
        safetyMargin: this.config.inputMargin, // user-data safety
        totalHeadroom: this.config.totalHeadroom, // final total headroom
        targetUtilization: this.config.targetUtilization // aim under data budget
      });
      
      // Create data sanitizer for privacy protection
      this.dataSanitizer = new DataSanitizer(this.config.privacyLevel);
      
      console.log(`LLMAnalyzer initialized with ${this.config.provider} provider`);
    } catch (error) {
      console.error('Failed to initialize LLM components:', error.message);
      this.config.enabled = false;
    }
  }

  /**
   * Analyze team data and generate insights using LLM
   * @param {Object} githubData - GitHub activity data
   * @param {Object} linearData - Linear issues data  
   * @param {Object} slackData - Slack messages data
   * @param {Object} dateRange - Analysis date range
   * @param {Object} context - Additional context (team size, repositories, etc.)
   * @param {ProgressTracker} progressTracker - Optional progress tracker
   * @returns {Promise<Object>} LLM-generated insights or null if failed
   */
  async analyzeTeamData(githubData, linearData, slackData, dateRange, context = {}, progressTracker = null) {
    // Check if LLM analysis is enabled and configured
    if (!this.config.enabled || !this.provider) {
      console.log('LLM analysis disabled or not configured, skipping');
      return null;
    }

    try {
      console.log('Starting LLM analysis...');
      const startTime = Date.now();

      // Initialize progress tracking if provided
      if (progressTracker) {
        progressTracker.startStep(0, { 
          githubItems: githubData ? (githubData.commits?.length || 0) + (githubData.pullRequests?.length || 0) : 0,
          linearItems: Array.isArray(linearData) ? linearData.length : (linearData ? 1 : 0),
          slackItems: Array.isArray(slackData) ? slackData.length : (slackData ? 1 : 0)
        });
      }

      // Step 1: Prepare and sanitize data
      const teamData = this._prepareTeamData(githubData, linearData, slackData);
      
      if (progressTracker) {
        progressTracker.updateStepProgress(0, 0.5, 'Data collected, sanitizing...');
      }
      
      const sanitizedData = this._sanitizeData(teamData);
      
      if (progressTracker) {
        progressTracker.completeStep(0, { 
          dataSize: JSON.stringify(sanitizedData).length,
          sanitized: sanitizedData !== teamData
        });
        progressTracker.startStep(1);
      }
      
      // Step 2: Calculate data characteristics for optimization
      const dataSize = JSON.stringify(sanitizedData).length;
      const dataCharacteristics = {
        dataSize,
        complexity: this._assessDataComplexity(sanitizedData),
        prioritizeCost: context.prioritizeCost || false,
        prioritizeSpeed: context.prioritizeSpeed || false,
        prioritizeQuality: context.prioritizeQuality || false
      };
      
      if (progressTracker) {
        progressTracker.updateStepProgress(1, 0.3, 'Analyzing data characteristics...');
      }
      
      // Step 3: Get optimization recommendations
      const modelRecommendation = this.performanceOptimizer.selectOptimalModel(dataCharacteristics);
      // Log only the model actually configured for this run to reduce noise
      console.log(`Using model: ${this.config.provider}/${this.config.model} (${modelRecommendation.reason})`);
      
      if (progressTracker) {
        progressTracker.updateStepProgress(1, 0.6, 'Generating optimized prompt...');
      }
      
      // Step 4: Decide analysis mode (direct vs progressive)
      const analysisContext = {
        dateRange,
        teamSize: context.teamSize,
        repositories: context.repositories || [],
        channels: context.channels || [],
        ...context
      };
      const directEstimated = this.provider.estimateTokenCount(
        JSON.stringify(sanitizedData).slice(0, 2_000_000) // guard
      );
      const progressiveThreshold = 150000; // tokens (tighter to avoid provider caps)
      const useProgressive = directEstimated > progressiveThreshold;

      let llmResponse;
      let promptOptimization = { optimized: false };
      let finalPrompt = null;
      if (useProgressive) {
        console.log(`Using progressive analysis (estimated ${directEstimated} tokens > ${progressiveThreshold})`);
        if (progressTracker) progressTracker.updateStepProgress(1, 0.7, 'Running progressive chunk summaries...');
        llmResponse = await this._analyzeTeamDataProgressive(sanitizedData, analysisContext, progressTracker);
      } else {
        // Generate optimized prompt and call LLM once
        let prompt = this.promptBuilder.generateRetroPrompt(sanitizedData, analysisContext);
        finalPrompt = prompt;
        const estimatedTokens = this.provider.estimateTokenCount(prompt.system + prompt.user);
        promptOptimization = this.performanceOptimizer.optimizePromptSize(
          prompt.system + prompt.user,
          this.config.provider,
          this.config.model,
          estimatedTokens
        );
        if (promptOptimization.optimized) {
          console.log(`Prompt optimized: ${promptOptimization.reason}`);
          const parts = promptOptimization.prompt.split('\n\nUser Data:\n');
          prompt = {
            system: parts[0],
            user: parts[1] || '',
            metadata: {
              ...prompt.metadata,
              optimized: true,
              originalTokens: promptOptimization.originalTokens,
              optimizedTokens: promptOptimization.optimizedTokens
            }
          };
        }
        if (!this.promptBuilder.validatePromptSize(prompt)) {
          console.warn('Prompt exceeds token limits, analysis may be truncated');
        }
        if (progressTracker) {
          progressTracker.completeStep(1, {
            promptTokens: this.provider.estimateTokenCount(prompt.system + prompt.user),
            optimized: !!promptOptimization.optimized
          });
          progressTracker.startStep(2, {
            provider: this.config.provider,
            model: this.provider.getModel()
          });
        }
        llmResponse = await this._callLLMWithRetry(sanitizedData, analysisContext, progressTracker);
      }
      
      if (progressTracker) {
        progressTracker.completeStep(2, {
          responseLength: llmResponse?.length || 0
        });
        progressTracker.startStep(3);
      }

      // Step 7: Parse and validate response
      const insights = this._parseResponse(llmResponse);
      
      if (progressTracker) {
        progressTracker.completeStep(3, {
          wentWell: insights.wentWell.length,
          didntGoWell: insights.didntGoWell.length,
          actionItems: insights.actionItems.length
        });
        progressTracker.startStep(4);
      }
      
      const duration = Date.now() - startTime;
      console.log(`LLM analysis completed in ${duration}ms`);
      
      // Add metadata to insights including performance data
      const result = this._addAnalysisMetadata(insights, {
        provider: this.config.provider,
        model: this.provider.getModel(),
        duration,
        dataSize,
        modelRecommendation,
        promptOptimization: promptOptimization.optimized ? promptOptimization : null,
        tokenUsage: finalPrompt ? this.promptBuilder.getTokenUsage(finalPrompt) : null,
        sanitized: sanitizedData !== teamData
      });

      if (progressTracker) {
        progressTracker.completeStep(4, {
          totalInsights: result.wentWell.length + result.didntGoWell.length + result.actionItems.length
        });
      }

      return result;

    } catch (error) {
      console.error('LLM analysis failed:', error.message);
      
      // Create structured error
      const llmError = LLMErrorHandler.createError(error, 'analyzeTeamData');
      
      if (progressTracker) {
        progressTracker.fail(llmError);
      }
      
      // Check if we should fallback or throw
      if (LLMErrorHandler.shouldFallback(llmError)) {
        console.log('Falling back to rule-based analysis due to:', llmError.message);
        return null;
      }
      
      // Re-throw for recoverable errors that should be retried
      throw llmError;
    }
  }

  // Temporal progressive analysis: organize by time, chunk chronologically, then aggregate
  async _analyzeTeamDataProgressive(teamData, analysisContext, progressTracker = null) {
    console.log('Starting temporal progressive analysis...');
    
    if (progressTracker) {
      progressTracker.updateStepProgress(1, 0.1, 'Processing temporal data organization...');
    }
    
    // Step 1: Process data temporally
    const temporalData = this.temporalProcessor.processTeamData(teamData, analysisContext.dateRange);
    console.log(`Created ${temporalData.chunks.length} temporal chunks from ${temporalData.totalEvents} events`);
    
    if (progressTracker) {
      progressTracker.updateStepProgress(1, 0.3, `Organized ${temporalData.totalEvents} events into ${temporalData.chunks.length} temporal chunks`);
    }
    
    // Step 2: Analyze each temporal chunk
    const chunkInsights = [];
    const totalChunks = temporalData.chunks.length;
    
    for (let i = 0; i < totalChunks; i++) {
      const chunk = temporalData.chunks[i];
      
      if (progressTracker) {
        const progress = 0.3 + (0.6 * (i / totalChunks));
        progressTracker.updateStepProgress(1, progress, `Analyzing temporal chunk ${i + 1}/${totalChunks} (${chunk.summary.timeRange})`);
      }
      
      try {
        // Create focused context for this time period
        const chunkContext = {
          ...analysisContext,
          temporalChunk: {
            id: chunk.id,
            timeRange: chunk.summary.timeRange,
            eventCount: chunk.eventCount,
            patterns: chunk.patterns,
            activityMetrics: chunk.activityMetrics
          }
        };
        
        // Convert chunk events back to structured data for LLM
        const chunkData = this._convertChunkToStructuredData(chunk);
        
        // Generate insights for this temporal chunk
        const chunkInsight = await this.provider.generateChunkSummary(chunkData, chunkContext);
        
        chunkInsights.push({
          chunkId: chunk.id,
          timeRange: chunk.summary.timeRange,
          eventCount: chunk.eventCount,
          insight: chunkInsight,
          patterns: chunk.patterns,
          activityMetrics: chunk.activityMetrics
        });
        
        console.log(`Completed analysis for chunk ${i + 1}/${totalChunks}: ${chunk.eventCount} events`);
        
      } catch (error) {
        console.warn(`Failed to analyze chunk ${i + 1}:`, error.message);
        // Continue with other chunks even if one fails
        chunkInsights.push({
          chunkId: chunk.id,
          timeRange: chunk.summary.timeRange,
          eventCount: chunk.eventCount,
          insight: { summary: `Analysis failed: ${error.message}` },
          error: error.message
        });
      }
    }
    
    if (progressTracker) {
      progressTracker.updateStepProgress(1, 0.9, 'Aggregating temporal insights...');
      progressTracker.startStep(2, { phase: 'temporal-aggregation', chunks: chunkInsights.length });
    }
    
    // Step 3: Aggregate temporal insights into final analysis
    const aggregatedData = this._buildTemporalAggregation(chunkInsights, temporalData);
    
    // Step 4: Generate final comprehensive insights
    const finalInsights = await this._callLLMWithRetry(aggregatedData, {
      ...analysisContext,
      analysisType: 'temporal_aggregation',
      totalChunks: chunkInsights.length,
      temporalMetadata: temporalData.processingMetadata
    }, progressTracker);
    
    return finalInsights;
  }

  /**
   * Convert temporal chunk back to structured data format for LLM analysis
   * @private
   */
  _convertChunkToStructuredData(chunk) {
    const structuredData = {
      timeRange: {
        start: chunk.startTime.toISOString(),
        end: chunk.endTime.toISOString(),
        duration: chunk.duration
      },
      events: chunk.events,
      summary: chunk.summary,
      patterns: chunk.patterns,
      activityMetrics: chunk.activityMetrics
    };

    // Group events by source for easier LLM processing
    const eventsBySource = chunk.eventsBySource;
    
    if (eventsBySource.github) {
      structuredData.github = {
        commits: eventsBySource.github.filter(e => e.type === 'github_commit').map(e => e.data),
        pullRequests: eventsBySource.github.filter(e => e.type.startsWith('github_pr')).map(e => e.data)
      };
    }
    
    if (eventsBySource.linear) {
      structuredData.linear = {
        issues: eventsBySource.linear.map(e => e.data)
      };
    }
    
    if (eventsBySource.slack) {
      structuredData.slack = {
        messages: eventsBySource.slack.map(e => e.data)
      };
    }

    return structuredData;
  }

  /**
   * Build aggregated data from temporal chunk insights
   * @private
   */
  _buildTemporalAggregation(chunkInsights, temporalData) {
    // Create a comprehensive summary of all temporal insights
    const aggregation = {
      analysisType: 'temporal_progressive',
      totalTimeRange: {
        start: temporalData.chunks[0]?.startTime?.toISOString(),
        end: temporalData.chunks[temporalData.chunks.length - 1]?.endTime?.toISOString()
      },
      totalEvents: temporalData.totalEvents,
      totalChunks: chunkInsights.length,
      
      // Aggregate insights from all chunks
      chunkSummaries: chunkInsights.map(chunk => ({
        timeRange: chunk.timeRange,
        eventCount: chunk.eventCount,
        insight: typeof chunk.insight === 'object' ? chunk.insight.summary : chunk.insight,
        patterns: chunk.patterns,
        activityMetrics: chunk.activityMetrics,
        error: chunk.error
      })),
      
      // Overall patterns across all chunks
      overallPatterns: this._aggregatePatterns(chunkInsights),
      
      // Activity trends over time
      activityTrends: this._calculateActivityTrends(chunkInsights),
      
      // Key correlations and insights
      crossChunkCorrelations: this._findCrossChunkCorrelations(chunkInsights)
    };

    // Trim if too large
    let aggregationStr = JSON.stringify(aggregation);
    const maxAggregationChars = 300_000; // ~75k-100k tokens
    if (aggregationStr.length > maxAggregationChars) {
      console.warn(`Temporal aggregation too large (${aggregationStr.length} chars), trimming...`);
      
      // Prioritize recent chunks and key insights (keep more for comprehensive analysis)
      aggregation.chunkSummaries = aggregation.chunkSummaries.slice(-20); // Keep last 20 chunks
      aggregationStr = JSON.stringify(aggregation);
      
      if (aggregationStr.length > maxAggregationChars) {
        aggregationStr = aggregationStr.slice(0, maxAggregationChars - 3) + '...';
        try { 
          return JSON.parse(aggregationStr); 
        } catch { 
          return aggregation; // Return original if parsing fails
        }
      }
    }

    return aggregation;
  }

  /**
   * Aggregate patterns across all chunks
   * @private
   */
  _aggregatePatterns(chunkInsights) {
    const aggregated = {
      totalCodeReviews: 0,
      totalIssueResolutions: 0,
      totalTeamDiscussions: 0,
      totalDeployments: 0,
      workingHoursDistribution: { morning: 0, afternoon: 0, evening: 0, night: 0 },
      commonCorrelations: []
    };

    chunkInsights.forEach(chunk => {
      if (chunk.patterns) {
        if (chunk.patterns.hasCodeReview) aggregated.totalCodeReviews++;
        if (chunk.patterns.hasIssueResolution) aggregated.totalIssueResolutions++;
        if (chunk.patterns.hasTeamDiscussion) aggregated.totalTeamDiscussions++;
        if (chunk.patterns.hasDeploymentActivity) aggregated.totalDeployments++;
        
        // Aggregate working hours
        Object.keys(aggregated.workingHoursDistribution).forEach(period => {
          aggregated.workingHoursDistribution[period] += chunk.patterns.workingHours?.[period] || 0;
        });
      }
    });

    return aggregated;
  }

  /**
   * Calculate activity trends over time
   * @private
   */
  _calculateActivityTrends(chunkInsights) {
    const trends = {
      eventCountTrend: [],
      userEngagementTrend: [],
      activityTypeTrends: {
        code: [],
        project: [],
        communication: []
      }
    };

    chunkInsights.forEach((chunk, index) => {
      trends.eventCountTrend.push({
        chunkIndex: index,
        timeRange: chunk.timeRange,
        eventCount: chunk.eventCount
      });

      if (chunk.activityMetrics) {
        trends.userEngagementTrend.push({
          chunkIndex: index,
          timeRange: chunk.timeRange,
          uniqueUsers: chunk.activityMetrics.uniqueUsers
        });

        trends.activityTypeTrends.code.push(chunk.activityMetrics.codeActivity || 0);
        trends.activityTypeTrends.project.push(chunk.activityMetrics.projectActivity || 0);
        trends.activityTypeTrends.communication.push(chunk.activityMetrics.communicationActivity || 0);
      }
    });

    return trends;
  }

  /**
   * Find correlations across chunks
   * @private
   */
  _findCrossChunkCorrelations(chunkInsights) {
    const correlations = [];
    
    // Look for patterns that span multiple chunks
    for (let i = 0; i < chunkInsights.length - 1; i++) {
      const currentChunk = chunkInsights[i];
      const nextChunk = chunkInsights[i + 1];
      
      // Check for activity spikes or drops
      if (currentChunk.eventCount && nextChunk.eventCount) {
        const changeRatio = nextChunk.eventCount / currentChunk.eventCount;
        if (changeRatio > 2) {
          correlations.push({
            type: 'activity_spike',
            fromChunk: currentChunk.timeRange,
            toChunk: nextChunk.timeRange,
            description: `Activity increased ${Math.round(changeRatio * 100)}% from ${currentChunk.eventCount} to ${nextChunk.eventCount} events`
          });
        } else if (changeRatio < 0.5) {
          correlations.push({
            type: 'activity_drop',
            fromChunk: currentChunk.timeRange,
            toChunk: nextChunk.timeRange,
            description: `Activity decreased ${Math.round((1 - changeRatio) * 100)}% from ${currentChunk.eventCount} to ${nextChunk.eventCount} events`
          });
        }
      }
    }

    return correlations.slice(0, 5); // Limit to top 5 correlations
  }

  // Legacy methods for backward compatibility
  _chunkArray(arr, size) {
    if (!Array.isArray(arr) || size <= 0) return [];
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  _buildSyntheticDataFromSummaries(summaries) {
    const take = (list) => list.filter(Boolean).map(s => s?.summary || s?.text || s).slice(0, 100);
    return {
      github: { summaries: take(summaries.github) },
      linear: { summaries: take(summaries.linear) },
      slack: { summaries: take(summaries.slack) }
    };
  }

  // Trim long text fields in chunks to reduce prompt size
  _trimChunkDataFields(data) {
    const maxLen = 300;
    const clone = JSON.parse(JSON.stringify(data));
    if (clone.github) {
      if (Array.isArray(clone.github.commits)) {
        clone.github.commits = clone.github.commits.map(c => ({
          ...c,
          message: c?.message && String(c.message).length > maxLen ? String(c.message).slice(0, maxLen) + '…' : c?.message,
          title: c?.title && String(c.title).length > maxLen ? String(c.title).slice(0, maxLen) + '…' : c?.title
        }));
      }
      if (Array.isArray(clone.github.pullRequests)) {
        clone.github.pullRequests = clone.github.pullRequests.map(pr => ({
          ...pr,
          title: pr?.title && String(pr.title).length > maxLen ? String(pr.title).slice(0, maxLen) + '…' : pr?.title,
          body: pr?.body && String(pr.body).length > maxLen ? String(pr.body).slice(0, maxLen) + '…' : pr?.body,
          description: pr?.description && String(pr.description).length > maxLen ? String(pr.description).slice(0, maxLen) + '…' : pr?.description
        }));
      }
    }
    if (clone.linear) {
      if (Array.isArray(clone.linear.issues)) {
        clone.linear.issues = clone.linear.issues.map(issue => ({
          ...issue,
          title: issue?.title && String(issue.title).length > maxLen ? String(issue.title).slice(0, maxLen) + '…' : issue?.title,
          description: issue?.description && String(issue.description).length > maxLen ? String(issue.description).slice(0, maxLen) + '…' : issue?.description
        }));
      }
    }
    if (clone.slack) {
      if (Array.isArray(clone.slack.messages)) {
        clone.slack.messages = clone.slack.messages.map(m => ({
          ...m,
          text: m?.text && String(m.text).length > maxLen ? String(m.text).slice(0, maxLen) + '…' : m?.text
        }));
      }
    }
    return clone;
  }

  /**
   * Prepare team data for LLM analysis
   * @private
   */
  _prepareTeamData(githubData, linearData, slackData) {
    const teamData = {};
    
    // Add GitHub data if available
    if (githubData && (githubData.commits?.length > 0 || githubData.pullRequests?.length > 0)) {
      teamData.github = {
        commits: githubData.commits || [],
        pullRequests: githubData.pullRequests || []
      };
    }
    
    // Add Linear data if available
    if (linearData && linearData.length > 0) {
      teamData.linear = {
        issues: Array.isArray(linearData) ? linearData : [linearData]
      };
    }
    
    // Add Slack data if available
    if (slackData && slackData.length > 0) {
      teamData.slack = {
        messages: Array.isArray(slackData) ? slackData : [slackData]
      };
    }
    
    return teamData;
  }

  /**
   * Sanitize data for privacy protection
   * @private
   */
  _sanitizeData(teamData) {
    if (!this.dataSanitizer || this.config.privacyLevel === 'none') {
      return teamData;
    }
    
    try {
      const sanitized = this.dataSanitizer.sanitizeTeamData(teamData);
      
      // Validate sanitization
      const validation = this.dataSanitizer.validateSanitization(sanitized);
      if (!validation.isClean) {
        console.warn('Data sanitization incomplete:', validation.violations);
      }
      
      return sanitized;
    } catch (error) {
      console.error('Data sanitization failed:', error.message);
      // Return original data if sanitization fails
      return teamData;
    }
  }

  /**
   * Call LLM with retry logic and timeout handling
   * @private
   */
  async _callLLMWithRetry(teamData, context, progressTracker = null) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        console.log(`LLM call attempt ${attempt}/${this.config.retryAttempts}`);
        
        if (progressTracker) {
          progressTracker.updateStepProgress(2, 0.1 + (attempt - 1) * 0.3, 
            `Calling AI service (attempt ${attempt}/${this.config.retryAttempts})...`);
        }
        
        // Create timeout promise
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('LLM request timeout')), this.config.timeout);
        });
        
        // Race between LLM call and timeout
        const llmPromise = this.provider.generateInsights(teamData, context);
        const response = await Promise.race([llmPromise, timeoutPromise]);
        
        if (!response) {
          throw new Error('Empty response from LLM provider');
        }
        
        if (progressTracker) {
          progressTracker.updateStepProgress(2, 0.9, 'AI analysis completed, processing response...');
        }
        
        return response;
        
      } catch (error) {
        lastError = error;
        console.warn(`LLM call attempt ${attempt} failed:`, error.message);
        
        // Create structured error for better handling
        const llmError = LLMErrorHandler.createError(error, `callLLM_attempt_${attempt}`);
        
        // Don't retry on certain errors
        if (!llmError.recoverable || this._isNonRetryableError(error)) {
          break;
        }
        
        // Wait before retry (exponential backoff)
        if (attempt < this.config.retryAttempts) {
          const delay = this.config.retryDelay * Math.pow(2, attempt - 1);
          console.log(`Retrying in ${delay}ms...`);
          
          if (progressTracker) {
            progressTracker.updateStepProgress(2, 0.1 + (attempt - 1) * 0.3, 
              `Retrying in ${Math.round(delay/1000)}s due to: ${llmError.message}`);
          }
          
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    throw lastError || new Error('LLM analysis failed after all retry attempts');
  }

  /**
   * Check if error should not be retried
   * @private
   */
  _isNonRetryableError(error) {
    const message = error.message.toLowerCase();
    
    // Don't retry on authentication, configuration, or validation errors
    return message.includes('unauthorized') ||
           message.includes('invalid api key') ||
           message.includes('configuration') ||
           message.includes('validation') ||
           message.includes('not found');
  }

  /**
   * Parse LLM response into structured insights
   * @private
   */
  _parseResponse(response) {
    try {
      let insights;
      
      // Check if response is already structured (from provider's internal parsing)
      if (response && typeof response === 'object' && 
          (response.wentWell || response.didntGoWell || response.actionItems)) {
        insights = response;
      } else {
        // Response is raw text, use ResponseParser
        insights = ResponseParser.parseResponse(response, this.config.provider);
      }
      
      // Validate insights structure
      if (!insights || typeof insights !== 'object') {
        throw new Error('Invalid insights structure from parser');
      }
      
      // Ensure all required categories exist
      const validatedInsights = {
        wentWell: Array.isArray(insights.wentWell) ? insights.wentWell : [],
        didntGoWell: Array.isArray(insights.didntGoWell) ? insights.didntGoWell : [],
        actionItems: Array.isArray(insights.actionItems) ? insights.actionItems : []
      };
      
      // Log parsing results
      console.log('LLM insights parsed:', {
        wentWell: validatedInsights.wentWell.length,
        didntGoWell: validatedInsights.didntGoWell.length,
        actionItems: validatedInsights.actionItems.length
      });
      
      return validatedInsights;
      
    } catch (error) {
      console.error('Failed to parse LLM response:', error.message);
      throw new Error(`Response parsing failed: ${error.message}`);
    }
  }

  /**
   * Add analysis metadata to insights
   * @private
   */
  _addAnalysisMetadata(insights, metadata) {
    const addMetadataToItems = (items) => {
      return items.map(item => ({
        ...item,
        source: 'ai',
        llmProvider: metadata.provider,
        llmModel: metadata.model,
        confidence: item.confidence || 0.8,
        reasoning: item.reasoning || 'Generated by LLM analysis',
        metadata: {
          analysisTime: metadata.duration,
          tokenUsage: metadata.tokenUsage,
          dataSanitized: metadata.sanitized
        }
      }));
    };

    return {
      wentWell: addMetadataToItems(insights.wentWell),
      didntGoWell: addMetadataToItems(insights.didntGoWell),
      actionItems: addMetadataToItems(insights.actionItems),
      analysisMetadata: {
        provider: metadata.provider,
        model: metadata.model,
        duration: metadata.duration,
        tokenUsage: metadata.tokenUsage,
        dataSanitized: metadata.sanitized,
        generatedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Test LLM configuration and connectivity
   * @returns {Promise<Object>} Test result with success status and details
   */
  async testConfiguration() {
    if (!this.config.enabled) {
      return {
        success: false,
        message: 'LLM analysis is disabled',
        provider: this.config.provider || 'none'
      };
    }

    if (!this.provider) {
      return {
        success: false,
        message: 'LLM provider not initialized',
        provider: this.config.provider || 'none'
      };
    }

    try {
      // Test provider connectivity
      const isConnected = await this.provider.validateConnection();
      
      if (!isConnected) {
        return {
          success: false,
          message: 'LLM provider connection failed',
          provider: this.config.provider,
          model: this.provider.getModel()
        };
      }

      // Test with minimal data
      const testData = {
        github: { commits: [], pullRequests: [] },
        linear: { issues: [] },
        slack: { messages: [] }
      };
      
      const testContext = {
        dateRange: { start: '2024-01-01', end: '2024-01-02' },
        teamSize: 1
      };

      const response = await this._callLLMWithRetry(testData, testContext);
      
      // Check if response has expected structure
      if (response && typeof response === 'object' && 
          (response.wentWell || response.didntGoWell || response.actionItems)) {
        return {
          success: true,
          message: 'LLM configuration test successful',
          provider: this.config.provider,
          model: this.provider.getModel()
        };
      }

      return {
        success: true,
        message: 'LLM connection successful',
        provider: this.config.provider,
        model: this.provider.getModel()
      };

    } catch (error) {
      return {
        success: false,
        message: `LLM test failed: ${error.message}`,
        provider: this.config.provider,
        model: this.provider?.getModel(),
        error: error.message
      };
    }
  }

  /**
   * Get current configuration status
   * @returns {Object} Configuration status and details
   */
  getStatus() {
    return {
      enabled: this.config.enabled,
      provider: this.config.provider,
      model: this.provider?.getModel(),
      privacyLevel: this.config.privacyLevel,
      timeout: this.config.timeout,
      initialized: !!this.provider,
      components: {
        provider: !!this.provider,
        promptBuilder: !!this.promptBuilder,
        dataSanitizer: !!this.dataSanitizer
      }
    };
  }

  /**
   * Update configuration and reinitialize components
   * @param {Object} newConfig - New configuration options
   */
  updateConfiguration(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    if (this.config.enabled && this.config.provider) {
      this._initializeComponents();
    } else {
      this.provider = null;
      this.promptBuilder = null;
      this.dataSanitizer = null;
    }
  }

  /**
   * Create LLMAnalyzer from environment variables
   * @param {Object} env - Environment variables
   * @returns {LLMAnalyzer} Configured analyzer instance
   */
  static fromEnvironment(env) {
    const config = LLMServiceFactory.createConfigFromEnv(env);
    
    if (!config) {
      // Return disabled analyzer if no LLM configuration found
      return new LLMAnalyzer({ enabled: false });
    }

    return new LLMAnalyzer(config);
  }

  /**
   * Create LLMAnalyzer with custom configuration
   * @param {Object} config - Custom configuration
   * @returns {LLMAnalyzer} Configured analyzer instance
   */
  static withConfig(config) {
    return new LLMAnalyzer(config);
  }

  /**
   * Assess data complexity for optimization decisions
   * @private
   */
  _assessDataComplexity(teamData) {
    let complexity = 'low';
    
    const dataStr = JSON.stringify(teamData);
    const dataSize = dataStr.length;
    
    // Count different data types
    const hasGitHub = teamData.github && (teamData.github.commits?.length > 0 || teamData.github.pullRequests?.length > 0);
    const hasLinear = teamData.linear && teamData.linear.issues?.length > 0;
    const hasSlack = teamData.slack && teamData.slack.messages?.length > 0;
    
    const dataSourceCount = [hasGitHub, hasLinear, hasSlack].filter(Boolean).length;
    
    // Assess complexity based on size and data source diversity
    if (dataSize > 50000 || dataSourceCount >= 3) {
      complexity = 'high';
    } else if (dataSize > 20000 || dataSourceCount >= 2) {
      complexity = 'medium';
    }
    
    return complexity;
  }

  /**
   * Get performance metrics from the monitor
   * @returns {Object} Current performance metrics
   */
  getPerformanceMetrics() {
    return this.performanceMonitor.getMetrics();
  }

  /**
   * Get optimization recommendations
   * @param {number} dataVolume - Optional data volume for context
   * @returns {Object} Optimization recommendations
   */
  getOptimizationRecommendations(dataVolume = 0) {
    return this.performanceOptimizer.getOptimizationRecommendations(dataVolume);
  }

  /**
   * Reset performance metrics (useful for testing)
   */
  resetPerformanceMetrics() {
    this.performanceMonitor.reset();
  }

  /**
   * Clean up old performance data
   * @param {number} maxAge - Maximum age in milliseconds
   */
  cleanupPerformanceData(maxAge = 24 * 60 * 60 * 1000) {
    this.performanceMonitor.cleanupOldRequests(maxAge);
  }

  /**
   * Update optimization thresholds
   * @param {Object} thresholds - New threshold values
   */
  updateOptimizationThresholds(thresholds) {
    this.performanceOptimizer.updateThresholds(thresholds);
  }
}