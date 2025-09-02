import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import LinearService from './services/linearService.js';
import SlackService from './services/slackService.js';
import GitHubService from './services/githubService.js';
import { LLMAnalyzer, LLMServiceFactory } from './services/llm/index.js';
import { InsightMerger } from './services/InsightMerger.js';
import { ProgressManager, DEFAULT_LLM_STEPS } from './services/llm/ProgressTracker.js';
import { LLMErrorHandler } from './services/llm/ErrorHandler.js';
import { ReleaseNotesProgressManager } from './services/ReleaseNotesProgressTracker.js';
import { ReleaseNotesErrorHandler } from './services/ReleaseNotesErrorHandler.js';
import ExportService from './services/ExportService.js';
import ReleaseNotesService from './services/ReleaseNotesService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize progress managers
const progressManager = new ProgressManager();
const releaseNotesProgressManager = new ReleaseNotesProgressManager();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'Server is running!' });
});

// Test Linear connection
app.get('/api/test-linear', async (req, res) => {
  try {
    if (!process.env.LINEAR_API_KEY) {
      return res.status(400).json({ 
        error: 'LINEAR_API_KEY not configured' 
      });
    }
    
    const linearService = new LinearService(process.env.LINEAR_API_KEY);
    
    // Test with a simple query to get user info
    const query = `
      query {
        viewer {
          id
          name
          email
        }
      }
    `;
    
    const data = await linearService.makeRequest(query);
    res.json({ 
      status: 'Linear connection successful!',
      user: data.viewer 
    });
  } catch (error) {
    console.error('Linear test failed:', error);
    res.status(500).json({ 
      error: 'Linear connection failed: ' + error.message 
    });
  }
});

// Test Slack connection
app.get('/api/test-slack', async (req, res) => {
  try {
    if (!process.env.SLACK_BOT_TOKEN) {
      return res.status(400).json({ 
        error: 'SLACK_BOT_TOKEN not configured' 
      });
    }
    
    const slackService = new SlackService(process.env.SLACK_BOT_TOKEN);
    
    // Test with auth.test endpoint
    const data = await slackService.makeRequest('auth.test');
    res.json({ 
      status: 'Slack connection successful!',
      team: data.team,
      user: data.user
    });
  } catch (error) {
    console.error('Slack test failed:', error);
    res.status(500).json({ 
      error: 'Slack connection failed: ' + error.message 
    });
  }
});

// Test GitHub connection
app.get('/api/test-github', async (req, res) => {
  try {
    if (!process.env.GITHUB_TOKEN) {
      return res.status(400).json({ 
        error: 'GITHUB_TOKEN not configured' 
      });
    }
    
    const githubService = new GitHubService(process.env.GITHUB_TOKEN);
    
    // Test with user endpoint
    const data = await githubService.makeRequest('/user');
    res.json({ 
      status: 'GitHub connection successful!',
      user: data.login,
      name: data.name
    });
  } catch (error) {
    console.error('GitHub test failed:', error);
    res.status(500).json({ 
      error: 'GitHub connection failed: ' + error.message 
    });
  }
});

// Test Release Notes Service
app.get('/api/test-release-notes', async (req, res) => {
  try {
    const releaseNotesService = new ReleaseNotesService();
    const status = releaseNotesService.getServiceStatus();
    
    res.json({
      status: 'Release Notes Service initialized successfully',
      services: status,
      message: 'Ready to generate release notes'
    });
  } catch (error) {
    console.error('Release Notes Service test failed:', error);
    res.status(500).json({
      error: 'Release Notes Service test failed: ' + error.message
    });
  }
});

// Test LLM connection and configuration
app.get('/api/test-llm', async (req, res) => {
  try {
    // Get configuration status first
    const llmAnalyzer = LLMAnalyzer.fromEnvironment(process.env);
    const status = llmAnalyzer.getStatus();
    
    // If LLM is not enabled, return configuration info
    if (!status.enabled) {
      return res.json({
        status: 'LLM analysis is disabled',
        enabled: false,
        configuration: {
          provider: status.provider || 'none',
          configured: false,
          availableProviders: LLMServiceFactory.getAvailableProviders()
        },
        message: 'LLM analysis is disabled. Set LLM_PROVIDER environment variable to enable.'
      });
    }

    // If not properly configured, return configuration error
    if (!status.initialized) {
      return res.status(400).json({
        error: 'LLM not properly configured',
        enabled: status.enabled,
        configuration: {
          provider: status.provider || 'none',
          configured: false,
          availableProviders: LLMServiceFactory.getAvailableProviders(),
          issues: ['Provider not initialized - check API keys and configuration']
        },
        message: 'LLM configuration incomplete. Check environment variables.'
      });
    }

    // Test the configuration
    const result = await llmAnalyzer.testConfiguration();
    
    if (result.success) {
      res.json({
        status: 'LLM connection successful!',
        enabled: true,
        provider: result.provider,
        model: result.model,
        message: result.message,
        configuration: {
          provider: status.provider,
          model: status.model,
          privacyLevel: status.privacyLevel,
          timeout: status.timeout,
          configured: true,
          components: status.components
        },
        warning: result.warning || null
      });
    } else {
      res.status(400).json({
        error: result.message,
        enabled: status.enabled,
        provider: result.provider,
        model: result.model,
        configuration: {
          provider: status.provider,
          configured: status.initialized,
          availableProviders: LLMServiceFactory.getAvailableProviders(),
          issues: [result.error || result.message]
        },
        details: result.error
      });
    }
  } catch (error) {
    console.error('LLM test failed:', error);
    res.status(500).json({ 
      error: 'LLM test failed: ' + error.message,
      enabled: false,
      configuration: {
        provider: 'unknown',
        configured: false,
        availableProviders: LLMServiceFactory.getAvailableProviders(),
        issues: [error.message]
      }
    });
  }
});

// Test specific LLM provider configuration
app.post('/api/test-llm', async (req, res) => {
  try {
    const { provider, apiKey, model, ...otherConfig } = req.body;
    
    if (!provider) {
      return res.status(400).json({
        error: 'Provider is required',
        availableProviders: LLMServiceFactory.getAvailableProviders()
      });
    }

    // Create test configuration
    const testConfig = {
      provider,
      apiKey,
      model,
      enabled: true,
      ...otherConfig
    };

    // Validate configuration first
    try {
      LLMServiceFactory.validateConfig(testConfig);
    } catch (validationError) {
      return res.status(400).json({
        error: 'Configuration validation failed',
        provider: provider,
        details: validationError.message,
        availableProviders: LLMServiceFactory.getAvailableProviders()
      });
    }

    // Test the provider
    const result = await LLMServiceFactory.testProvider(testConfig);
    
    if (result.success) {
      res.json({
        status: 'Provider test successful!',
        provider: result.provider,
        model: result.model,
        message: result.message,
        configuration: {
          valid: true,
          provider: testConfig.provider,
          model: testConfig.model
        }
      });
    } else {
      res.status(400).json({
        error: result.message,
        provider: result.provider,
        model: result.model,
        details: result.error,
        configuration: {
          valid: false,
          provider: testConfig.provider,
          issues: [result.error || result.message]
        }
      });
    }
  } catch (error) {
    console.error('LLM provider test failed:', error);
    res.status(500).json({ 
      error: 'Provider test failed: ' + error.message,
      availableProviders: LLMServiceFactory.getAvailableProviders()
    });
  }
});

// Get LLM performance metrics
app.get('/api/llm-performance', async (req, res) => {
  try {
    // Create LLM analyzer to get performance metrics
    const llmAnalyzer = LLMAnalyzer.fromEnvironment(process.env);
    
    if (!llmAnalyzer.config.enabled) {
      return res.json({
        enabled: false,
        message: 'LLM analysis is not enabled'
      });
    }

    const metrics = llmAnalyzer.getPerformanceMetrics();
    const recommendations = llmAnalyzer.getOptimizationRecommendations();
    
    res.json({
      enabled: true,
      provider: llmAnalyzer.config.provider,
      model: llmAnalyzer.config.model,
      metrics: {
        totalRequests: metrics.totalRequests,
        totalTokensUsed: metrics.totalTokensUsed,
        totalCost: metrics.totalCost,
        averageResponseTime: metrics.averageResponseTime,
        providerStats: metrics.providerStats,
        recentRequests: metrics.recentRequests
      },
      recommendations,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error getting LLM performance metrics:', error);
    res.status(500).json({
      error: 'Failed to get performance metrics: ' + error.message
    });
  }
});

// Reset LLM performance metrics
app.post('/api/llm-performance/reset', async (req, res) => {
  try {
    const llmAnalyzer = LLMAnalyzer.fromEnvironment(process.env);
    
    if (!llmAnalyzer.config.enabled) {
      return res.status(400).json({
        error: 'LLM analysis is not enabled'
      });
    }

    llmAnalyzer.resetPerformanceMetrics();
    
    res.json({
      status: 'Performance metrics reset successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error resetting LLM performance metrics:', error);
    res.status(500).json({
      error: 'Failed to reset performance metrics: ' + error.message
    });
  }
});

// Get progress for a specific session
app.get('/api/progress/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const tracker = progressManager.getTracker(sessionId);
    
    if (!tracker) {
      return res.status(404).json({
        error: 'Progress session not found',
        sessionId
      });
    }
    
    const status = tracker.getStatus();
    res.json(status);
  } catch (error) {
    console.error('Error getting progress:', error);
    res.status(500).json({
      error: 'Failed to get progress: ' + error.message
    });
  }
});

// Generate retro endpoint
app.post('/api/generate-retro', async (req, res) => {
  try {
    const { dateRange, teamMembers, sessionId } = req.body;
    
    if (!process.env.LINEAR_API_KEY) {
      return res.status(400).json({ 
        error: 'LINEAR_API_KEY not configured. Please add it to your .env file.' 
      });
    }
    
    console.log('Generating retro for:', { dateRange, teamMembers });
    
    // Initialize services
    const linearService = new LinearService(process.env.LINEAR_API_KEY);
    let slackService = null;
    if (process.env.SLACK_BOT_TOKEN) {
      slackService = new SlackService(process.env.SLACK_BOT_TOKEN);
    }
    let githubService = null;
    if (process.env.GITHUB_TOKEN) {
      githubService = new GitHubService(process.env.GITHUB_TOKEN);
    }

    // Initialize LLM analyzer and check configuration
    const llmAnalyzer = LLMAnalyzer.fromEnvironment(process.env);
    const llmEnabled = llmAnalyzer.config.enabled;
    
    console.log(`LLM analysis ${llmEnabled ? 'enabled' : 'disabled'}`);

    // Create progress tracker if sessionId provided and LLM is enabled
    let progressTracker = null;
    if (sessionId && llmEnabled) {
      progressTracker = progressManager.createTracker(sessionId, DEFAULT_LLM_STEPS);
      console.log(`Created progress tracker for session: ${sessionId}`);
    }

    // Prepare date range strings - handle both date-only and full ISO strings
    const startDate = dateRange.start.includes('T') ? dateRange.start : dateRange.start + 'T00:00:00Z';
    const endDate = dateRange.end.includes('T') ? dateRange.end : dateRange.end + 'T23:59:59Z';

    // Run rule-based and LLM analysis in parallel for performance
    const [ruleBasedResults, llmResults] = await Promise.allSettled([
      // Rule-based analysis
      performRuleBasedAnalysis(linearService, slackService, githubService, startDate, endDate, teamMembers),
      // LLM analysis (if enabled)
      llmEnabled ? performLLMAnalysis(llmAnalyzer, linearService, slackService, githubService, startDate, endDate, dateRange, teamMembers) : Promise.resolve(null)
    ]);

    // Extract results from Promise.allSettled
    const ruleBasedInsights = ruleBasedResults.status === 'fulfilled' 
      ? ruleBasedResults.value 
      : { wentWell: [], didntGoWell: [], actionItems: [] };

    const llmInsights = llmResults.status === 'fulfilled' && llmResults.value
      ? llmResults.value
      : { wentWell: [], didntGoWell: [], actionItems: [] };

    // Log any errors from parallel processing
    if (ruleBasedResults.status === 'rejected') {
      console.error('Rule-based analysis failed:', ruleBasedResults.reason);
    }
    if (llmResults.status === 'rejected') {
      console.warn('LLM analysis failed:', llmResults.reason);
    }

    // Merge rule-based and LLM insights using InsightMerger
    const retroData = InsightMerger.merge(ruleBasedInsights, llmInsights);
    
    // Add analysis metadata
    retroData.analysisMetadata = {
      ...retroData.analysisMetadata,
      ruleBasedAnalysisUsed: ruleBasedResults.status === 'fulfilled',
      llmAnalysisUsed: llmEnabled && llmResults.status === 'fulfilled' && llmResults.value !== null,
      llmEnabled: llmEnabled,
      generatedAt: new Date().toISOString(),
      dateRange: dateRange,
      teamMembers: teamMembers
    };

    // Add LLM-specific metadata if available
    if (llmInsights.analysisMetadata) {
      retroData.analysisMetadata.llm = llmInsights.analysisMetadata;
    }
    
    // Add fallback content if no meaningful data found
    addFallbackContent(retroData, ruleBasedInsights, llmInsights);
    
    console.log('Generated retro data:', {
      wentWell: retroData.wentWell.length,
      didntGoWell: retroData.didntGoWell.length,
      actionItems: retroData.actionItems.length,
      llmUsed: retroData.analysisMetadata.llmAnalysisUsed,
      ruleBasedUsed: retroData.analysisMetadata.ruleBasedAnalysisUsed
    });
    
    res.json(retroData);
  } catch (error) {
    console.error('Error generating retro:', error);
    res.status(500).json({ 
      error: 'Failed to generate retro: ' + error.message 
    });
  }
});

// Filter insights endpoint
app.post('/api/filter-insights', async (req, res) => {
  try {
    const { insights, filters = {}, sortOptions = {} } = req.body;
    
    if (!insights || typeof insights !== 'object') {
      return res.status(400).json({ 
        error: 'Invalid insights data provided' 
      });
    }

    // Create insight merger with categorization enabled
    const merger = new InsightMerger({ 
      enableCategorization: true,
      categorizerConfig: {
        enableAutoCategories: true
      }
    });

    // Apply filtering if filters provided
    let filteredInsights = insights;
    if (Object.keys(filters).length > 0) {
      filteredInsights = merger.filterInsights(insights, filters);
    }

    // Apply sorting if sort options provided
    let sortedInsights = filteredInsights;
    if (Object.keys(sortOptions).length > 0) {
      sortedInsights = merger.sortInsights(filteredInsights, sortOptions);
    }

    // Add category statistics
    const allInsights = [
      ...(sortedInsights.wentWell || []),
      ...(sortedInsights.didntGoWell || []),
      ...(sortedInsights.actionItems || [])
    ];
    
    const categorizer = merger.categorizer;
    const categoryStats = categorizer ? categorizer.getCategoryStatistics(allInsights) : {};

    res.json({
      ...sortedInsights,
      categoryStatistics: categoryStats,
      availableCategories: merger.getAvailableCategories(),
      filterMetadata: {
        filtersApplied: Object.keys(filters).length > 0,
        sortingApplied: Object.keys(sortOptions).length > 0,
        totalInsights: allInsights.length,
        processedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error filtering insights:', error);
    res.status(500).json({ 
      error: 'Failed to filter insights: ' + error.message 
    });
  }
});

// Get available categories endpoint
app.get('/api/insight-categories', (req, res) => {
  try {
    const merger = new InsightMerger({ 
      enableCategorization: true 
    });
    
    const categories = merger.getAvailableCategories();
    
    res.json({
      categories,
      metadata: {
        total: categories.length,
        retrievedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('Error getting categories:', error);
    res.status(500).json({ 
      error: 'Failed to get categories: ' + error.message 
    });
  }
});

// Export retro insights endpoint
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

    // Set appropriate headers for download
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', Buffer.byteLength(exportedContent, 'utf8'));
    
    res.send(exportedContent);
  } catch (error) {
    console.error('Error exporting retro:', error);
    res.status(500).json({ 
      error: 'Failed to export retro: ' + error.message 
    });
  }
});

// Get export preview endpoint (for UI preview without download)
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
    console.error('Error generating export preview:', error);
    res.status(500).json({ 
      error: 'Failed to generate export preview: ' + error.message 
    });
  }
});

// Release Notes API Endpoints

// In-memory storage for release notes (in production, use a database)
const releaseNotesStorage = new Map();

// Generate release notes endpoint with comprehensive error handling and progress tracking
app.post('/api/generate-release-notes', async (req, res) => {
  const sessionId = `rn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  let progressTracker = null;

  try {
    const { dateRange, options = {} } = req.body;
    
    // Validate input
    if (!dateRange || !dateRange.start || !dateRange.end) {
      const error = ReleaseNotesErrorHandler.createError(
        new Error('Date range with start and end dates is required'),
        'validation'
      );
      
      return res.status(400).json({ 
        error: error.message,
        type: error.type,
        code: error.code,
        userFriendlyError: ReleaseNotesErrorHandler.getUserFriendlyError(error)
      });
    }

    console.log('Generating release notes for:', { dateRange, options, sessionId });

    // Create progress tracker
    progressTracker = releaseNotesProgressManager.createTracker(sessionId, options);
    
    // Set up progress event handlers for real-time updates
    progressTracker.on('step_started', (data) => {
      console.log(`Step started: ${data.step.name}`);
    });
    
    progressTracker.on('step_completed', (data) => {
      console.log(`Step completed: ${data.step.name} (${data.step.duration}ms)`);
    });
    
    progressTracker.on('degradation', (data) => {
      console.warn('Degradation detected:', data.degradationInfo.message);
    });

    // Initialize release notes service
    const releaseNotesService = new ReleaseNotesService();

    // Generate release notes with progress tracking
    const releaseNotesDocument = await releaseNotesService.generateReleaseNotes(dateRange, {
      ...options,
      progressTracker
    });

    // Store the generated release notes with a unique ID
    const releaseNotesId = sessionId;
    releaseNotesStorage.set(releaseNotesId, {
      ...releaseNotesDocument,
      id: releaseNotesId,
      sessionId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    console.log('Release notes generated successfully:', {
      id: releaseNotesId,
      newFeatures: releaseNotesDocument.entries.newFeatures.length,
      improvements: releaseNotesDocument.entries.improvements.length,
      fixes: releaseNotesDocument.entries.fixes.length,
      errors: releaseNotesDocument.metadata.errors || 0
    });

    // Include progress information and any warnings in response
    const response = {
      id: releaseNotesId,
      sessionId,
      ...releaseNotesDocument,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      progressInfo: progressTracker.getStatus()
    };

    // Add warnings if there were errors during generation
    if (releaseNotesDocument.metadata.errors > 0) {
      response.warnings = {
        message: 'Release notes generated with some limitations',
        details: releaseNotesDocument.metadata.errorSummary,
        degradationInfo: releaseNotesDocument.metadata.degradationInfo
      };
    }

    res.json(response);

  } catch (error) {
    console.error('Error generating release notes:', error);
    
    // Create structured error response
    const releaseNotesError = ReleaseNotesErrorHandler.createError(error, 'generation');
    const userFriendlyError = ReleaseNotesErrorHandler.getUserFriendlyError(releaseNotesError);
    
    // Determine appropriate HTTP status code
    let statusCode = 500;
    if (releaseNotesError.type === 'INVALID_DATE_RANGE') {
      statusCode = 400;
    } else if (releaseNotesError.type === 'ALL_SOURCES_FAILED') {
      statusCode = 503;
    }

    const errorResponse = {
      error: releaseNotesError.message,
      type: releaseNotesError.type,
      code: releaseNotesError.code,
      sessionId,
      userFriendlyError,
      timestamp: releaseNotesError.timestamp,
      recoverable: releaseNotesError.recoverable
    };

    // Include retry information if applicable
    const retryStrategy = ReleaseNotesErrorHandler.getRetryStrategy(releaseNotesError);
    if (retryStrategy) {
      errorResponse.retryInfo = {
        recommended: true,
        maxAttempts: retryStrategy.maxAttempts,
        delay: retryStrategy.delay,
        backoff: retryStrategy.backoff
      };
    }

    // Include progress information if available
    if (progressTracker) {
      errorResponse.progressInfo = progressTracker.getStatus();
    }

    res.status(statusCode).json(errorResponse);
  }
});

// Get release notes progress endpoint
app.get('/api/release-notes-progress/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const progressTracker = releaseNotesProgressManager.getTracker(sessionId);
    if (!progressTracker) {
      return res.status(404).json({ 
        error: 'Progress session not found',
        sessionId 
      });
    }

    const status = progressTracker.getStatus();
    const userFriendlyStatus = progressTracker.getUserFriendlyStatus();

    res.json({
      sessionId,
      status,
      userFriendlyStatus,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('Error getting release notes progress:', error);
    res.status(500).json({ 
      error: 'Failed to get progress: ' + error.message 
    });
  }
});

// Get release notes by ID endpoint
app.get('/api/release-notes/:id', (req, res) => {
  try {
    const { id } = req.params;
    
    if (!releaseNotesStorage.has(id)) {
      return res.status(404).json({ 
        error: 'Release notes not found',
        id 
      });
    }

    const releaseNotes = releaseNotesStorage.get(id);
    res.json(releaseNotes);

  } catch (error) {
    console.error('Error retrieving release notes:', error);
    res.status(500).json({ 
      error: 'Failed to retrieve release notes: ' + error.message 
    });
  }
});

// Update release notes endpoint
app.put('/api/release-notes/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    if (!releaseNotesStorage.has(id)) {
      return res.status(404).json({ 
        error: 'Release notes not found',
        id 
      });
    }

    const existingReleaseNotes = releaseNotesStorage.get(id);
    
    // Merge updates with existing data
    const updatedReleaseNotes = {
      ...existingReleaseNotes,
      ...updates,
      id, // Ensure ID doesn't change
      createdAt: existingReleaseNotes.createdAt, // Preserve creation time
      updatedAt: new Date().toISOString()
    };

    // Store updated release notes
    releaseNotesStorage.set(id, updatedReleaseNotes);

    console.log('Release notes updated successfully:', { id });

    res.json(updatedReleaseNotes);

  } catch (error) {
    console.error('Error updating release notes:', error);
    res.status(500).json({ 
      error: 'Failed to update release notes: ' + error.message 
    });
  }
});

// Export release notes endpoint
app.post('/api/release-notes/:id/export', (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'markdown', options = {} } = req.body;
    
    if (!releaseNotesStorage.has(id)) {
      return res.status(404).json({ 
        error: 'Release notes not found',
        id 
      });
    }

    const releaseNotes = releaseNotesStorage.get(id);
    const exportService = new ExportService();
    
    let exportedContent;
    let contentType;
    let filename;

    switch (format.toLowerCase()) {
      case 'markdown':
      case 'md':
        exportedContent = exportService.exportReleaseNotesToMarkdown(releaseNotes, options);
        contentType = 'text/markdown';
        filename = `release-notes-${releaseNotes.dateRange.start}-to-${releaseNotes.dateRange.end}.md`;
        break;
      
      case 'html':
        exportedContent = exportService.exportReleaseNotesToHTML(releaseNotes, options);
        contentType = 'text/html';
        filename = `release-notes-${releaseNotes.dateRange.start}-to-${releaseNotes.dateRange.end}.html`;
        break;
      
      case 'json':
        exportedContent = exportService.exportReleaseNotesToJSON(releaseNotes, options);
        contentType = 'application/json';
        filename = `release-notes-${releaseNotes.dateRange.start}-to-${releaseNotes.dateRange.end}.json`;
        break;
      
      default:
        return res.status(400).json({ 
          error: 'Unsupported format. Supported formats: markdown, html, json' 
        });
    }

    // Set appropriate headers for download
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', Buffer.byteLength(exportedContent, 'utf8'));
    
    res.send(exportedContent);

  } catch (error) {
    console.error('Error exporting release notes:', error);
    res.status(500).json({ 
      error: 'Failed to export release notes: ' + error.message 
    });
  }
});

/**
 * Perform rule-based analysis from all configured sources
 */
async function performRuleBasedAnalysis(linearService, slackService, githubService, startDate, endDate, teamMembers) {
  console.log('Starting rule-based analysis...');
  
  // Fetch Linear issues
  console.log('Fetching Linear issues...');
  const issues = await linearService.getIssuesInDateRange(startDate, endDate, teamMembers);
  console.log(`Found ${issues.length} Linear issues`);
  
  // Analyze Linear issues for retro insights
  const linearRetroData = linearService.analyzeIssuesForRetro(issues);

  // Fetch and analyze Slack messages if available
  let slackRetroData = { wentWell: [], didntGoWell: [], actionItems: [] };
  if (slackService) {
    try {
      console.log('Fetching Slack messages...');
      const messages = await slackService.getTeamChannelMessages(startDate, endDate);
      console.log(`Found ${messages.length} Slack messages`);
      slackRetroData = slackService.analyzeMessagesForRetro(messages);
    } catch (error) {
      console.warn('Slack analysis failed:', error.message);
    }
  }

  // Fetch and analyze GitHub activity if available
  let githubRetroData = { wentWell: [], didntGoWell: [], actionItems: [] };
  if (githubService) {
    try {
      console.log('Fetching GitHub activity...');
      const { commits, pullRequests } = await githubService.getTeamActivity(startDate, endDate);
      console.log(`Found ${commits.length} commits and ${pullRequests.length} PRs`);
      githubRetroData = githubService.analyzeActivityForRetro(commits, pullRequests);
    } catch (error) {
      console.warn('GitHub analysis failed:', error.message);
    }
  }

  // Combine rule-based insights from all sources
  const ruleBasedInsights = {
    wentWell: [...linearRetroData.wentWell, ...slackRetroData.wentWell, ...githubRetroData.wentWell],
    didntGoWell: [...linearRetroData.didntGoWell, ...slackRetroData.didntGoWell, ...githubRetroData.didntGoWell],
    actionItems: [...linearRetroData.actionItems, ...slackRetroData.actionItems, ...githubRetroData.actionItems]
  };

  console.log('Rule-based analysis completed:', {
    wentWell: ruleBasedInsights.wentWell.length,
    didntGoWell: ruleBasedInsights.didntGoWell.length,
    actionItems: ruleBasedInsights.actionItems.length
  });

  return ruleBasedInsights;
}

/**
 * Perform LLM analysis if enabled and configured
 */
async function performLLMAnalysis(llmAnalyzer, linearService, slackService, githubService, startDate, endDate, dateRange, teamMembers) {
  console.log('Starting LLM analysis...');
  
  try {
    // Fetch Linear issues for LLM analysis
    const issues = await linearService.getIssuesInDateRange(startDate, endDate, teamMembers);
    
    // Prepare GitHub data for LLM
    let githubData = null;
    if (githubService) {
      try {
        const { commits, pullRequests } = await githubService.getTeamActivity(startDate, endDate);
        githubData = { commits, pullRequests };
        console.log(`Prepared ${commits.length} commits and ${pullRequests.length} PRs for LLM analysis`);
      } catch (error) {
        console.warn('GitHub data collection for LLM failed:', error.message);
      }
    }
    
    // Prepare Slack data for LLM
    let slackData = null;
    if (slackService) {
      try {
        slackData = await slackService.getTeamChannelMessages(startDate, endDate);
        console.log(`Prepared ${slackData.length} messages for LLM analysis`);
      } catch (error) {
        console.warn('Slack data collection for LLM failed:', error.message);
      }
    }
    
    // Run LLM analysis
    const llmInsights = await llmAnalyzer.analyzeTeamData(
      githubData,
      issues, // Linear issues
      slackData,
      dateRange,
      {
        teamSize: teamMembers?.length,
        repositories: process.env.GITHUB_REPOS?.split(',') || [],
        channels: process.env.SLACK_CHANNELS?.split(',') || []
      }
    );
    
    if (llmInsights) {
      console.log('LLM analysis completed:', {
        wentWell: llmInsights.wentWell.length,
        didntGoWell: llmInsights.didntGoWell.length,
        actionItems: llmInsights.actionItems.length
      });
      return llmInsights;
    } else {
      console.log('LLM analysis returned null, no insights generated');
      return null;
    }
  } catch (error) {
    console.warn('LLM analysis failed:', error.message);
    throw error; // Re-throw to be caught by Promise.allSettled
  }
}

/**
 * Add fallback content if no meaningful insights were generated
 */
function addFallbackContent(retroData, ruleBasedInsights, llmInsights) {
  // Count total insights from original sources
  const totalRuleInsights = (ruleBasedInsights.wentWell?.length || 0) + 
                           (ruleBasedInsights.didntGoWell?.length || 0) + 
                           (ruleBasedInsights.actionItems?.length || 0);
  
  const totalLLMInsights = (llmInsights.wentWell?.length || 0) + 
                          (llmInsights.didntGoWell?.length || 0) + 
                          (llmInsights.actionItems?.length || 0);

  // Add fallback content if no meaningful data found
  if (retroData.wentWell.length === 0 && retroData.didntGoWell.length === 0) {
    retroData.wentWell.push({
      title: "Team stayed active",
      details: `Tracked activity during this period (${totalRuleInsights} rule-based insights, ${totalLLMInsights} AI insights generated)`,
      source: "system",
      confidence: 0.5
    });
  }
  
  if (retroData.actionItems.length === 0) {
    retroData.actionItems.push({
      title: "Continue tracking team activities",
      priority: "low",
      assignee: "team",
      details: "Keep using the configured tools for better retro insights",
      source: "system",
      confidence: 0.5
    });
  }
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});