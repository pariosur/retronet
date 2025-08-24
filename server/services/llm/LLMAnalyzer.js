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
      
      // Create prompt builder with token limits from provider config
      this.promptBuilder = new PromptBuilder({
        maxTokens: this.config.maxTokens || 4000,
        systemPromptTokens: 800,
        reserveTokens: 200
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
      console.log(`Performance optimizer recommends: ${modelRecommendation.provider}/${modelRecommendation.model} - ${modelRecommendation.reason}`);
      
      if (progressTracker) {
        progressTracker.updateStepProgress(1, 0.6, 'Generating optimized prompt...');
      }
      
      // Step 4: Generate optimized prompt
      const analysisContext = {
        dateRange,
        teamSize: context.teamSize,
        repositories: context.repositories || [],
        channels: context.channels || [],
        ...context
      };
      
      let prompt = this.promptBuilder.generateRetroPrompt(sanitizedData, analysisContext);
      
      // Step 5: Optimize prompt if needed
      const estimatedTokens = this.provider.estimateTokenCount(prompt.system + prompt.user);
      const promptOptimization = this.performanceOptimizer.optimizePromptSize(
        prompt.system + prompt.user,
        this.config.provider,
        this.config.model,
        estimatedTokens
      );
      
      if (promptOptimization.optimized) {
        console.log(`Prompt optimized: ${promptOptimization.reason}`);
        // Split optimized prompt back into system and user parts
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
      
      // Validate prompt size
      if (!this.promptBuilder.validatePromptSize(prompt)) {
        console.warn('Prompt exceeds token limits, analysis may be truncated');
      }

      if (progressTracker) {
        progressTracker.completeStep(1, {
          promptTokens: this.provider.estimateTokenCount(prompt.system + prompt.user),
          optimized: promptOptimization.optimized
        });
        progressTracker.startStep(2, {
          provider: this.config.provider,
          model: this.provider.getModel()
        });
      }

      // Step 6: Call LLM with timeout and retry logic
      const llmResponse = await this._callLLMWithRetry(sanitizedData, analysisContext, progressTracker);
      
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
        tokenUsage: this.promptBuilder.getTokenUsage(prompt),
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