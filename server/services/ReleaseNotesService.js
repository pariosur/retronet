import GitHubService from "./githubService.js";
import LinearService from "./linearService.js";
import SlackService from "./slackService.js";
import { ReleaseNotesAnalyzer } from "./llm/ReleaseNotesAnalyzer.js";
import { ReleaseNotesCategorizer } from "./ReleaseNotesCategorizer.js";
import { UserImpactAnalyzer } from "./UserImpactAnalyzer.js";
import {
  ReleaseNotesDocument,
  ReleaseNotesEntry,
  ReleaseNotesUtils,
} from "../models/ReleaseNotesModels.js";
import { LLMErrorHandler } from "./llm/ErrorHandler.js";
import { ProgressTracker } from "./llm/ProgressTracker.js";
import ReleaseNotesCache from "./ReleaseNotesCache.js";
import ReleaseNotesIncrementalProcessor from "./ReleaseNotesIncrementalProcessor.js";
import ReleaseNotesDataOptimizer from "./ReleaseNotesDataOptimizer.js";

/**
 * ReleaseNotesService - Core service for generating user-facing release notes
 *
 * This service orchestrates the collection of data from GitHub, Linear, and Slack
 * to generate customer-friendly release notes that translate technical updates
 * into business value and user impact.
 */
class ReleaseNotesService {
  constructor(config = {}) {
    this.config = {
      // Service configuration
      githubToken: config.githubToken || process.env.GITHUB_TOKEN,
      linearApiKey: config.linearApiKey || process.env.LINEAR_API_KEY,
      slackBotToken: config.slackBotToken || process.env.SLACK_BOT_TOKEN,

      // Release notes specific configuration
      defaultCategories: config.defaultCategories || [
        "newFeatures",
        "improvements",
        "fixes",
      ],
      confidenceThreshold: config.confidenceThreshold || 0.7,
      maxEntriesPerCategory: config.maxEntriesPerCategory || 20,

      // Data collection settings
      includeInternalChanges: config.includeInternalChanges || false,
      teamRepositories: config.teamRepositories || [],
      teamChannels: config.teamChannels || [],

      ...config,
    };

    // Initialize data services
    this.githubService = null;
    this.linearService = null;
    this.slackService = null;

    // Initialize LLM analyzer for release notes
    this.llmAnalyzer = null;

    // Initialize categorizer for fallback and confidence scoring
    this.categorizer = new ReleaseNotesCategorizer({
      highConfidenceThreshold: this.config.confidenceThreshold || 0.7,
      mediumConfidenceThreshold: (this.config.confidenceThreshold || 0.7) - 0.2,
    });

    // Initialize user impact analyzer for filtering user-facing changes
    this.userImpactAnalyzer = new UserImpactAnalyzer({
      highImpactThreshold: 0.8,
      mediumImpactThreshold: 0.6,
      lowImpactThreshold: 0.4,
      exclusionStrictness: this.config.includeInternalChanges
        ? "lenient"
        : "medium",
    });

    // Initialize performance optimization components
    this.cache = new ReleaseNotesCache({
      maxCacheSize: config.maxCacheSize || 1000,
      maxCacheAge: config.maxCacheAge || 24 * 60 * 60 * 1000, // 24 hours
      similarityThreshold: config.similarityThreshold || 0.8,
    });

    this.incrementalProcessor = new ReleaseNotesIncrementalProcessor({
      maxChunkSizeDays: config.maxChunkSizeDays || 7,
      maxDataPointsPerChunk: config.maxDataPointsPerChunk || 500,
      maxConcurrentChunks: config.maxConcurrentChunks || 3,
    });

    this.dataOptimizer = new ReleaseNotesDataOptimizer({
      maxItemsPerQuery: config.maxItemsPerQuery || 100,
      maxConcurrentQueries: config.maxConcurrentQueries || 3,
      enablePreFiltering: config.enablePreFiltering !== false,
    });

    this._initializeServices();
  }

  /**
   * Initialize data collection services based on available configuration
   * @private
   */
  _initializeServices() {
    try {
      if (this.config.githubToken) {
        this.githubService = new GitHubService(this.config.githubToken);
        console.log("ReleaseNotesService: GitHub service initialized");
      } else {
        this.githubService = null;
        console.warn(
          "ReleaseNotesService: GitHub token not provided, GitHub integration disabled"
        );
      }

      if (this.config.linearApiKey) {
        this.linearService = new LinearService(this.config.linearApiKey);
        console.log("ReleaseNotesService: Linear service initialized");
      } else {
        this.linearService = null;
        console.warn(
          "ReleaseNotesService: Linear API key not provided, Linear integration disabled"
        );
      }

      if (this.config.slackBotToken) {
        this.slackService = new SlackService(this.config.slackBotToken);
        console.log("ReleaseNotesService: Slack service initialized");
      } else {
        this.slackService = null;
        console.warn(
          "ReleaseNotesService: Slack bot token not provided, Slack integration disabled"
        );
      }

      // Initialize LLM analyzer for enhanced release notes generation
      try {
        this.llmAnalyzer = ReleaseNotesAnalyzer.fromEnvironment(process.env);
        if (this.llmAnalyzer.config.enabled) {
          console.log(
            "ReleaseNotesService: LLM analyzer initialized for enhanced release notes generation"
          );
        } else {
          console.log(
            "ReleaseNotesService: LLM analyzer disabled, using rule-based analysis only"
          );
        }
      } catch (error) {
        console.warn(
          "ReleaseNotesService: Failed to initialize LLM analyzer:",
          error.message
        );
        this.llmAnalyzer = null;
      }
    } catch (error) {
      console.error(
        "ReleaseNotesService: Error initializing services:",
        error.message
      );
      throw new Error(
        `Failed to initialize ReleaseNotesService: ${error.message}`
      );
    }
  }

  /**
   * Generate release notes for the specified date range with comprehensive error handling and progress tracking
   *
   * @param {Object} dateRange - Date range for release notes generation
   * @param {string} dateRange.start - Start date (ISO string)
   * @param {string} dateRange.end - End date (ISO string)
   * @param {Object} options - Generation options
   * @param {string[]} options.teamMembers - Team member emails for filtering
   * @param {string[]} options.repositories - Specific repositories to include
   * @param {string[]} options.channels - Specific Slack channels to include
   * @param {string} options.title - Custom title for release notes
   * @param {boolean} options.includeInternalChanges - Whether to include internal changes
   * @param {ProgressTracker} options.progressTracker - Progress tracker instance
   * @param {boolean} options.enablePerformanceOptimizations - Enable performance optimizations
   * @returns {Promise<Object>} Generated release notes document
   */
  async generateReleaseNotes(dateRange, options = {}) {
    const progressTracker = options.progressTracker;
    const errors = [];
    let partialData = {};

    try {
      // Step 1: Validation
      if (progressTracker) {
        progressTracker.startStep(0);
      }

      console.log("ReleaseNotesService: Starting release notes generation", {
        dateRange,
        options,
      });
      this._validateDateRange(dateRange);

      // Check if incremental processing should be used for large date ranges
      const shouldUseIncremental =
        options.enablePerformanceOptimizations !== false &&
        this.incrementalProcessor.shouldUseIncrementalProcessing(dateRange);

      if (shouldUseIncremental) {
        console.log(
          "ReleaseNotesService: Using incremental processing for large date range"
        );
        return await this.incrementalProcessor.processIncrementally(
          dateRange,
          options,
          (chunkDateRange, chunkOptions, chunkProgressTracker) =>
            this._generateReleaseNotesForChunk(
              chunkDateRange,
              chunkOptions,
              chunkProgressTracker
            ),
          progressTracker
        );
      }

      if (progressTracker) {
        progressTracker.completeStep(0, {
          validated: true,
          incremental: false,
        });
      }

      // Step 2: Data Collection with graceful degradation
      if (progressTracker) {
        progressTracker.startStep(1);
      }

      const startDate = this._formatDate(dateRange.start);
      const endDate = this._formatDate(dateRange.end);

      console.log("ReleaseNotesService: Collecting data from sources...");
      const { rawData, collectionErrors } =
        await this._collectDataFromSourcesWithErrorHandling(
          startDate,
          endDate,
          options,
          progressTracker
        );

      partialData = rawData;
      errors.push(...collectionErrors);

      // Check if we have enough data to continue
      const availableSourceCount = Object.keys(rawData).filter(
        (key) => rawData[key]
      ).length;
      if (availableSourceCount === 0) {
        throw new Error(
          "No data sources are available. Cannot generate release notes."
        );
      }

      if (progressTracker) {
        progressTracker.completeStep(1, {
          availableSources: Object.keys(rawData).filter((key) => rawData[key]),
          errors: collectionErrors.length,
        });
      }

      // Step 3: Analysis
      if (progressTracker) {
        progressTracker.startStep(2);
      }

      let finalChanges;
      let analysisMetadata = { generationMethod: "rule-based", aiGenerated: 0 };

      if (progressTracker) {
        progressTracker.completeStep(2, { method: "user-impact-analysis" });
      }

      // Step 4: AI Processing (optional, can be skipped)
      if (this.llmAnalyzer && this.llmAnalyzer.config.enabled) {
        if (progressTracker) {
          progressTracker.startStep(3);
        }

        try {
          console.log("ReleaseNotesService: Using LLM-enhanced analysis...");

          const llmAnalysis = await this._performLLMAnalysisWithRetry(
            rawData,
            {
              dateRange,
              teamSize: options.teamSize,
              productType: options.productType || "Software application",
              repositories:
                options.repositories || this.config.teamRepositories,
              channels: options.channels || this.config.teamChannels,
            },
            progressTracker
          );

          if (llmAnalysis && llmAnalysis.categorizedChanges) {
            finalChanges = llmAnalysis.categorizedChanges;
            analysisMetadata = {
              generationMethod: "llm-enhanced",
              aiGenerated: Object.values(finalChanges).flat().length,
              llmProvider: llmAnalysis.metadata.provider,
              llmModel: llmAnalysis.metadata.model,
              analysisTime: llmAnalysis.metadata.duration,
            };

            console.log(
              "ReleaseNotesService: LLM analysis completed successfully"
            );

            if (progressTracker) {
              progressTracker.completeStep(3, {
                provider: llmAnalysis.metadata.provider,
                model: llmAnalysis.metadata.model,
              });
            }
          } else {
            throw new Error("LLM analysis returned no results");
          }
        } catch (error) {
          console.warn(
            "ReleaseNotesService: LLM analysis failed, falling back to rule-based analysis:",
            error.message
          );

          if (progressTracker) {
            progressTracker.handleAIFailure(error);
          }

          finalChanges = await this._performRuleBasedAnalysis(rawData);
          errors.push(error);
        }
      } else {
        console.log(
          "ReleaseNotesService: LLM analyzer not available, using rule-based analysis..."
        );

        if (progressTracker) {
          progressTracker.handleAIFailure(
            new Error("LLM analyzer not configured")
          );
        }

        finalChanges = await this._performRuleBasedAnalysis(rawData);
      }

      // Step 5: Categorization
      if (progressTracker) {
        progressTracker.startStep(4);
      }

      // If we don't have final changes yet, perform rule-based analysis
      if (!finalChanges) {
        finalChanges = await this._performRuleBasedAnalysis(rawData);
      }

      if (progressTracker) {
        progressTracker.completeStep(4, {
          newFeatures: finalChanges.newFeatures?.length || 0,
          improvements: finalChanges.improvements?.length || 0,
          fixes: finalChanges.fixes?.length || 0,
        });
      }

      // Step 6: Finalization
      if (progressTracker) {
        progressTracker.startStep(5);
      }

      const releaseNotesDocument = this._createReleaseNotesDocument(
        finalChanges,
        dateRange,
        options,
        rawData,
        analysisMetadata,
        errors
      );

      if (progressTracker) {
        progressTracker.completeStep(5, {
          totalEntries: Object.values(releaseNotesDocument.entries).flat()
            .length,
        });
      }

      console.log(
        "ReleaseNotesService: Release notes generation completed successfully"
      );

      return releaseNotesDocument;
    } catch (error) {
      console.error(
        "ReleaseNotesService: Error generating release notes:",
        error.message
      );

      if (progressTracker) {
        progressTracker.fail(error);
      }

      // Try to provide a fallback document if we have partial data
      if (Object.keys(partialData).length > 0) {
        console.log(
          "ReleaseNotesService: Attempting to generate fallback release notes..."
        );
        try {
          return await this._generateFallbackReleaseNotes(
            partialData,
            dateRange,
            [...errors, error]
          );
        } catch (fallbackError) {
          console.error(
            "ReleaseNotesService: Fallback generation also failed:",
            fallbackError.message
          );
        }
      }

      throw error;
    }
  }

  /**
   * Identify user-facing changes from raw data collected from sources
   *
   * @param {Object} rawData - Raw data from GitHub, Linear, and Slack
   * @param {Object} options - Analysis options
   * @returns {Promise<Array>} Array of user-facing changes
   */
  async identifyUserFacingChanges(rawData, options = {}) {
    try {
      console.log(
        "ReleaseNotesService: Analyzing data for user-facing changes..."
      );

      // Check cache first if enabled
      if (options.enablePerformanceOptimizations !== false) {
        const cachedResult = this.cache.getCachedUserImpactAnalysis(
          rawData,
          options
        );
        if (cachedResult) {
          console.log("ReleaseNotesService: Using cached user impact analysis");
          return cachedResult;
        }
      }

      const allChanges = [];

      // Process GitHub data for changes
      if (rawData.github) {
        const githubChanges = this._extractChangesFromGitHub(rawData.github);
        allChanges.push(...githubChanges);
        console.log(
          `ReleaseNotesService: Extracted ${githubChanges.length} changes from GitHub`
        );
      }

      // Process Linear data for changes
      if (rawData.linear) {
        const linearChanges = this._extractChangesFromLinear(rawData.linear);
        allChanges.push(...linearChanges);
        console.log(
          `ReleaseNotesService: Extracted ${linearChanges.length} changes from Linear`
        );
      }

      // Process Slack data for changes
      if (rawData.slack) {
        const slackChanges = this._extractChangesFromSlack(rawData.slack);
        allChanges.push(...slackChanges);
        console.log(
          `ReleaseNotesService: Extracted ${slackChanges.length} changes from Slack`
        );
      }

      // Use UserImpactAnalyzer to filter for user-facing changes
      const impactAnalysis = this.userImpactAnalyzer.analyzeChanges(allChanges);

      console.log("ReleaseNotesService: User impact analysis completed", {
        total: impactAnalysis.statistics.total,
        userFacing: impactAnalysis.statistics.userFacing,
        internal: impactAnalysis.statistics.internal,
        userFacingPercentage:
          impactAnalysis.statistics.userFacingPercentage.toFixed(1) + "%",
        averageConfidence:
          impactAnalysis.statistics.averageConfidence.toFixed(2),
      });

      // Remove duplicates and filter by confidence
      const filteredChanges = this._deduplicateAndFilterChanges(
        impactAnalysis.userFacingChanges
      );

      console.log(
        `ReleaseNotesService: Filtered to ${filteredChanges.length} unique user-facing changes`
      );

      // Cache the result if enabled
      if (options.enablePerformanceOptimizations !== false) {
        this.cache.cacheUserImpactAnalysis(rawData, filteredChanges, {
          provider: options.provider,
          model: options.model,
          dataSize: JSON.stringify(rawData).length,
        });
      }

      return filteredChanges;
    } catch (error) {
      console.error(
        "ReleaseNotesService: Error identifying user-facing changes:",
        error.message
      );
      throw new Error(
        `Failed to identify user-facing changes: ${error.message}`
      );
    }
  }

  /**
   * Categorize changes into release notes categories (New Features, Improvements, Fixes)
   *
   * @param {Array} changes - Array of user-facing changes
   * @param {Object} options - Categorization options
   * @returns {Promise<Object>} Categorized changes object
   */
  async categorizeChanges(changes, options = {}) {
    try {
      console.log("ReleaseNotesService: Categorizing changes...");

      // Check cache first if enabled
      if (options.enablePerformanceOptimizations !== false) {
        const cachedResult = this.cache.getCachedCategorization(
          changes,
          options
        );
        if (cachedResult) {
          console.log("ReleaseNotesService: Using cached categorization");
          return cachedResult;
        }
      }

      // Use the dedicated categorizer for intelligent categorization
      const categorizedChanges = this.categorizer.categorizeChanges(changes);

      const categorized = {
        newFeatures: [],
        improvements: [],
        fixes: [],
      };

      // Group changes by their categorization results
      for (const change of categorizedChanges) {
        const category = change.categorization.category;

        if (categorized[category]) {
          categorized[category].push({
            ...change,
            category,
            confidence: change.categorization.confidence,
            reasoning: change.categorization.reasoning,
            alternatives: change.categorization.alternatives,
          });
        }
      }

      // Sort each category by confidence and impact
      Object.keys(categorized).forEach((category) => {
        categorized[category] = categorized[category]
          .sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
          .slice(0, this.config.maxEntriesPerCategory);
      });

      // Log categorization statistics
      const stats = this.categorizer.getCategorizationStatistics(changes);
      console.log("ReleaseNotesService: Categorization statistics:", {
        total: stats.total,
        distribution: stats.distribution,
        averageConfidence: stats.averageConfidence.toFixed(2),
        highConfidenceCount: stats.highConfidenceCount,
      });

      // Cache the result if enabled
      if (options.enablePerformanceOptimizations !== false) {
        this.cache.cacheCategorization(changes, categorized, {
          provider: options.provider,
          model: options.model,
          dataSize: changes.length,
        });
      }

      return categorized;
    } catch (error) {
      console.error(
        "ReleaseNotesService: Error categorizing changes:",
        error.message
      );
      throw new Error(`Failed to categorize changes: ${error.message}`);
    }
  }

  /**
   * Translate technical descriptions to user-friendly language
   *
   * @param {Object} categorizedChanges - Categorized changes object
   * @param {Object} options - Translation options
   * @returns {Promise<Object>} Changes with user-friendly descriptions
   */
  async translateToUserLanguage(categorizedChanges, options = {}) {
    try {
      console.log(
        "ReleaseNotesService: Translating to user-friendly language..."
      );

      // Check cache first if enabled
      if (options.enablePerformanceOptimizations !== false) {
        const cachedResult = this.cache.getCachedTranslation(
          categorizedChanges,
          options
        );
        if (cachedResult) {
          console.log("ReleaseNotesService: Using cached translation");
          return cachedResult;
        }
      }

      const translated = {};

      for (const [category, changes] of Object.entries(categorizedChanges)) {
        translated[category] = changes.map((change) => ({
          ...change,
          userFriendlyTitle: this._generateUserFriendlyTitle(change),
          userFriendlyDescription:
            this._generateUserFriendlyDescription(change),
          userValue: this._generateUserValueDescription(change),
          translationConfidence: 0.8, // Basic rule-based translation confidence
        }));
      }

      // Cache the result if enabled
      if (options.enablePerformanceOptimizations !== false) {
        this.cache.cacheTranslation(categorizedChanges, translated, {
          provider: options.provider,
          model: options.model,
          dataSize: Object.values(categorizedChanges).flat().length,
        });
      }

      return translated;
    } catch (error) {
      console.error(
        "ReleaseNotesService: Error translating to user language:",
        error.message
      );
      throw new Error(`Failed to translate to user language: ${error.message}`);
    }
  }

  /**
   * Generate release notes for a single chunk (used by incremental processor)
   * @private
   */
  async _generateReleaseNotesForChunk(dateRange, options, progressTracker) {
    // This is a simplified version of the main generation logic for chunks
    const startDate = this._formatDate(dateRange.start);
    const endDate = this._formatDate(dateRange.end);

    // Collect data for this chunk
    const { rawData, collectionErrors } =
      await this._collectDataFromSourcesWithErrorHandling(
        startDate,
        endDate,
        options,
        progressTracker
      );

    // Process the chunk data
    let finalChanges;
    if (this.llmAnalyzer && this.llmAnalyzer.config.enabled) {
      try {
        const llmAnalysis = await this._performLLMAnalysisWithRetry(
          rawData,
          {
            dateRange,
            teamSize: options.teamSize,
            productType: options.productType || "Software application",
          },
          progressTracker
        );

        finalChanges =
          llmAnalysis?.categorizedChanges ||
          (await this._performRuleBasedAnalysis(rawData));
      } catch (error) {
        finalChanges = await this._performRuleBasedAnalysis(rawData);
      }
    } else {
      finalChanges = await this._performRuleBasedAnalysis(rawData);
    }

    // Create chunk result
    return this._createReleaseNotesDocument(
      finalChanges,
      dateRange,
      options,
      rawData,
      { generationMethod: "chunk-processing" },
      collectionErrors
    );
  }

  /**
   * Collect data from all available sources with comprehensive error handling
   * @private
   */
  async _collectDataFromSourcesWithErrorHandling(
    startDate,
    endDate,
    options,
    progressTracker
  ) {
    const rawData = {};
    const errors = [];

    // GitHub data collection with optimization
    if (this.githubService) {
      try {
        if (progressTracker) {
          progressTracker.updateDataSourceProgress("github", "started");
        }

        console.log("ReleaseNotesService: Collecting GitHub data...");
        const repositories =
          options.repositories || this.config.teamRepositories;

        // Use optimized data collection if enabled
        if (options.enablePerformanceOptimizations !== false) {
          rawData.github =
            await this.dataOptimizer.optimizeGitHubDataCollection(
              this.githubService,
              startDate,
              endDate,
              repositories
            );
        } else {
          rawData.github = await this._collectWithTimeout(
            () =>
              this.githubService.getTeamActivity(
                startDate,
                endDate,
                repositories
              ),
            30000, // 30 second timeout
            "GitHub data collection"
          );
        }

        if (progressTracker) {
          progressTracker.updateDataSourceProgress("github", "completed", {
            repositories: repositories?.length || 0,
            dataPoints: this._countDataPoints(rawData.github),
          });
        }

        console.log("ReleaseNotesService: GitHub data collected successfully");
      } catch (error) {
        console.warn(
          "ReleaseNotesService: GitHub data collection failed:",
          error.message
        );
        const githubError = this._createDataSourceError(error, "github");
        errors.push(githubError);

        if (progressTracker) {
          progressTracker.handleDataSourceFailure("github", githubError);
        }
      }
    } else {
      console.log(
        "ReleaseNotesService: GitHub service not configured, skipping..."
      );
    }

    // Linear data collection with optimization
    if (this.linearService) {
      try {
        if (progressTracker) {
          progressTracker.updateDataSourceProgress("linear", "started");
        }

        console.log("ReleaseNotesService: Collecting Linear data...");
        const teamMembers = options.teamMembers || [];

        // Use optimized data collection if enabled
        if (options.enablePerformanceOptimizations !== false) {
          rawData.linear =
            await this.dataOptimizer.optimizeLinearDataCollection(
              this.linearService,
              startDate,
              endDate,
              teamMembers
            );
        } else {
          rawData.linear = await this._collectWithTimeout(
            () =>
              this.linearService.getIssuesInDateRange(
                startDate,
                endDate,
                teamMembers
              ),
            30000, // 30 second timeout
            "Linear data collection"
          );
        }

        if (progressTracker) {
          progressTracker.updateDataSourceProgress("linear", "completed", {
            teamMembers: teamMembers?.length || 0,
            dataPoints: this._countDataPoints(rawData.linear),
          });
        }

        console.log("ReleaseNotesService: Linear data collected successfully");
      } catch (error) {
        console.warn(
          "ReleaseNotesService: Linear data collection failed:",
          error.message
        );
        const linearError = this._createDataSourceError(error, "linear");
        errors.push(linearError);

        if (progressTracker) {
          progressTracker.handleDataSourceFailure("linear", linearError);
        }
      }
    } else {
      console.log(
        "ReleaseNotesService: Linear service not configured, skipping..."
      );
    }

    // Slack data collection with optimization
    if (this.slackService) {
      try {
        if (progressTracker) {
          progressTracker.updateDataSourceProgress("slack", "started");
        }

        console.log("ReleaseNotesService: Collecting Slack data...");
        const channels = options.channels || this.config.teamChannels;

        // Use optimized data collection if enabled
        if (options.enablePerformanceOptimizations !== false) {
          rawData.slack = await this.dataOptimizer.optimizeSlackDataCollection(
            this.slackService,
            startDate,
            endDate,
            channels
          );
        } else {
          rawData.slack = await this._collectWithTimeout(
            () =>
              this.slackService.getTeamChannelMessages(
                startDate,
                endDate,
                channels
              ),
            30000, // 30 second timeout
            "Slack data collection"
          );
        }

        if (progressTracker) {
          progressTracker.updateDataSourceProgress("slack", "completed", {
            channels: channels?.length || 0,
            dataPoints: this._countDataPoints(rawData.slack),
          });
        }

        console.log("ReleaseNotesService: Slack data collected successfully");
      } catch (error) {
        console.warn(
          "ReleaseNotesService: Slack data collection failed:",
          error.message
        );
        const slackError = this._createDataSourceError(error, "slack");
        errors.push(slackError);

        if (progressTracker) {
          progressTracker.handleDataSourceFailure("slack", slackError);
        }
      }
    } else {
      console.log(
        "ReleaseNotesService: Slack service not configured, skipping..."
      );
    }

    return { rawData, collectionErrors: errors };
  }

  /**
   * Collect data from all available sources (GitHub, Linear, Slack) - legacy method
   * @private
   */
  async _collectDataFromSources(startDate, endDate, options) {
    const { rawData } = await this._collectDataFromSourcesWithErrorHandling(
      startDate,
      endDate,
      options
    );
    return rawData;
  }

  /**
   * Extract changes from GitHub data (user impact will be determined later)
   * @private
   */
  _extractChangesFromGitHub(githubData) {
    const changes = [];

    // Process commits (user impact will be determined by UserImpactAnalyzer)
    if (githubData.commits) {
      githubData.commits.forEach((commit) => {
        changes.push({
          id: `github-commit-${commit.sha}`,
          title: commit.commit.message.split("\n")[0],
          description: commit.commit.message,
          source: "github",
          sourceType: "commit",
          sourceData: commit,
          confidence: this._calculateCommitConfidence(commit),
          impact: this._assessCommitImpact(commit),
          timestamp: commit.commit.author.date,
        });
      });
    }

    // Process pull requests (user impact will be determined by UserImpactAnalyzer)
    if (githubData.pullRequests) {
      githubData.pullRequests.forEach((pr) => {
        changes.push({
          id: `github-pr-${pr.id}`,
          title: pr.title,
          description: pr.body || pr.title,
          source: "github",
          sourceType: "pullRequest",
          sourceData: pr,
          confidence: this._calculatePRConfidence(pr),
          impact: this._assessPRImpact(pr),
          timestamp: pr.updated_at,
        });
      });
    }

    return changes;
  }

  /**
   * Extract changes from Linear data (user impact will be determined later)
   * @private
   */
  _extractChangesFromLinear(linearData) {
    const changes = [];

    linearData.forEach((issue) => {
      changes.push({
        id: `linear-issue-${issue.id}`,
        title: issue.title,
        description: issue.description || issue.title,
        source: "linear",
        sourceType: "issue",
        sourceData: issue,
        confidence: this._calculateIssueConfidence(issue),
        impact: this._assessIssueImpact(issue),
        timestamp: issue.updatedAt,
        labels: issue.labels?.nodes?.map((label) => label.name) || [],
        priority: issue.priority,
        state: issue.state?.name,
      });
    });

    return changes;
  }

  /**
   * Extract changes from Slack data (user impact will be determined later)
   * @private
   */
  _extractChangesFromSlack(slackData) {
    const changes = [];

    // Extract all messages (user impact will be determined by UserImpactAnalyzer)
    slackData.forEach((message) => {
      changes.push({
        id: `slack-message-${message.ts}`,
        title: this._extractSlackMessageTitle(message),
        description: message.text,
        source: "slack",
        sourceType: "message",
        sourceData: message,
        confidence: this._calculateSlackMessageConfidence(message),
        impact: this._assessSlackMessageImpact(message),
        timestamp: new Date(parseFloat(message.ts) * 1000).toISOString(),
        channel: message.channel,
        text: message.text, // Include for impact analysis
      });
    });

    return changes;
  }

  /**
   * Determine the category of a change (newFeatures, improvements, fixes)
   * @private
   */
  _determineChangeCategory(change) {
    const title = change.title.toLowerCase();
    const description = (change.description || "").toLowerCase();
    const labels = change.labels || [];

    // Check for bug fixes
    if (this._isBugFix(title, description, labels)) {
      return "fixes";
    }

    // Check for new features
    if (this._isNewFeature(title, description, labels)) {
      return "newFeatures";
    }

    // Default to improvements
    return "improvements";
  }

  /**
   * Check if a change is a bug fix
   * @private
   */
  _isBugFix(title, description, labels) {
    const bugKeywords = [
      "fix",
      "bug",
      "issue",
      "error",
      "crash",
      "broken",
      "resolve",
      "patch",
    ];
    const bugLabels = ["bug", "defect", "fix", "hotfix"];

    return (
      bugKeywords.some(
        (keyword) => title.includes(keyword) || description.includes(keyword)
      ) || labels.some((label) => bugLabels.includes(label.toLowerCase()))
    );
  }

  /**
   * Check if a change is a new feature
   * @private
   */
  _isNewFeature(title, description, labels) {
    const featureKeywords = [
      "add",
      "new",
      "feature",
      "implement",
      "create",
      "introduce",
    ];
    const featureLabels = ["feature", "enhancement", "new"];

    return (
      featureKeywords.some(
        (keyword) => title.includes(keyword) || description.includes(keyword)
      ) || labels.some((label) => featureLabels.includes(label.toLowerCase()))
    );
  }

  /**
   * Generate user-friendly title for a change
   * @private
   */
  _generateUserFriendlyTitle(change) {
    // Basic title cleanup - remove technical prefixes and jargon
    let title = change.title;

    // Remove common technical prefixes
    title = title.replace(
      /^(feat|fix|chore|docs|style|refactor|test):\s*/i,
      ""
    );
    title = title.replace(/^(WIP|DRAFT):\s*/i, "");

    // Capitalize first letter
    title = title.charAt(0).toUpperCase() + title.slice(1);

    return title;
  }

  /**
   * Generate user-friendly description for a change
   * @private
   */
  _generateUserFriendlyDescription(change) {
    // Basic description cleanup and simplification
    let description = change.description || change.title;

    // Remove technical details and focus on user impact
    description = description.replace(
      /\b(refactor|optimize|cleanup|lint|test)\b/gi,
      "improve"
    );
    description = description.replace(
      /\b(API|endpoint|service|component)\b/gi,
      "system"
    );

    return description;
  }

  /**
   * Generate user value description for a change
   * @private
   */
  _generateUserValueDescription(change) {
    const category = change.category;

    switch (category) {
      case "newFeatures":
        return "Adds new functionality to enhance your workflow";
      case "improvements":
        return "Makes existing features work better and faster";
      case "fixes":
        return "Resolves issues to provide a smoother experience";
      default:
        return "Improves the overall product experience";
    }
  }

  /**
   * Helper methods for determining user-facing nature of changes
   * @private
   */
  _isUserFacingCommit(commit) {
    const message = commit.commit.message.toLowerCase();
    const internalKeywords = [
      "refactor",
      "cleanup",
      "lint",
      "test",
      "ci",
      "build",
      "deps",
    ];

    return !internalKeywords.some((keyword) => message.includes(keyword));
  }

  _isUserFacingPR(pr) {
    const title = pr.title.toLowerCase();
    const internalKeywords = [
      "refactor",
      "cleanup",
      "lint",
      "test",
      "ci",
      "build",
      "deps",
      "internal",
    ];

    return !internalKeywords.some((keyword) => title.includes(keyword));
  }

  _isUserFacingIssue(issue) {
    const title = issue.title.toLowerCase();
    const labels = issue.labels?.nodes?.map((l) => l.name.toLowerCase()) || [];
    const internalLabels = [
      "internal",
      "tech-debt",
      "refactor",
      "infrastructure",
    ];

    return !internalLabels.some((label) => labels.includes(label));
  }

  _isUserFacingSlackMessage(message) {
    const text = message.text.toLowerCase();
    const releaseKeywords = [
      "release",
      "deploy",
      "ship",
      "launch",
      "feature",
      "update",
    ];

    return releaseKeywords.some((keyword) => text.includes(keyword));
  }

  /**
   * Helper methods for confidence calculation
   * @private
   */
  _calculateCommitConfidence(commit) {
    // Basic confidence based on commit message quality
    const message = commit.commit.message;
    return message.length > 20 ? 0.7 : 0.5;
  }

  _calculatePRConfidence(pr) {
    // Higher confidence for merged PRs with descriptions
    return pr.merged_at && pr.body ? 0.9 : 0.6;
  }

  _calculateIssueConfidence(issue) {
    // Higher confidence for completed issues with descriptions
    return issue.state?.type === "completed" && issue.description ? 0.9 : 0.7;
  }

  _calculateSlackMessageConfidence(message) {
    // Basic confidence for Slack messages
    return 0.6;
  }

  /**
   * Helper methods for impact assessment
   * @private
   */
  _assessCommitImpact(commit) {
    // Basic impact assessment based on files changed
    return "medium";
  }

  _assessPRImpact(pr) {
    // Impact based on PR size and changes
    const changes = (pr.additions || 0) + (pr.deletions || 0);
    if (changes > 500) return "high";
    if (changes > 100) return "medium";
    return "low";
  }

  /**
   * Get performance optimization metrics
   * @returns {Object} Performance metrics
   */
  getPerformanceMetrics() {
    return {
      cache: this.cache.getStats(),
      dataOptimizer: this.dataOptimizer.getMetrics(),
      incrementalProcessor: this.incrementalProcessor.getProcessingStats(),
    };
  }

  /**
   * Clear all performance caches
   */
  clearPerformanceCaches() {
    this.cache.clear();
    this.dataOptimizer.reset();
    this.incrementalProcessor.resetStats();
  }

  _assessIssueImpact(issue) {
    // Impact based on priority and labels
    if (issue.priority >= 3) return "high";
    if (issue.priority >= 2) return "medium";
    return "low";
  }

  _assessSlackMessageImpact(message) {
    return "medium";
  }

  /**
   * Extract title from Slack message
   * @private
   */
  _extractSlackMessageTitle(message) {
    const text = message.text;
    const firstLine = text.split("\n")[0];
    return firstLine.length > 50
      ? firstLine.substring(0, 50) + "..."
      : firstLine;
  }

  /**
   * Remove duplicate changes and filter by confidence threshold
   * @private
   */
  _deduplicateAndFilterChanges(changes) {
    // Simple deduplication based on title similarity
    const seen = new Set();
    const filtered = [];

    for (const change of changes) {
      const key = change.title.toLowerCase().trim();
      if (
        !seen.has(key) &&
        (change.confidence || 0) >= this.config.confidenceThreshold
      ) {
        seen.add(key);
        filtered.push(change);
      }
    }

    return filtered;
  }

  /**
   * Perform rule-based analysis as fallback
   * @private
   */
  async _performRuleBasedAnalysis(rawData) {
    // Identify user-facing changes from collected data
    const userFacingChanges = await this.identifyUserFacingChanges(rawData);

    console.log("ReleaseNotesService: Identified user-facing changes", {
      totalChanges: userFacingChanges.length,
    });

    // Categorize changes into release notes categories
    const categorizedChanges = await this.categorizeChanges(userFacingChanges);

    console.log("ReleaseNotesService: Categorized changes", {
      newFeatures: categorizedChanges.newFeatures?.length || 0,
      improvements: categorizedChanges.improvements?.length || 0,
      fixes: categorizedChanges.fixes?.length || 0,
    });

    // Translate technical descriptions to user-friendly language
    const translatedChanges = await this.translateToUserLanguage(
      categorizedChanges
    );

    return translatedChanges;
  }

  /**
   * Create the final release notes document
   * @private
   */
  _createReleaseNotesDocument(
    translatedChanges,
    dateRange,
    options,
    rawData,
    analysisMetadata = {},
    errors = []
  ) {
    // Convert translated changes to ReleaseNotesEntry instances
    const entries = {
      newFeatures: (translatedChanges.newFeatures || []).map((change) =>
        ReleaseNotesUtils.createEntryFromChange(change, {
          metadata: {
            generationMethod: analysisMetadata.generationMethod || "rule-based",
            llmProvider: analysisMetadata.llmProvider,
            llmModel: analysisMetadata.llmModel,
          },
        })
      ),
      improvements: (translatedChanges.improvements || []).map((change) =>
        ReleaseNotesUtils.createEntryFromChange(change, {
          metadata: {
            generationMethod: analysisMetadata.generationMethod || "rule-based",
            llmProvider: analysisMetadata.llmProvider,
            llmModel: analysisMetadata.llmModel,
          },
        })
      ),
      fixes: (translatedChanges.fixes || []).map((change) =>
        ReleaseNotesUtils.createEntryFromChange(change, {
          metadata: {
            generationMethod: analysisMetadata.generationMethod || "rule-based",
            llmProvider: analysisMetadata.llmProvider,
            llmModel: analysisMetadata.llmModel,
          },
        })
      ),
    };

    // Create the release notes document using the data model
    const document = new ReleaseNotesDocument({
      title:
        options.title ||
        `Release Notes - ${dateRange.start} to ${dateRange.end}`,
      dateRange,
      entries,
      metadata: {
        sources: this._getActiveSources(),
        generationMethod: analysisMetadata.generationMethod || "rule-based",
        llmProvider: analysisMetadata.llmProvider,
        llmModel: analysisMetadata.llmModel,
        analysisTime: analysisMetadata.analysisTime,
        rawDataSources: Object.keys(rawData).filter((key) => rawData[key]),
        errors: errors.length,
        errorSummary: errors.length > 0 ? this._summarizeErrors(errors) : null,
        degradationInfo:
          errors.length > 0 ? this._getDegradationInfo(errors, rawData) : null,
      },
    });

    return document;
  }

  /**
   * Get list of active data sources
   * @private
   */
  _getActiveSources() {
    const sources = [];
    if (this.githubService) sources.push("github");
    if (this.linearService) sources.push("linear");
    if (this.slackService) sources.push("slack");
    return sources;
  }

  /**
   * Calculate overall confidence for the release notes
   * @private
   */
  _calculateOverallConfidence(translatedChanges) {
    const allChanges = Object.values(translatedChanges).flat();
    if (allChanges.length === 0) return 0;

    const totalConfidence = allChanges.reduce(
      (sum, change) => sum + (change.confidence || 0),
      0
    );
    return totalConfidence / allChanges.length;
  }

  /**
   * Validate date range input
   * @private
   */
  _validateDateRange(dateRange) {
    if (!dateRange || !dateRange.start || !dateRange.end) {
      throw new Error("Date range with start and end dates is required");
    }

    const startDate = new Date(dateRange.start);
    const endDate = new Date(dateRange.end);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      throw new Error("Invalid date format in date range");
    }

    if (startDate >= endDate) {
      throw new Error("Start date must be before end date");
    }
  }

  /**
   * Format date for API calls
   * @private
   */
  _formatDate(dateString) {
    return dateString.includes("T") ? dateString : dateString + "T00:00:00Z";
  }

  /**
   * Perform LLM analysis with retry logic
   * @private
   */
  async _performLLMAnalysisWithRetry(
    rawData,
    context,
    progressTracker,
    maxRetries = 2
  ) {
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (progressTracker && attempt > 1) {
          progressTracker.updateStepProgress(
            3,
            0,
            `Retrying AI analysis (attempt ${attempt}/${maxRetries})...`
          );
        }

        const llmAnalysis = await this.llmAnalyzer.analyzeForReleaseNotes(
          rawData,
          context
        );
        return llmAnalysis;
      } catch (error) {
        lastError = error;
        console.warn(
          `ReleaseNotesService: LLM analysis attempt ${attempt} failed:`,
          error.message
        );

        // Check if we should retry
        if (attempt < maxRetries && this._shouldRetryLLMError(error)) {
          const delay = Math.pow(2, attempt - 1) * 1000; // Exponential backoff
          console.log(
            `ReleaseNotesService: Retrying LLM analysis in ${delay}ms...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        break;
      }
    }

    throw lastError;
  }

  /**
   * Check if LLM error should trigger a retry
   * @private
   */
  _shouldRetryLLMError(error) {
    const retryableErrors = [
      "timeout",
      "network",
      "connection",
      "rate limit",
      "temporary",
      "unavailable",
    ];

    const message = error.message?.toLowerCase() || "";
    return retryableErrors.some((keyword) => message.includes(keyword));
  }

  /**
   * Collect data with timeout
   * @private
   */
  async _collectWithTimeout(collectFn, timeoutMs, operationName) {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      try {
        const result = await collectFn();
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Create a data source specific error
   * @private
   */
  _createDataSourceError(error, source) {
    return {
      type: "DATA_SOURCE_ERROR",
      source,
      message: error.message,
      recoverable: this._isRecoverableError(error),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Check if an error is recoverable
   * @private
   */
  _isRecoverableError(error) {
    const recoverableKeywords = [
      "timeout",
      "network",
      "connection",
      "rate limit",
      "temporary",
      "unavailable",
    ];

    const message = error.message?.toLowerCase() || "";
    return recoverableKeywords.some((keyword) => message.includes(keyword));
  }

  /**
   * Count data points in collected data
   * @private
   */
  _countDataPoints(data) {
    if (!data) return 0;

    if (Array.isArray(data)) {
      return data.length;
    }

    if (typeof data === "object") {
      let count = 0;
      for (const key in data) {
        if (Array.isArray(data[key])) {
          count += data[key].length;
        }
      }
      return count;
    }

    return 0;
  }

  /**
   * Generate fallback release notes when primary generation fails
   * @private
   */
  async _generateFallbackReleaseNotes(partialData, dateRange, errors) {
    console.log("ReleaseNotesService: Generating fallback release notes...");

    const availableSources = Object.keys(partialData).filter(
      (key) => partialData[key]
    );
    const failedSources = errors
      .filter((err) => err.source)
      .map((err) => err.source);

    // Try to extract basic changes from available data
    let basicChanges = { newFeatures: [], improvements: [], fixes: [] };

    try {
      if (availableSources.length > 0 && this._hasValidData(partialData)) {
        const userFacingChanges = await this.identifyUserFacingChanges(
          partialData
        );
        if (Array.isArray(userFacingChanges) && userFacingChanges.length > 0) {
          basicChanges = await this.categorizeChanges(userFacingChanges);
        }
      }
    } catch (error) {
      console.warn(
        "ReleaseNotesService: Failed to process partial data for fallback:",
        error.message
      );
      // Continue with empty changes
    }

    return this._createReleaseNotesDocument(
      basicChanges,
      dateRange,
      {},
      partialData,
      {
        generationMethod: "fallback",
        errors: errors.length,
        availableSources,
        failedSources,
      },
      errors
    );
  }

  /**
   * Check if partial data contains valid data for processing
   * @private
   */
  _hasValidData(partialData) {
    if (!partialData || typeof partialData !== "object") {
      return false;
    }

    // Check if any data source has actual data
    for (const [source, data] of Object.entries(partialData)) {
      if (data) {
        if (Array.isArray(data) && data.length > 0) {
          return true;
        }
        if (typeof data === "object") {
          // Check for GitHub-style data structure
          if (
            data.commits &&
            Array.isArray(data.commits) &&
            data.commits.length > 0
          ) {
            return true;
          }
          if (
            data.pullRequests &&
            Array.isArray(data.pullRequests) &&
            data.pullRequests.length > 0
          ) {
            return true;
          }
          // Check for other data structures
          const hasData = Object.values(data).some(
            (value) => Array.isArray(value) && value.length > 0
          );
          if (hasData) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * Get service status for debugging
   */
  getServiceStatus() {
    return {
      github: !!this.githubService,
      linear: !!this.linearService,
      slack: !!this.slackService,
      llmAnalyzer: !!this.llmAnalyzer && this.llmAnalyzer.config.enabled,
      categorizer: !!this.categorizer,
      userImpactAnalyzer: !!this.userImpactAnalyzer,
      config: {
        confidenceThreshold: this.config.confidenceThreshold,
        maxEntriesPerCategory: this.config.maxEntriesPerCategory,
        includeInternalChanges: this.config.includeInternalChanges,
      },
      llmStatus: this.llmAnalyzer ? this.llmAnalyzer.getStatus() : null,
      categorizerStatus: this.categorizer
        ? this.categorizer.getConfiguration()
        : null,
      userImpactStatus: this.userImpactAnalyzer
        ? this.userImpactAnalyzer.getConfiguration()
        : null,
    };
  }

  /**
   * Summarize errors for metadata
   * @private
   */
  _summarizeErrors(errors) {
    const summary = {
      total: errors.length,
      bySource: {},
      byType: {},
      recoverable: 0,
    };

    errors.forEach((error) => {
      if (error.source) {
        summary.bySource[error.source] =
          (summary.bySource[error.source] || 0) + 1;
      }

      if (error.type) {
        summary.byType[error.type] = (summary.byType[error.type] || 0) + 1;
      }

      if (error.recoverable) {
        summary.recoverable++;
      }
    });

    return summary;
  }

  /**
   * Get degradation information
   * @private
   */
  _getDegradationInfo(errors, rawData) {
    const availableSources = Object.keys(rawData).filter((key) => rawData[key]);
    const failedSources = errors
      .filter((err) => err.source)
      .map((err) => err.source);

    const totalSources = ["github", "linear", "slack"];
    const workingSources = totalSources.filter(
      (source) => !failedSources.includes(source)
    );

    return {
      impact:
        workingSources.length === 0
          ? "critical"
          : workingSources.length === 1
          ? "high"
          : "medium",
      availableSources,
      failedSources,
      message:
        failedSources.length > 0
          ? `Release notes generated with ${workingSources.length} of ${
              totalSources.length
            } data sources. ${failedSources.join(", ")} unavailable.`
          : "All data sources available"
          ? this.userImpactAnalyzer.getConfiguration()
          : null,
    };
  }
}

export default ReleaseNotesService;
