import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import LinearService from "./services/linearService.js";
import SlackService from "./services/slackService.js";
import GitHubService from "./services/githubService.js";
import { LLMAnalyzer, LLMServiceFactory } from "./services/llm/index.js";
import { InsightMerger } from "./services/InsightMerger.js";
import {
  ProgressManager,
  DEFAULT_LLM_STEPS,
} from "./services/llm/ProgressTracker.js";
import { LLMErrorHandler } from "./services/llm/ErrorHandler.js";
import ExportService from "./services/ExportService.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize progress managers
const progressManager = new ProgressManager();
// In-memory result store for background generations
const generationResults = new Map();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get("/api/health", (req, res) => {
  res.json({ status: "Server is running!" });
});

// Test Linear connection
app.get("/api/test-linear", async (req, res) => {
  try {
    if (!process.env.LINEAR_API_KEY) {
      return res.status(400).json({
        error: "LINEAR_API_KEY not configured",
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
      status: "Linear connection successful!",
      user: data.viewer,
    });
  } catch (error) {
    console.error("Linear test failed:", error);
    res.status(500).json({
      error: "Linear connection failed: " + error.message,
    });
  }
});

// Test Slack connection
// Get configuration status without making API calls
app.get("/api/config-status", (req, res) => {
  const integrations = {
    LINEAR_API_KEY: !!process.env.LINEAR_API_KEY,
    GITHUB_TOKEN: !!process.env.GITHUB_TOKEN,
    SLACK_BOT_TOKEN: !!process.env.SLACK_BOT_TOKEN,
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4',
    LLM_PROVIDER: process.env.LLM_PROVIDER || 'openai',
    LLM_ENABLED: process.env.LLM_ENABLED !== 'false'
  };

  res.json({
    integrations,
    llmEnabled: integrations.LLM_ENABLED && integrations.OPENAI_API_KEY,
    hasAnyIntegration: integrations.LINEAR_API_KEY || integrations.GITHUB_TOKEN || integrations.SLACK_BOT_TOKEN
  });
});

app.get("/api/test-slack", async (req, res) => {
  try {
    if (!process.env.SLACK_BOT_TOKEN) {
      return res.status(400).json({
        error: "SLACK_BOT_TOKEN not configured",
      });
    }

    const slackService = new SlackService(process.env.SLACK_BOT_TOKEN);

    // Test with auth.test endpoint
    const data = await slackService.makeRequest("auth.test");
    res.json({
      status: "Slack connection successful!",
      team: data.team,
      user: data.user,
    });
  } catch (error) {
    console.error("Slack test failed:", error);
    res.status(500).json({
      error: "Slack connection failed: " + error.message,
    });
  }
});

// Test GitHub connection
app.get("/api/test-github", async (req, res) => {
  try {
    if (!process.env.GITHUB_TOKEN) {
      return res.status(400).json({
        error: "GITHUB_TOKEN not configured",
      });
    }

    const githubService = new GitHubService(process.env.GITHUB_TOKEN);

    // Test with user endpoint
    const data = await githubService.makeRequest("/user");
    res.json({
      status: "GitHub connection successful!",
      user: data.login,
      name: data.name,
    });
  } catch (error) {
    console.error("GitHub test failed:", error);
    res.status(500).json({
      error: "GitHub connection failed: " + error.message,
    });
  }
});



// Test LLM connection and configuration
app.get("/api/test-llm", async (req, res) => {
  try {
    // Get configuration status first
    const llmAnalyzer = LLMAnalyzer.fromEnvironment(process.env);
    const status = llmAnalyzer.getStatus();

    // If LLM is not enabled, return configuration info
    if (!status.enabled) {
      return res.json({
        status: "LLM analysis is disabled",
        enabled: false,
        configuration: {
          provider: status.provider || "none",
          configured: false,
          availableProviders: LLMServiceFactory.getAvailableProviders(),
        },
        message:
          "LLM analysis is disabled. Set LLM_PROVIDER environment variable to enable.",
      });
    }

    // If not properly configured, return configuration error
    if (!status.initialized) {
      return res.status(400).json({
        error: "LLM not properly configured",
        enabled: status.enabled,
        configuration: {
          provider: status.provider || "none",
          configured: false,
          availableProviders: LLMServiceFactory.getAvailableProviders(),
          issues: [
            "Provider not initialized - check API keys and configuration",
          ],
        },
        message: "LLM configuration incomplete. Check environment variables.",
      });
    }

    // Test the configuration
    const result = await llmAnalyzer.testConfiguration();

    if (result.success) {
      res.json({
        status: "LLM connection successful!",
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
          components: status.components,
        },
        warning: result.warning || null,
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
          issues: [result.error || result.message],
        },
        details: result.error,
      });
    }
  } catch (error) {
    console.error("LLM test failed:", error);
    res.status(500).json({
      error: "LLM test failed: " + error.message,
      enabled: false,
      configuration: {
        provider: "unknown",
        configured: false,
        availableProviders: LLMServiceFactory.getAvailableProviders(),
        issues: [error.message],
      },
    });
  }
});

// Test specific LLM provider configuration
app.post("/api/test-llm", async (req, res) => {
  try {
    const { provider, apiKey, model, ...otherConfig } = req.body;

    if (!provider) {
      return res.status(400).json({
        error: "Provider is required",
        availableProviders: LLMServiceFactory.getAvailableProviders(),
      });
    }

    // Create test configuration
    const testConfig = {
      provider,
      apiKey,
      model,
      enabled: true,
      ...otherConfig,
    };

    // Validate configuration first
    try {
      LLMServiceFactory.validateConfig(testConfig);
    } catch (validationError) {
      return res.status(400).json({
        error: "Configuration validation failed",
        provider: provider,
        details: validationError.message,
        availableProviders: LLMServiceFactory.getAvailableProviders(),
      });
    }

    // Test the provider
    const result = await LLMServiceFactory.testProvider(testConfig);

    if (result.success) {
      res.json({
        status: "Provider test successful!",
        provider: result.provider,
        model: result.model,
        message: result.message,
        configuration: {
          valid: true,
          provider: testConfig.provider,
          model: testConfig.model,
        },
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
          issues: [result.error || result.message],
        },
      });
    }
  } catch (error) {
    console.error("LLM provider test failed:", error);
    res.status(500).json({
      error: "Provider test failed: " + error.message,
      availableProviders: LLMServiceFactory.getAvailableProviders(),
    });
  }
});

// Get LLM performance metrics
app.get("/api/llm-performance", async (req, res) => {
  try {
    // Create LLM analyzer to get performance metrics
    const llmAnalyzer = LLMAnalyzer.fromEnvironment(process.env);

    if (!llmAnalyzer.config.enabled) {
      return res.json({
        enabled: false,
        message: "LLM analysis is not enabled",
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
        recentRequests: metrics.recentRequests,
      },
      recommendations,
      lastUpdated: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error getting LLM performance metrics:", error);
    res.status(500).json({
      error: "Failed to get performance metrics: " + error.message,
    });
  }
});

// Reset LLM performance metrics
app.post("/api/llm-performance/reset", async (req, res) => {
  try {
    const llmAnalyzer = LLMAnalyzer.fromEnvironment(process.env);

    if (!llmAnalyzer.config.enabled) {
      return res.status(400).json({
        error: "LLM analysis is not enabled",
      });
    }

    llmAnalyzer.resetPerformanceMetrics();

    res.json({
      status: "Performance metrics reset successfully",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error resetting LLM performance metrics:", error);
    res.status(500).json({
      error: "Failed to reset performance metrics: " + error.message,
    });
  }
});

// Get progress for a specific session
app.get("/api/progress/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    const tracker = progressManager.getTracker(sessionId);

    if (!tracker) {
      return res.status(404).json({
        error: "Progress session not found",
        sessionId,
      });
    }

    const status = tracker.getStatus();
    res.json(status);
  } catch (error) {
    console.error("Error getting progress:", error);
    res.status(500).json({
      error: "Failed to get progress: " + error.message,
    });
  }
});

// Start background retro generation (non-blocking)
app.post("/api/generate-retro/start", async (req, res) => {
  try {
    const { dateRange, teamMembers = [], sessionId, useDemo, demoVariant } = req.body || {};

    // Don't require LINEAR_API_KEY if in demo mode
    if (!useDemo && !process.env.LINEAR_API_KEY) {
      return res.status(400).json({
        error:
          "LINEAR_API_KEY not configured. Please add it to your .env file.",
      });
    }

    if (!dateRange || !dateRange.start || !dateRange.end) {
      return res.status(400).json({ error: "Invalid or missing dateRange" });
    }

    const sid = sessionId || `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    // Kick off background job without awaiting
    setTimeout(() => {
      runRetroGeneration(sid, dateRange, teamMembers, useDemo, demoVariant).catch((error) => {
        console.error("Background generation failed:", error);
        generationResults.set(sid, {
          status: "failed",
          error: error.message,
          timestamp: new Date().toISOString(),
        });
        // Ensure tracker also reflects failure if it exists
        const tracker = progressManager.getTracker(sid);
        if (tracker) {
          try { tracker.fail(error); } catch {}
        }
        // Cleanup after some time
        setTimeout(() => generationResults.delete(sid), 60 * 60 * 1000);
      });
    }, 0);

    return res.status(202).json({ sessionId: sid, status: "accepted" });
  } catch (error) {
    console.error("Error starting background generation:", error);
    res.status(500).json({ error: "Failed to start generation: " + error.message });
  }
});

// Get background generation result
app.get("/api/generate-retro/result/:sessionId", (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = generationResults.get(sessionId);

    if (result && result.status === "completed" && result.retroData) {
      return res.json(result.retroData);
    }

    if (result && result.status === "failed") {
      return res.status(500).json({ error: result.error || "Generation failed" });
    }

    const tracker = progressManager.getTracker(sessionId);
    if (tracker && !tracker.completed) {
      return res.status(202).json({ status: "pending" });
    }

    return res.status(404).json({ error: "Result not found for session", sessionId });
  } catch (error) {
    console.error("Error getting background result:", error);
    res.status(500).json({ error: "Failed to get result: " + error.message });
  }
});

// Generate retro endpoint
app.post("/api/generate-retro", async (req, res) => {
  try {
    const { dateRange, teamMembers, sessionId, useDemo, demoVariant } = req.body;

    console.log("Generating retro for:", { dateRange, teamMembers, useDemo });

    // Check which integration keys are available
    const hasLinearKey = !!process.env.LINEAR_API_KEY;
    const hasGithubKey = !!process.env.GITHUB_TOKEN;
    const hasSlackKey = !!process.env.SLACK_BOT_TOKEN;
    const hasAnyIntegration = hasLinearKey || hasGithubKey || hasSlackKey;
    
    // Initialize LLM analyzer and check if OpenAI is configured
    const llmAnalyzer = LLMAnalyzer.fromEnvironment(process.env);
    const llmEnabled = llmAnalyzer.config.enabled;

    console.log(`Integration status: Linear=${hasLinearKey}, GitHub=${hasGithubKey}, Slack=${hasSlackKey}, LLM=${llmEnabled}`);

    // Determine behavior based on keys available
    // 1. If demo mode explicitly requested, always use demo insights
    if (useDemo === true) {
      try {
        const fs = await import('fs');
        const path = await import('path');
        const insightsPath = new URL('./sample-data/demo.insights.json', import.meta.url).pathname;
        const demoInsights = JSON.parse(fs.readFileSync(insightsPath, 'utf-8'));
        
        // Add metadata
        const retroData = {
          ...demoInsights,
          analysisMetadata: {
            demoMode: true,
            demoVariant: demoVariant === 'small' ? 'small' : 'large',
            generatedAt: new Date().toISOString(),
            dateRange: dateRange,
            teamMembers: teamMembers,
            insightCount: {
              wentWell: demoInsights.wentWell.length,
              didntGoWell: demoInsights.didntGoWell.length,
              actionItems: demoInsights.actionItems.length
            },
            dataSources: ["github", "linear", "slack"],
            analysisType: "demo_insights"
          }
        };

        if (progressTracker) {
          progressTracker.complete();
        }
        return res.json(retroData);
      } catch (e) {
        console.error('Demo mode failed:', e);
        if (progressTracker) {
          progressTracker.fail(e);
        }
        return res.status(500).json({ error: 'Failed to generate demo insights: ' + e.message });
      }
    }

    // 2. If no integrations AND no OpenAI, use demo insights
    if (!hasAnyIntegration && !llmEnabled) {
      console.log("No integrations or OpenAI configured, returning demo insights");
      try {
        const fs = await import('fs');
        const path = await import('path');
        const insightsPath = new URL('./sample-data/demo.insights.json', import.meta.url).pathname;
        const demoInsights = JSON.parse(fs.readFileSync(insightsPath, 'utf-8'));
        
        const retroData = {
          ...demoInsights,
          analysisMetadata: {
            demoMode: true,
            demoVariant: 'fallback',
            generatedAt: new Date().toISOString(),
            dateRange: dateRange,
            teamMembers: teamMembers,
            insightCount: {
              wentWell: demoInsights.wentWell.length,
              didntGoWell: demoInsights.didntGoWell.length,
              actionItems: demoInsights.actionItems.length
            },
            dataSources: ["demo"],
            analysisType: "demo_insights",
            reason: "No integration keys or OpenAI configured"
          }
        };

        if (progressTracker) {
          progressTracker.complete();
        }
        return res.json(retroData);
      } catch (e) {
        console.error('Fallback demo mode failed:', e);
        if (progressTracker) {
          progressTracker.fail(e);
        }
        return res.status(500).json({ error: 'Failed to load demo insights: ' + e.message });
      }
    }

    // Initialize services based on available keys
    let linearService = null;
    let slackService = null;
    let githubService = null;
    
    if (hasLinearKey) {
      linearService = new LinearService(process.env.LINEAR_API_KEY);
    }
    if (hasSlackKey) {
      slackService = new SlackService(process.env.SLACK_BOT_TOKEN);
    }
    if (hasGithubKey) {
      githubService = new GitHubService(process.env.GITHUB_TOKEN);
    }

    // Create progress tracker if sessionId provided
    let progressTracker = null;
    if (sessionId) {
      progressTracker = progressManager.createTracker(
        sessionId,
        llmEnabled ? DEFAULT_LLM_STEPS : [
          { name: 'initialization', description: 'Initializing analysis' },
          { name: 'complete', description: 'Analysis complete' }
        ]
      );
      console.log(`Created progress tracker for session: ${sessionId}`);
    }

    // Prepare date range strings - handle both date-only and full ISO strings
    const startDate = dateRange.start.includes("T")
      ? dateRange.start
      : dateRange.start + "T00:00:00Z";
    const endDate = dateRange.end.includes("T")
      ? dateRange.end
      : dateRange.end + "T23:59:59Z";

    // Initialize retro data
    let retroData = { wentWell: [], didntGoWell: [], actionItems: [] };

    // 3. If no integrations but OpenAI is available, generate AI insights with sample data
    if (!hasAnyIntegration && llmEnabled) {
      console.log("No integrations but OpenAI available, using sample data for AI analysis");
      try {
        const fs = await import('fs');
        const path = await import('path');
        const base = new URL('./sample-data', import.meta.url).pathname;
        
        // Load sample data
        const variantSuffix = 'sample.large';
        const linearData = JSON.parse(fs.readFileSync(path.join(base, `linear.issues.${variantSuffix}.json`), 'utf-8'));
        const githubData = JSON.parse(fs.readFileSync(path.join(base, `github.activity.${variantSuffix}.json`), 'utf-8'));
        const slackData = JSON.parse(fs.readFileSync(path.join(base, `slack.messages.${variantSuffix}.json`), 'utf-8'));
        
        // Run LLM analysis on sample data
        const llmInsights = await llmAnalyzer.analyzeTeamData(
          githubData,
          linearData.issues,
          slackData.messages,
          dateRange,
          {
            teamSize: teamMembers?.length || 5,
            repositories: ["sample/app"],
            channels: ["dev", "general"],
          },
          progressTracker
        );
        
        if (llmInsights) {
          retroData = {
            ...llmInsights,
            analysisMetadata: {
              ...llmInsights.analysisMetadata,
              dataSources: ["sample_github", "sample_linear", "sample_slack"],
              sampleDataUsed: true,
              reason: "No integration keys configured, using sample data with AI"
            }
          };
        } else {
          // Fallback to demo insights if LLM fails
          const insightsPath = new URL('./sample-data/demo.insights.json', import.meta.url).pathname;
          const demoInsights = JSON.parse(fs.readFileSync(insightsPath, 'utf-8'));
          retroData = {
            ...demoInsights,
            analysisMetadata: {
              demoMode: true,
              reason: "LLM analysis of sample data failed"
            }
          };
        }
      } catch (error) {
        console.error("Sample data LLM analysis failed:", error);
        // Fallback to demo insights
        try {
          const fs = await import('fs');
          const path = await import('path');
          const insightsPath = new URL('./sample-data/demo.insights.json', import.meta.url).pathname;
          const demoInsights = JSON.parse(fs.readFileSync(insightsPath, 'utf-8'));
          retroData = {
            ...demoInsights,
            analysisMetadata: {
              demoMode: true,
              reason: "Error during sample data analysis"
            }
          };
        } catch (e) {
          return res.status(500).json({ error: 'Failed to generate insights: ' + error.message });
        }
      }
    } 
    // 4. If some integrations are missing but OpenAI is present, use available integrations
    else if (llmEnabled) {
      try {
        console.log("Running LLM analysis with available integrations...");
        
        // Load sample data for missing integrations
        const fs = await import('fs');
        const path = await import('path');
        const base = new URL('./sample-data', import.meta.url).pathname;
        const variantSuffix = 'sample.large';
        
        // Prepare data from available sources or samples
        let githubData = null;
        let linearIssues = null;
        let slackMessages = null;
        
        // GitHub data
        if (githubService) {
          try {
            const { commits, pullRequests } = await githubService.getTeamActivity(startDate, endDate);
            githubData = { commits, pullRequests };
            console.log(`Using real GitHub data: ${commits.length} commits, ${pullRequests.length} PRs`);
          } catch (e) {
            console.warn("GitHub fetch failed, using sample data:", e.message);
            githubData = JSON.parse(fs.readFileSync(path.join(base, `github.activity.${variantSuffix}.json`), 'utf-8'));
          }
        } else {
          console.log("No GitHub key, using sample data");
          githubData = JSON.parse(fs.readFileSync(path.join(base, `github.activity.${variantSuffix}.json`), 'utf-8'));
        }
        
        // Linear data
        if (linearService) {
          try {
            linearIssues = await linearService.getIssuesInDateRange(startDate, endDate, teamMembers);
            console.log(`Using real Linear data: ${linearIssues.length} issues`);
          } catch (e) {
            console.warn("Linear fetch failed, using sample data:", e.message);
            const linearData = JSON.parse(fs.readFileSync(path.join(base, `linear.issues.${variantSuffix}.json`), 'utf-8'));
            linearIssues = linearData.issues;
          }
        } else {
          console.log("No Linear key, using sample data");
          const linearData = JSON.parse(fs.readFileSync(path.join(base, `linear.issues.${variantSuffix}.json`), 'utf-8'));
          linearIssues = linearData.issues;
        }
        
        // Slack data
        if (slackService) {
          try {
            slackMessages = await slackService.getTeamChannelMessages(startDate, endDate);
            console.log(`Using real Slack data: ${slackMessages.length} messages`);
          } catch (e) {
            console.warn("Slack fetch failed, using sample data:", e.message);
            const slackData = JSON.parse(fs.readFileSync(path.join(base, `slack.messages.${variantSuffix}.json`), 'utf-8'));
            slackMessages = slackData.messages;
          }
        } else {
          console.log("No Slack key, using sample data");
          const slackData = JSON.parse(fs.readFileSync(path.join(base, `slack.messages.${variantSuffix}.json`), 'utf-8'));
          slackMessages = slackData.messages;
        }
        
        // Run LLM analysis
        const llmInsights = await llmAnalyzer.analyzeTeamData(
          githubData,
          linearIssues,
          slackMessages,
          dateRange,
          {
            teamSize: teamMembers?.length,
            repositories: process.env.GITHUB_REPOS?.split(",") || ["sample/app"],
            channels: process.env.SLACK_CHANNELS?.split(",") || ["dev", "general"],
          },
          progressTracker
        );
        
        if (llmInsights) {
          retroData = {
            ...llmInsights,
            analysisMetadata: {
              ...llmInsights.analysisMetadata,
              dataSources: {
                github: hasGithubKey ? "real" : "sample",
                linear: hasLinearKey ? "real" : "sample", 
                slack: hasSlackKey ? "real" : "sample"
              },
              mixedDataSources: true
            }
          };
        } else {
          console.warn("LLM analysis returned null");
          retroData = { wentWell: [], didntGoWell: [], actionItems: [] };
        }
      } catch (error) {
        console.error("LLM analysis failed:", error.message);
        retroData = { wentWell: [], didntGoWell: [], actionItems: [] };
      }
    }
    // 5. If only integrations but no OpenAI, return demo insights  
    else {
      console.log("No OpenAI configured, using demo insights");
      try {
        const fs = await import('fs');
        const path = await import('path');
        const insightsPath = new URL('./sample-data/demo.insights.json', import.meta.url).pathname;
        const demoInsights = JSON.parse(fs.readFileSync(insightsPath, 'utf-8'));
        
        retroData = {
          ...demoInsights,
          analysisMetadata: {
            demoMode: true,
            reason: "OpenAI not configured",
            dataSources: ["demo"],
            analysisType: "demo_insights"
          }
        };
      } catch (e) {
        console.error('Loading demo insights failed:', e);
        retroData = { wentWell: [], didntGoWell: [], actionItems: [] };
      }
    }

    // Add analysis metadata
    retroData.analysisMetadata = {
      ...retroData.analysisMetadata,
      ruleBasedAnalysisUsed:
        !llmEnabled || !retroData.analysisMetadata?.llmAnalysisUsed,
      llmAnalysisUsed:
        llmEnabled && retroData.analysisMetadata?.llmAnalysisUsed,
      llmEnabled: llmEnabled,
      generatedAt: new Date().toISOString(),
      dateRange: dateRange,
      teamMembers: teamMembers,
    };

    // Add fallback content if no meaningful data found
    if (
      retroData.wentWell.length === 0 &&
      retroData.didntGoWell.length === 0 &&
      retroData.actionItems.length === 0
    ) {
      retroData.wentWell.push({
        title: "Data collection completed successfully",
        details:
          "Successfully gathered team data from configured sources for analysis.",
        source: "system",
        confidence: 1.0,
        category: "technical",
      });
      retroData.didntGoWell.push({
        title: "Limited data available for analysis",
        details:
          "Consider expanding the date range or checking data source configurations.",
        source: "system",
        confidence: 0.8,
        category: "process",
      });
      retroData.actionItems.push({
        title: "Review data source configuration",
        details:
          "Ensure all team data sources are properly configured and accessible.",
        source: "system",
        priority: "medium",
        category: "process",
      });
    }

    console.log("Generated retro data:", {
      wentWell: retroData.wentWell.length,
      didntGoWell: retroData.didntGoWell.length,
      actionItems: retroData.actionItems.length,
      llmUsed: retroData.analysisMetadata.llmAnalysisUsed,
      ruleBasedUsed: retroData.analysisMetadata.ruleBasedAnalysisUsed,
      analysisType: llmEnabled ? "LLM-powered" : "Rule-based",
    });

    // Complete the progress tracker before sending response
    if (progressTracker) {
      progressTracker.complete();
    }

    res.json(retroData);
  } catch (error) {
    console.error("Error generating retro:", error);
    // Mark progress tracker as failed
    if (progressTracker) {
      progressTracker.fail(error);
    }
    res.status(500).json({
      error: "Failed to generate retro: " + error.message,
    });
  }
});

// Filter insights endpoint
app.post("/api/filter-insights", async (req, res) => {
  try {
    const { insights, filters = {}, sortOptions = {} } = req.body;

    if (!insights || typeof insights !== "object") {
      return res.status(400).json({
        error: "Invalid insights data provided",
      });
    }

    // Create insight merger with categorization enabled
    const merger = new InsightMerger({
      enableCategorization: true,
      categorizerConfig: {
        enableAutoCategories: true,
      },
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
      ...(sortedInsights.actionItems || []),
    ];

    const categorizer = merger.categorizer;
    const categoryStats = categorizer
      ? categorizer.getCategoryStatistics(allInsights)
      : {};

    res.json({
      ...sortedInsights,
      categoryStatistics: categoryStats,
      availableCategories: merger.getAvailableCategories(),
      filterMetadata: {
        filtersApplied: Object.keys(filters).length > 0,
        sortingApplied: Object.keys(sortOptions).length > 0,
        totalInsights: allInsights.length,
        processedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error filtering insights:", error);
    res.status(500).json({
      error: "Failed to filter insights: " + error.message,
    });
  }
});

// Get available categories endpoint
app.get("/api/insight-categories", (req, res) => {
  try {
    const merger = new InsightMerger({
      enableCategorization: true,
    });

    const categories = merger.getAvailableCategories();

    res.json({
      categories,
      metadata: {
        total: categories.length,
        retrievedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("Error getting categories:", error);
    res.status(500).json({
      error: "Failed to get categories: " + error.message,
    });
  }
});

// Export retro insights endpoint
app.post("/api/export-retro", (req, res) => {
  try {
    const { retroData, format = "markdown", options = {} } = req.body;

    if (!retroData || typeof retroData !== "object") {
      return res.status(400).json({
        error: "Invalid retro data provided",
      });
    }

    const exportService = new ExportService();
    let exportedContent;
    let contentType;
    let filename;

    switch (format.toLowerCase()) {
      case "markdown":
      case "md":
        exportedContent = exportService.exportToMarkdown(retroData, options);
        contentType = "text/markdown";
        filename = `retro-${new Date().toISOString().split("T")[0]}.md`;
        break;

      case "json":
        exportedContent = exportService.exportToJSON(retroData, options);
        contentType = "application/json";
        filename = `retro-${new Date().toISOString().split("T")[0]}.json`;
        break;

      case "csv":
        exportedContent = exportService.exportToCSV(retroData, options);
        contentType = "text/csv";
        filename = `retro-${new Date().toISOString().split("T")[0]}.csv`;
        break;

      default:
        return res.status(400).json({
          error: "Unsupported format. Supported formats: markdown, json, csv",
        });
    }

    // Set appropriate headers for download
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", Buffer.byteLength(exportedContent, "utf8"));

    res.send(exportedContent);
  } catch (error) {
    console.error("Error exporting retro:", error);
    res.status(500).json({
      error: "Failed to export retro: " + error.message,
    });
  }
});

// Get export preview endpoint (for UI preview without download)
app.post("/api/export-retro/preview", (req, res) => {
  try {
    const { retroData, format = "markdown", options = {} } = req.body;

    if (!retroData || typeof retroData !== "object") {
      return res.status(400).json({
        error: "Invalid retro data provided",
      });
    }

    const exportService = new ExportService();
    let preview;
    let metadata = {
      format,
      generatedAt: new Date().toISOString(),
      options,
    };

    switch (format.toLowerCase()) {
      case "markdown":
      case "md":
        preview = exportService.exportToMarkdown(retroData, options);
        metadata.contentType = "text/markdown";
        break;

      case "json":
        preview = exportService.exportToJSON(retroData, options);
        metadata.contentType = "application/json";
        break;

      case "csv":
        preview = exportService.exportToCSV(retroData, options);
        metadata.contentType = "text/csv";
        break;

      default:
        return res.status(400).json({
          error: "Unsupported format. Supported formats: markdown, json, csv",
        });
    }

    res.json({
      preview,
      metadata,
      stats: {
        size: Buffer.byteLength(preview, "utf8"),
        lines: preview.split("\n").length,
        totalInsights:
          (retroData.wentWell?.length || 0) +
          (retroData.didntGoWell?.length || 0) +
          (retroData.actionItems?.length || 0),
      },
    });
  } catch (error) {
    console.error("Error generating export preview:", error);
    res.status(500).json({
      error: "Failed to generate export preview: " + error.message,
    });
  }
});

/**
 * Perform rule-based analysis from all configured sources
 */
async function performRuleBasedAnalysis(
  linearService,
  slackService,
  githubService,
  startDate,
  endDate,
  teamMembers
) {
  console.log("Starting rule-based analysis...");

  // Fetch Linear issues
  console.log("Fetching Linear issues...");
  const issues = await linearService.getIssuesInDateRange(
    startDate,
    endDate,
    teamMembers
  );
  console.log(`Found ${issues.length} Linear issues`);

  // Analyze Linear issues for retro insights
  const linearRetroData = linearService.analyzeIssuesForRetro(issues);

  // Fetch and analyze Slack messages if available
  let slackRetroData = { wentWell: [], didntGoWell: [], actionItems: [] };
  if (slackService) {
    try {
      console.log("Fetching Slack messages...");
      const messages = await slackService.getTeamChannelMessages(
        startDate,
        endDate
      );
      console.log(`Found ${messages.length} Slack messages`);
      slackRetroData = slackService.analyzeMessagesForRetro(messages);
    } catch (error) {
      console.warn("Slack analysis failed:", error.message);
    }
  }

  // Fetch and analyze GitHub activity if available
  let githubRetroData = { wentWell: [], didntGoWell: [], actionItems: [] };
  if (githubService) {
    try {
      console.log("Fetching GitHub activity...");
      const { commits, pullRequests } = await githubService.getTeamActivity(
        startDate,
        endDate
      );
      console.log(
        `Found ${commits.length} commits and ${pullRequests.length} PRs`
      );
      githubRetroData = githubService.analyzeActivityForRetro(
        commits,
        pullRequests
      );
    } catch (error) {
      console.warn("GitHub analysis failed:", error.message);
    }
  }

  // Combine rule-based insights from all sources
  const ruleBasedInsights = {
    wentWell: [
      ...linearRetroData.wentWell,
      ...slackRetroData.wentWell,
      ...githubRetroData.wentWell,
    ],
    didntGoWell: [
      ...linearRetroData.didntGoWell,
      ...slackRetroData.didntGoWell,
      ...githubRetroData.didntGoWell,
    ],
    actionItems: [
      ...linearRetroData.actionItems,
      ...slackRetroData.actionItems,
      ...githubRetroData.actionItems,
    ],
  };

  console.log("Rule-based analysis completed:", {
    wentWell: ruleBasedInsights.wentWell.length,
    didntGoWell: ruleBasedInsights.didntGoWell.length,
    actionItems: ruleBasedInsights.actionItems.length,
  });

  return ruleBasedInsights;
}

/**
 * Perform LLM analysis if enabled and configured
 */
async function performLLMAnalysis(
  llmAnalyzer,
  linearService,
  slackService,
  githubService,
  startDate,
  endDate,
  dateRange,
  teamMembers,
  progressTracker = null
) {
  console.log("Starting LLM analysis...");

  try {
    // Fetch Linear issues for LLM analysis
    const issues = await linearService.getIssuesInDateRange(
      startDate,
      endDate,
      teamMembers
    );

    // Prepare GitHub data for LLM
    let githubData = null;
    if (githubService) {
      try {
        const { commits, pullRequests } = await githubService.getTeamActivity(
          startDate,
          endDate
        );
        githubData = { commits, pullRequests };
        console.log(
          `Prepared ${commits.length} commits and ${pullRequests.length} PRs for LLM analysis`
        );
      } catch (error) {
        console.warn("GitHub data collection for LLM failed:", error.message);
      }
    }

    // Prepare Slack data for LLM
    let slackData = null;
    if (slackService) {
      try {
        slackData = await slackService.getTeamChannelMessages(
          startDate,
          endDate
        );
        console.log(`Prepared ${slackData.length} messages for LLM analysis`);
      } catch (error) {
        console.warn("Slack data collection for LLM failed:", error.message);
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
        repositories: process.env.GITHUB_REPOS?.split(",") || [],
        channels: process.env.SLACK_CHANNELS?.split(",") || [],
      },
      progressTracker
    );

    if (llmInsights) {
      console.log("LLM analysis completed:", {
        wentWell: llmInsights.wentWell.length,
        didntGoWell: llmInsights.didntGoWell.length,
        actionItems: llmInsights.actionItems.length,
      });
      return llmInsights;
    } else {
      console.log("LLM analysis returned null, no insights generated");
      return null;
    }
  } catch (error) {
    console.warn("LLM analysis failed:", error.message);
    throw error; // Re-throw to be caught by Promise.allSettled
  }
}

/**
 * Add fallback content if no meaningful insights were generated
 */
function addFallbackContent(retroData, ruleBasedInsights, llmInsights) {
  // Count total insights from original sources
  const totalRuleInsights =
    (ruleBasedInsights.wentWell?.length || 0) +
    (ruleBasedInsights.didntGoWell?.length || 0) +
    (ruleBasedInsights.actionItems?.length || 0);

  const totalLLMInsights =
    (llmInsights.wentWell?.length || 0) +
    (llmInsights.didntGoWell?.length || 0) +
    (llmInsights.actionItems?.length || 0);

  // Add fallback content if no meaningful data found
  if (retroData.wentWell.length === 0 && retroData.didntGoWell.length === 0) {
    retroData.wentWell.push({
      title: "Team stayed active",
      details: `Tracked activity during this period (${totalRuleInsights} rule-based insights, ${totalLLMInsights} AI insights generated)`,
      source: "system",
      confidence: 0.5,
    });
  }

  if (retroData.actionItems.length === 0) {
    retroData.actionItems.push({
      title: "Continue tracking team activities",
      priority: "low",
      assignee: "team",
      details: "Keep using the configured tools for better retro insights",
      source: "system",
      confidence: 0.5,
    });
  }
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

/**
 * Run retro generation as a background job and store the result by sessionId
 */
async function runRetroGeneration(sessionId, dateRange, teamMembers, useDemo, demoVariant) {
  try {
    console.log("[bg] Starting generation for:", { dateRange, teamMembers, sessionId, useDemo });

    // Create progress tracker
    let progressTracker = progressManager.createTracker(
      sessionId,
      DEFAULT_LLM_STEPS
    );

    // If demo mode requested, return pre-made demo insights
    if (useDemo === true) {
      try {
        const fs = await import('fs');
        const path = await import('path');
        const insightsPath = new URL('./sample-data/demo.insights.json', import.meta.url).pathname;
        const demoInsights = JSON.parse(fs.readFileSync(insightsPath, 'utf-8'));
        
        const retroData = {
          ...demoInsights,
          analysisMetadata: {
            demoMode: true,
            demoVariant: demoVariant === 'small' ? 'small' : 'large',
            generatedAt: new Date().toISOString(),
            dateRange: dateRange,
            teamMembers: teamMembers,
            insightCount: {
              wentWell: demoInsights.wentWell.length,
              didntGoWell: demoInsights.didntGoWell.length,
              actionItems: demoInsights.actionItems.length
            },
            dataSources: ["github", "linear", "slack"],
            analysisType: "demo_insights"
          }
        };

        generationResults.set(sessionId, {
          status: "completed",
          retroData,
          timestamp: new Date().toISOString(),
        });
        progressTracker.complete();
        setTimeout(() => generationResults.delete(sessionId), 60 * 60 * 1000);
        console.log("[bg] Demo generation completed for session:", sessionId);
        return;
      } catch (e) {
        console.error('[bg] Demo mode failed:', e);
        progressTracker.fail(e);
        generationResults.set(sessionId, {
          status: "failed",
          error: 'Failed to load demo insights: ' + e.message,
          timestamp: new Date().toISOString(),
        });
        setTimeout(() => generationResults.delete(sessionId), 60 * 60 * 1000);
        return;
      }
    }

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

    // Prepare date range strings - handle both date-only and full ISO strings
    const startDate = dateRange.start.includes("T")
      ? dateRange.start
      : dateRange.start + "T00:00:00Z";
    const endDate = dateRange.end.includes("T")
      ? dateRange.end
      : dateRange.end + "T23:59:59Z";

    let retroData = { wentWell: [], didntGoWell: [], actionItems: [] };

    if (llmEnabled) {
      try {
        console.log("[bg] Running LLL-only analysis...");
        const llmInsights = await performLLMAnalysis(
          llmAnalyzer,
          linearService,
          slackService,
          githubService,
          startDate,
          endDate,
          dateRange,
          teamMembers,
          progressTracker
        );
        if (llmInsights) {
          retroData = llmInsights;
        } else {
          console.warn("[bg] LLM returned null, falling back to rule-based");
          retroData = await performRuleBasedAnalysis(
            linearService,
            slackService,
            githubService,
            startDate,
            endDate,
            teamMembers
          );
        }
      } catch (error) {
        console.error("[bg] LLM analysis failed:", error.message);
        retroData = await performRuleBasedAnalysis(
          linearService,
          slackService,
          githubService,
          startDate,
          endDate,
          teamMembers
        );
      }
    } else {
      console.log("[bg] LLM disabled, using rule-based analysis");
      retroData = await performRuleBasedAnalysis(
        linearService,
        slackService,
        githubService,
        startDate,
        endDate,
        teamMembers
      );
    }

    // Add analysis metadata
    retroData.analysisMetadata = {
      ...retroData.analysisMetadata,
      ruleBasedAnalysisUsed:
        !llmEnabled || !retroData.analysisMetadata?.llmAnalysisUsed,
      llmAnalysisUsed:
        llmEnabled && retroData.analysisMetadata?.llmAnalysisUsed,
      llmEnabled: llmEnabled,
      generatedAt: new Date().toISOString(),
      dateRange: dateRange,
      teamMembers: teamMembers,
    };

    // Add fallback content if empty
    if (
      retroData.wentWell.length === 0 &&
      retroData.didntGoWell.length === 0 &&
      retroData.actionItems.length === 0
    ) {
      retroData.wentWell.push({
        title: "Data collection completed successfully",
        details:
          "Successfully gathered team data from configured sources for analysis.",
        source: "system",
        confidence: 1.0,
        category: "technical",
      });
      retroData.didntGoWell.push({
        title: "Limited data available for analysis",
        details:
          "Consider expanding the date range or checking data source configurations.",
        source: "system",
        confidence: 0.8,
        category: "process",
      });
      retroData.actionItems.push({
        title: "Review data source configuration",
        details:
          "Ensure all team data sources are properly configured and accessible.",
        source: "system",
        priority: "medium",
        category: "process",
      });
    }

    generationResults.set(sessionId, {
      status: "completed",
      retroData,
      timestamp: new Date().toISOString(),
    });
    // Complete the progress tracker
    if (progressTracker) {
      progressTracker.complete();
    }
    // Auto-cleanup stored result after 60 minutes
    setTimeout(() => generationResults.delete(sessionId), 60 * 60 * 1000);
    console.log("[bg] Generation completed for session:", sessionId);
  } catch (error) {
    console.error("[bg] Unhandled error in runRetroGeneration:", error);
    generationResults.set(sessionId, {
      status: "failed",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
    // Fail the progress tracker
    if (progressTracker) {
      progressTracker.fail(error);
    }
    setTimeout(() => generationResults.delete(sessionId), 60 * 60 * 1000);
  }
}
