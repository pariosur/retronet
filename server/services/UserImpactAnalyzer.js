/**
 * UserImpactAnalyzer - Analyzes changes to determine user-facing impact
 * 
 * This class provides intelligent detection of user-facing changes versus internal
 * technical changes. It filters out internal refactoring, developer tooling, and
 * infrastructure changes while identifying changes that directly impact end users.
 */

export class UserImpactAnalyzer {
  constructor(config = {}) {
    this.config = {
      // Confidence thresholds for user impact assessment
      highImpactThreshold: config.highImpactThreshold || 0.8,
      mediumImpactThreshold: config.mediumImpactThreshold || 0.6,
      lowImpactThreshold: config.lowImpactThreshold || 0.4,
      
      // Scoring weights for different factors
      impactWeights: {
        keywords: 0.3,
        labels: 0.25,
        patterns: 0.25,
        context: 0.2
      },
      
      // Custom rules for organization-specific impact detection
      customRules: config.customRules || [],
      
      // Exclusion strictness (how aggressively to filter internal changes)
      exclusionStrictness: config.exclusionStrictness || 'medium', // 'strict', 'medium', 'lenient'
      
      ...config
    };

    // Initialize impact detection rules
    this._initializeImpactRules();
  }

  /**
   * Analyze a single change to determine its user impact
   * @param {Object} change - The change object to analyze
   * @returns {Object} Impact analysis result with score, level, and reasoning
   */
  analyzeUserImpact(change) {
    if (!change || typeof change !== 'object') {
      throw new Error('Invalid change object provided for user impact analysis');
    }

    try {
      let sourceSpecificAnalysis = null;

      // Use source-specific analysis methods for enhanced accuracy
      if (change.source === 'github' && change.sourceType === 'commit') {
        try {
          sourceSpecificAnalysis = this.analyzeGitHubCommit(change.sourceData || change);
        } catch (error) {
          console.warn('GitHub-specific analysis failed, falling back to general analysis:', error.message);
        }
      } else if (change.source === 'linear' && change.sourceType === 'issue') {
        try {
          sourceSpecificAnalysis = this.analyzeLinearIssue(change.sourceData || change);
        } catch (error) {
          console.warn('Linear-specific analysis failed, falling back to general analysis:', error.message);
        }
      } else if (change.source === 'slack' && change.sourceType === 'message') {
        try {
          sourceSpecificAnalysis = this.analyzeSlackMessage(change.sourceData || change);
        } catch (error) {
          console.warn('Slack-specific analysis failed, falling back to general analysis:', error.message);
        }
      }

      // If source-specific analysis succeeded, use it as primary result
      if (sourceSpecificAnalysis) {
        const impactScore = sourceSpecificAnalysis.isUserFacing ? 
          Math.max(0.6, sourceSpecificAnalysis.confidence) : 
          Math.min(0.4, 1 - sourceSpecificAnalysis.confidence);
        
        const impactLevel = this._determineImpactLevel(impactScore);

        return {
          isUserFacing: sourceSpecificAnalysis.isUserFacing,
          impactScore,
          impactLevel,
          isInternal: !sourceSpecificAnalysis.isUserFacing,
          confidence: sourceSpecificAnalysis.confidence,
          reasoning: sourceSpecificAnalysis.reasoning,
          factors: this._getImpactFactors(change),
          sourceSpecificAnalysis
        };
      }

      // Fallback to general analysis
      const impactScore = this._calculateUserImpactScore(change);
      const impactLevel = this._determineImpactLevel(impactScore);
      const isInternal = this._isInternalChange(change);
      const reasoning = this._generateImpactReasoning(change, impactScore, impactLevel, isInternal);

      return {
        isUserFacing: !isInternal && impactScore >= this.config.lowImpactThreshold,
        impactScore,
        impactLevel,
        isInternal,
        confidence: this._calculateConfidence(change, impactScore),
        reasoning,
        factors: this._getImpactFactors(change)
      };

    } catch (error) {
      console.error('Error analyzing user impact:', error.message);
      
      // Fallback to conservative assessment
      return {
        isUserFacing: false,
        impactScore: 0.3,
        impactLevel: 'low',
        isInternal: true,
        confidence: 0.2,
        reasoning: 'Error during impact analysis - defaulting to internal',
        factors: {}
      };
    }
  }

  /**
   * Analyze multiple changes and filter for user-facing ones
   * @param {Array} changes - Array of change objects
   * @returns {Object} Analysis results with user-facing and internal changes
   */
  analyzeChanges(changes) {
    if (!Array.isArray(changes)) {
      throw new Error('Changes must be an array');
    }

    const userFacingChanges = [];
    const internalChanges = [];
    const uncertainChanges = [];
    const analysisResults = [];

    for (const change of changes) {
      try {
        const analysis = this.analyzeUserImpact(change);
        
        const enrichedChange = {
          ...change,
          userImpactAnalysis: analysis
        };

        analysisResults.push(enrichedChange);

        // Requirement 4.5: Flag items for manual review when uncertain
        if (analysis.confidence < 0.6 && analysis.impactScore > 0.3 && analysis.impactScore < 0.7) {
          uncertainChanges.push({
            ...enrichedChange,
            requiresManualReview: true,
            reviewReason: 'Uncertain user impact - requires manual review'
          });
        } else if (analysis.isUserFacing) {
          userFacingChanges.push(enrichedChange);
        } else {
          internalChanges.push(enrichedChange);
        }
      } catch (error) {
        console.error('Error analyzing individual change:', error.message);
        // Add to uncertain changes if analysis fails - requires manual review
        uncertainChanges.push({
          ...change,
          userImpactAnalysis: {
            isUserFacing: false,
            impactScore: 0.2,
            impactLevel: 'low',
            isInternal: true,
            confidence: 0.1,
            reasoning: 'Analysis failed - requires manual review'
          },
          requiresManualReview: true,
          reviewReason: 'Analysis failed - requires manual review'
        });
      }
    }

    return {
      userFacingChanges,
      internalChanges,
      uncertainChanges,
      analysisResults,
      statistics: this._calculateAnalysisStatistics(analysisResults)
    };
  }

  /**
   * Get confidence score for user impact assessment
   * @param {Object} change - The change object
   * @returns {number} Confidence score between 0 and 1
   */
  getImpactConfidence(change) {
    if (!change) return 0;
    
    const analysis = this.analyzeUserImpact(change);
    return analysis.confidence;
  }

  /**
   * Requirement 4.1: Identify user-facing changes versus internal refactoring in GitHub commits
   * @param {Object} commit - GitHub commit object
   * @returns {Object} Analysis result specific to GitHub commits
   */
  analyzeGitHubCommit(commit) {
    if (!commit || !commit.commit) {
      throw new Error('Invalid GitHub commit object');
    }

    const message = commit.commit.message.toLowerCase();
    const files = commit.files || [];
    
    // Enhanced GitHub-specific analysis
    let isUserFacing = true;
    let confidence = 0.7;
    let reasoning = [];

    // Strong indicators of internal refactoring
    const refactoringPatterns = [
      /^(refactor|cleanup|reorganize|restructure):/i,
      /\b(refactor|refactoring|cleanup|code\s+cleanup)\b/i,
      /\b(internal\s+restructure|code\s+organization)\b/i
    ];

    const hasRefactoringPattern = refactoringPatterns.some(pattern => pattern.test(message));
    if (hasRefactoringPattern) {
      isUserFacing = false;
      confidence = Math.min(1, confidence + 0.2);
      reasoning.push('Contains refactoring patterns');
    }

    // Check file types for user-facing changes
    const userFacingFilePatterns = [
      /\.(jsx?|tsx?|vue|svelte)$/i, // Frontend components
      /\.(css|scss|sass|less)$/i,   // Styling
      /\.(html|htm)$/i,             // Templates
      /api|endpoint|route/i,        // API files
      /component|page|view/i        // UI components
    ];

    const internalFilePatterns = [
      /\.(test|spec)\./i,           // Test files
      /\.(config|conf)\./i,         // Config files
      /build|webpack|babel/i,       // Build tools
      /\.md$/i,                     // Documentation
      /package\.json$/i             // Dependencies
    ];

    const userFacingFiles = files.filter(file => 
      userFacingFilePatterns.some(pattern => pattern.test(file.filename))
    );

    const internalFiles = files.filter(file => 
      internalFilePatterns.some(pattern => pattern.test(file.filename))
    );

    if (userFacingFiles.length > 0 && internalFiles.length === 0) {
      confidence += 0.2;
      reasoning.push('Modifies user-facing files');
    } else if (internalFiles.length > 0 && userFacingFiles.length === 0) {
      isUserFacing = false;
      confidence += 0.2;
      reasoning.push('Modifies only internal files');
    } else if (internalFiles.length > userFacingFiles.length) {
      isUserFacing = false;
      confidence += 0.1;
      reasoning.push('Primarily modifies internal files');
    }

    // Check commit message for user impact indicators
    const userImpactKeywords = [
      'fix', 'bug', 'issue', 'feature', 'add', 'new', 'improve', 'enhance',
      'ui', 'ux', 'user', 'customer', 'interface', 'design'
    ];

    const hasUserImpactKeywords = userImpactKeywords.some(keyword => 
      message.includes(keyword)
    );

    if (hasUserImpactKeywords) {
      confidence += 0.1;
      reasoning.push('Contains user impact keywords');
    }

    return {
      isUserFacing,
      confidence: Math.min(1, confidence),
      reasoning: reasoning.join('; '),
      source: 'github',
      sourceType: 'commit',
      filesAnalyzed: {
        total: files.length,
        userFacing: userFacingFiles.length,
        internal: internalFiles.length
      }
    };
  }

  /**
   * Requirement 4.2: Distinguish between customer-impacting features and internal improvements in Linear tickets
   * @param {Object} issue - Linear issue object
   * @returns {Object} Analysis result specific to Linear issues
   */
  analyzeLinearIssue(issue) {
    if (!issue) {
      throw new Error('Invalid Linear issue object');
    }

    const title = (issue.title || '').toLowerCase();
    const description = (issue.description || '').toLowerCase();
    const labels = (issue.labels?.nodes || []).map(l => l.name.toLowerCase());
    const team = issue.team?.name?.toLowerCase() || '';
    
    let isUserFacing = true;
    let confidence = 0.6;
    let reasoning = [];

    // Check labels for customer impact indicators
    const customerImpactLabels = [
      'customer-facing', 'user-facing', 'frontend', 'ui', 'ux', 
      'feature', 'enhancement', 'bug', 'critical', 'high-priority'
    ];

    const internalLabels = [
      'internal', 'tech-debt', 'refactor', 'infrastructure', 'devops',
      'build', 'ci', 'cd', 'tooling', 'maintenance', 'developer-experience'
    ];

    const hasCustomerLabels = labels.some(label => 
      customerImpactLabels.some(customerLabel => label.includes(customerLabel))
    );

    const hasInternalLabels = labels.some(label => 
      internalLabels.some(internalLabel => label.includes(internalLabel))
    );



    // Prioritize explicit internal labels over customer labels
    const explicitInternalLabels = labels.filter(label => 
      ['internal', 'tech-debt', 'refactor', 'infrastructure', 'devops'].includes(label)
    );

    if (explicitInternalLabels.length > 0) {
      isUserFacing = false;
      confidence += 0.3;
      reasoning.push('Has internal-focused labels');
    } else if (hasCustomerLabels) {
      isUserFacing = true;
      confidence += 0.2;
      reasoning.push('Has customer-facing labels');
    }

    // Check priority for customer impact
    if (issue.priority >= 3) {
      confidence += 0.1;
      reasoning.push('High priority suggests customer impact');
    }

    // Check team for customer-facing work
    const customerFacingTeams = ['frontend', 'ui', 'ux', 'product', 'design'];
    const internalTeams = ['infrastructure', 'devops', 'platform', 'backend-internal'];

    if (customerFacingTeams.some(teamName => team.includes(teamName))) {
      confidence += 0.1;
      reasoning.push('Assigned to customer-facing team');
    } else if (internalTeams.some(teamName => team.includes(teamName))) {
      isUserFacing = false;
      confidence += 0.1;
      reasoning.push('Assigned to internal team');
    }

    // Check issue type and state
    if (issue.state?.type === 'completed' && issue.state?.name?.toLowerCase().includes('shipped')) {
      confidence += 0.1;
      reasoning.push('Completed and shipped to users');
    }

    // Analyze title and description for customer impact
    const customerImpactPatterns = [
      /\b(user|customer|client)\s+(can|will|able|experience)\b/i,
      /\b(improve|enhance|fix)\s+(user|customer|experience)\b/i,
      /\b(new\s+feature|feature\s+request)\b/i,
      /\b(bug\s+report|customer\s+issue)\b/i
    ];

    const internalPatterns = [
      /\b(refactor|cleanup|tech\s+debt|infrastructure)\b/i,
      /\b(internal\s+tool|developer\s+experience|build\s+system)\b/i,
      /\b(ci\/cd|deployment|monitoring|logging)\b/i
    ];

    const hasCustomerPatterns = customerImpactPatterns.some(pattern => 
      pattern.test(title) || pattern.test(description)
    );

    const hasInternalPatterns = internalPatterns.some(pattern => 
      pattern.test(title) || pattern.test(description)
    );

    if (hasCustomerPatterns) {
      confidence += 0.15;
      reasoning.push('Description indicates customer impact');
    }

    if (hasInternalPatterns) {
      isUserFacing = false;
      confidence += 0.15;
      reasoning.push('Description indicates internal work');
    }

    return {
      isUserFacing,
      confidence: Math.min(1, confidence),
      reasoning: reasoning.join('; '),
      source: 'linear',
      sourceType: 'issue',
      priority: issue.priority,
      team: issue.team?.name,
      labels: labels
    };
  }

  /**
   * Requirement 4.3: Extract user-relevant insights while filtering out internal technical discussions from Slack
   * @param {Object} message - Slack message object
   * @returns {Object} Analysis result specific to Slack messages
   */
  analyzeSlackMessage(message) {
    if (!message || !message.text) {
      throw new Error('Invalid Slack message object');
    }

    const text = message.text.toLowerCase();
    const channel = (message.channel || '').toLowerCase();
    
    let isUserFacing = false; // Default to false for Slack messages
    let confidence = 0.4;
    let reasoning = [];

    // User-relevant Slack patterns
    const userRelevantPatterns = [
      /\b(release|ship|deploy|launch)\s+(to\s+)?(production|prod|users|customers)\b/i,
      /\b(new\s+feature|feature\s+release|feature\s+launch)\b/i,
      /\b(bug\s+fix|hotfix|critical\s+fix)\s+(deployed|shipped|released)\b/i,
      /\b(customer\s+impact|user\s+impact|affects\s+users)\b/i,
      /\b(announcement|release\s+notes|changelog)\b/i
    ];

    // Internal technical discussion patterns
    const internalPatterns = [
      /\b(code\s+review|pr\s+review|merge\s+request)\b/i,
      /\b(build\s+failed|ci\s+failed|test\s+failed)\b/i,
      /\b(refactor|cleanup|tech\s+debt|infrastructure)\b/i,
      /\b(internal\s+tool|dev\s+tool|developer\s+setup)\b/i,
      /\b(monitoring|logging|metrics|alerts)\b/i,
      /\b(database\s+migration|schema\s+change)\b/i
    ];

    const hasUserRelevantPattern = userRelevantPatterns.some(pattern => pattern.test(text));
    const hasInternalPattern = internalPatterns.some(pattern => pattern.test(text));

    if (hasUserRelevantPattern && !hasInternalPattern) {
      isUserFacing = true;
      confidence += 0.3;
      reasoning.push('Contains user-relevant release information');
    }

    if (hasInternalPattern) {
      isUserFacing = false;
      confidence += 0.2;
      reasoning.push('Contains internal technical discussion');
    } else if (hasUserRelevantPattern) {
      isUserFacing = true;
      confidence += 0.2;
      reasoning.push('Contains user-relevant release information');
    }

    // Channel-based analysis
    const userFacingChannels = [
      'releases', 'announcements', 'product-updates', 'changelog',
      'customer-success', 'support', 'product'
    ];

    const internalChannels = [
      'dev', 'engineering', 'backend', 'infrastructure', 'ci-cd',
      'monitoring', 'alerts', 'tech-talk', 'code-review'
    ];

    if (userFacingChannels.some(channelName => channel.includes(channelName))) {
      isUserFacing = true;
      confidence += 0.2;
      reasoning.push('Posted in user-facing channel');
    } else if (internalChannels.some(channelName => channel.includes(channelName))) {
      isUserFacing = false;
      confidence += 0.2;
      reasoning.push('Posted in internal technical channel');
    }

    // Look for specific user impact indicators
    const userImpactKeywords = [
      'users will see', 'customers can now', 'available to users',
      'user experience', 'customer experience', 'ui change', 'ux improvement'
    ];

    const hasUserImpactKeywords = userImpactKeywords.some(keyword => text.includes(keyword));
    if (hasUserImpactKeywords) {
      isUserFacing = true;
      confidence += 0.2;
      reasoning.push('Explicitly mentions user impact');
    }

    // Check for version numbers or release tags
    const releasePattern = /\b(v?\d+\.\d+\.\d+|release|version)\b/i;
    if (releasePattern.test(text) && hasUserRelevantPattern) {
      confidence += 0.1;
      reasoning.push('Contains version/release information');
    }

    return {
      isUserFacing,
      confidence: Math.min(1, confidence),
      reasoning: reasoning.join('; '),
      source: 'slack',
      sourceType: 'message',
      channel: message.channel,
      hasUserRelevantContent: hasUserRelevantPattern,
      hasInternalContent: hasInternalPattern
    };
  }

  /**
   * Initialize impact detection rules and patterns
   * @private
   */
  _initializeImpactRules() {
    // User-facing indicators
    this.userFacingRules = {
      keywords: [
        // UI/UX related
        'ui', 'interface', 'design', 'layout', 'style', 'theme', 'visual',
        'button', 'form', 'page', 'screen', 'modal', 'dialog', 'menu',
        
        // Feature related
        'feature', 'functionality', 'capability', 'option', 'setting',
        'dashboard', 'report', 'export', 'import', 'search', 'filter',
        
        // Performance that users notice
        'performance', 'speed', 'faster', 'loading', 'response', 'latency',
        
        // User experience
        'user', 'customer', 'experience', 'workflow', 'process', 'navigation',
        'accessibility', 'usability', 'mobile', 'responsive',
        
        // API changes that affect integrations
        'api', 'endpoint', 'integration', 'webhook', 'authentication', 'authorization'
      ],
      
      labels: [
        'ui', 'ux', 'frontend', 'user-facing', 'customer-facing', 'feature',
        'enhancement', 'improvement', 'bug', 'fix', 'performance', 'api',
        'integration', 'accessibility', 'mobile', 'responsive'
      ],
      
      patterns: [
        // User-facing action patterns
        /\b(add|new|create|implement|introduce)\s+(feature|functionality|page|screen|ui|interface)\b/i,
        /\b(improve|enhance|optimize)\s+(user|customer|experience|performance|ui|interface)\b/i,
        /\b(fix|resolve|correct)\s+(bug|issue|problem)\s+(in|with|for)\s+(user|customer|ui|interface)\b/i,
        
        // UI/UX patterns
        /\b(update|change|modify)\s+(design|layout|style|theme|ui|interface)\b/i,
        /\b(mobile|responsive|accessibility|usability)\b/i,
        
        // Performance patterns that affect users
        /\b(faster|slower|performance|speed|loading|response)\b/i,
        
        // API patterns that affect external users
        /\b(api|endpoint|integration|webhook)\s+(change|update|new|add)\b/i
      ]
    };

    // Internal/technical indicators
    this.internalRules = {
      keywords: [
        // Code structure
        'refactor', 'refactoring', 'cleanup', 'reorganize', 'restructure',
        'code', 'codebase', 'architecture', 'structure', 'organization',
        
        // Developer tooling
        'build', 'compile', 'bundle', 'webpack', 'babel', 'eslint', 'prettier',
        'test', 'testing', 'unit', 'integration', 'e2e', 'spec', 'mock',
        'ci', 'cd', 'pipeline', 'deployment', 'docker', 'kubernetes',
        
        // Infrastructure
        'infrastructure', 'server', 'database', 'migration', 'schema',
        'config', 'configuration', 'environment', 'env', 'settings',
        'logging', 'monitoring', 'metrics', 'analytics', 'telemetry',
        
        // Dependencies and maintenance
        'dependency', 'dependencies', 'package', 'library', 'framework',
        'update', 'upgrade', 'version', 'bump', 'maintenance',
        
        // Internal processes
        'internal', 'admin', 'developer', 'dev', 'debug', 'debugging'
      ],
      
      labels: [
        'refactor', 'cleanup', 'maintenance', 'internal', 'infrastructure',
        'build', 'ci', 'cd', 'test', 'testing', 'dev', 'developer',
        'config', 'configuration', 'dependency', 'deps', 'tech-debt'
      ],
      
      patterns: [
        // Refactoring patterns
        /\b(refactor|cleanup|reorganize|restructure)\b/i,
        
        // Build/tooling patterns
        /\b(build|compile|bundle|webpack|babel|eslint|prettier)\b/i,
        
        // Testing patterns
        /\b(test|testing|unit|integration|e2e|spec|mock)\s+(add|update|fix|improve)\b/i,
        
        // Infrastructure patterns
        /\b(infrastructure|server|database|migration|schema|config)\b/i,
        
        // Dependency patterns
        /\b(update|upgrade|bump)\s+(dependency|dependencies|package|library)\b/i,
        
        // Internal tooling patterns
        /\b(internal|admin|developer|dev|debug)\s+(tool|utility|script|helper)\b/i
      ]
    };
  }

  /**
   * Calculate user impact score for a change
   * @private
   */
  _calculateUserImpactScore(change) {
    const title = (change.title || '').toLowerCase();
    const description = (change.description || '').toLowerCase();
    const labels = (change.labels || []).map(l => l.toLowerCase());
    
    let score = 0;
    const weights = this.config.impactWeights;

    // User-facing keyword matching
    const userKeywordMatches = this.userFacingRules.keywords.filter(keyword => 
      title.includes(keyword) || description.includes(keyword)
    ).length;
    
    if (userKeywordMatches > 0) {
      score += Math.min(userKeywordMatches * 0.25, weights.keywords * 2);
    }

    // User-facing label matching
    const userLabelMatches = this.userFacingRules.labels.filter(label => 
      labels.includes(label)
    ).length;
    
    if (userLabelMatches > 0) {
      score += Math.min(userLabelMatches * 0.3, weights.labels * 2);
    }

    // User-facing pattern matching
    const userPatternMatches = this.userFacingRules.patterns.filter(pattern => 
      pattern.test(title) || pattern.test(description)
    ).length;
    
    if (userPatternMatches > 0) {
      score += Math.min(userPatternMatches * 0.3, weights.patterns * 2);
    }

    // Context-based scoring
    score += this._calculateContextScore(change) * weights.context;

    // Apply penalties for internal indicators
    const internalPenalty = this._calculateInternalPenalty(change);
    score = Math.max(0, score - internalPenalty);

    return Math.min(1, score);
  }

  /**
   * Calculate context-based score
   * @private
   */
  _calculateContextScore(change) {
    let contextScore = 0;

    // Source-based scoring
    if (change.source === 'github') {
      if (change.sourceType === 'pullRequest') {
        // PRs with good descriptions often indicate user-facing changes
        if (change.description && change.description.length > 50) {
          contextScore += 0.1;
        }
      }
    } else if (change.source === 'linear') {
      // High priority Linear issues often affect users
      if (change.priority >= 3) {
        contextScore += 0.15;
      }
      
      // Issues marked as completed are more likely to be user-facing
      if (change.state?.type === 'completed') {
        contextScore += 0.1;
      }
    } else if (change.source === 'slack') {
      // Slack messages about releases often indicate user-facing changes
      const text = (change.text || '').toLowerCase();
      if (text.includes('release') || text.includes('ship') || text.includes('launch')) {
        contextScore += 0.2;
      }
    }

    // Impact-based scoring
    if (change.impact === 'high') {
      contextScore += 0.2;
    } else if (change.impact === 'medium') {
      contextScore += 0.1;
    }

    // Confidence-based scoring
    if (change.confidence && change.confidence > 0.8) {
      contextScore += 0.1;
    }

    return contextScore;
  }

  /**
   * Calculate penalty for internal indicators
   * @private
   */
  _calculateInternalPenalty(change) {
    const title = (change.title || '').toLowerCase();
    const description = (change.description || '').toLowerCase();
    const labels = (change.labels || []).map(l => l.toLowerCase());
    
    let penalty = 0;

    // Internal keyword penalty
    const internalKeywordMatches = this.internalRules.keywords.filter(keyword => 
      title.includes(keyword) || description.includes(keyword)
    ).length;
    
    penalty += internalKeywordMatches * 0.1;

    // Internal label penalty
    const internalLabelMatches = this.internalRules.labels.filter(label => 
      labels.includes(label)
    ).length;
    
    penalty += internalLabelMatches * 0.15;

    // Internal pattern penalty
    const internalPatternMatches = this.internalRules.patterns.filter(pattern => 
      pattern.test(title) || pattern.test(description)
    ).length;
    
    penalty += internalPatternMatches * 0.2;

    // Apply strictness multiplier
    const strictnessMultiplier = {
      'strict': 1.5,
      'medium': 1.0,
      'lenient': 0.7
    }[this.config.exclusionStrictness] || 1.0;

    return penalty * strictnessMultiplier;
  }

  /**
   * Check if a change is internal based on strong indicators
   * @private
   */
  _isInternalChange(change) {
    const title = (change.title || '').toLowerCase();
    const description = (change.description || '').toLowerCase();
    const labels = (change.labels || []).map(l => l.toLowerCase());

    // Strong internal indicators that should exclude changes
    const strongInternalKeywords = [
      'refactor', 'cleanup', 'test', 'testing', 'ci', 'cd', 'build',
      'dependency', 'deps', 'config', 'configuration', 'internal'
    ];

    const strongInternalLabels = [
      'refactor', 'cleanup', 'internal', 'tech-debt', 'ci', 'build', 'test'
    ];

    // Check for strong internal keywords
    const hasStrongInternalKeywords = strongInternalKeywords.some(keyword => 
      title.includes(keyword) || description.includes(keyword)
    );

    // Check for strong internal labels
    const hasStrongInternalLabels = strongInternalLabels.some(label => 
      labels.includes(label)
    );

    // Check for strong internal patterns
    const strongInternalPatterns = [
      /^(refactor|cleanup|test|ci|build):/i,
      /\b(internal|admin|dev)\s+(tool|utility|script)\b/i,
      /\b(update|upgrade)\s+(dependency|dependencies|deps)\b/i
    ];

    const hasStrongInternalPatterns = strongInternalPatterns.some(pattern => 
      pattern.test(title) || pattern.test(description)
    );

    return hasStrongInternalKeywords || hasStrongInternalLabels || hasStrongInternalPatterns;
  }

  /**
   * Determine impact level from score
   * @private
   */
  _determineImpactLevel(score) {
    if (score >= this.config.highImpactThreshold) {
      return 'high';
    } else if (score >= this.config.mediumImpactThreshold) {
      return 'medium';
    } else if (score >= this.config.lowImpactThreshold) {
      return 'low';
    } else {
      return 'none';
    }
  }

  /**
   * Calculate confidence in the impact assessment
   * @private
   */
  _calculateConfidence(change, impactScore) {
    let confidence = 0.5; // Base confidence

    // Higher confidence for clear indicators
    const title = (change.title || '').toLowerCase();
    const description = (change.description || '').toLowerCase();
    const labels = (change.labels || []).map(l => l.toLowerCase());

    // Boost confidence for clear user-facing indicators
    const clearUserIndicators = ['ui', 'user', 'customer', 'feature', 'bug', 'fix'];
    const hasUserIndicators = clearUserIndicators.some(indicator => 
      title.includes(indicator) || description.includes(indicator) || labels.includes(indicator)
    );

    if (hasUserIndicators) {
      confidence += 0.2;
    }

    // Boost confidence for clear internal indicators
    const clearInternalIndicators = ['refactor', 'test', 'ci', 'build', 'internal'];
    const hasInternalIndicators = clearInternalIndicators.some(indicator => 
      title.includes(indicator) || description.includes(indicator) || labels.includes(indicator)
    );

    if (hasInternalIndicators) {
      confidence += 0.2;
    }

    // Boost confidence for good descriptions
    if (description && description.length > 50) {
      confidence += 0.1;
    }

    // Boost confidence for labeled changes
    if (labels.length > 0) {
      confidence += 0.1;
    }

    // Adjust confidence based on impact score extremes
    if (impactScore > 0.8 || impactScore < 0.2) {
      confidence += 0.1;
    }

    return Math.min(1, confidence);
  }

  /**
   * Generate reasoning for impact assessment
   * @private
   */
  _generateImpactReasoning(change, impactScore, impactLevel, isInternal) {
    const reasons = [];
    const title = (change.title || '').toLowerCase();
    const description = (change.description || '').toLowerCase();
    const labels = (change.labels || []).map(l => l.toLowerCase());

    // Add reasoning based on analysis
    if (isInternal) {
      reasons.push('Identified as internal change');
      
      // Specific internal reasons
      if (title.includes('refactor') || description.includes('refactor')) {
        reasons.push('Contains refactoring keywords');
      }
      if (title.includes('test') || description.includes('test')) {
        reasons.push('Related to testing');
      }
      if (labels.some(l => ['internal', 'ci', 'build'].includes(l))) {
        reasons.push('Has internal-focused labels');
      }
    } else {
      // User-facing reasons
      if (this.userFacingRules.keywords.some(k => title.includes(k) || description.includes(k))) {
        reasons.push('Contains user-facing keywords');
      }
      if (labels.some(l => this.userFacingRules.labels.includes(l))) {
        reasons.push('Has user-facing labels');
      }
      if (this.userFacingRules.patterns.some(p => p.test(title) || p.test(description))) {
        reasons.push('Matches user-facing patterns');
      }
    }

    // Add impact level reasoning
    reasons.push(`${impactLevel} impact level (score: ${impactScore.toFixed(2)})`);

    return reasons.join('; ');
  }

  /**
   * Get impact factors for detailed analysis
   * @private
   */
  _getImpactFactors(change) {
    const title = (change.title || '').toLowerCase();
    const description = (change.description || '').toLowerCase();
    const labels = (change.labels || []).map(l => l.toLowerCase());

    return {
      userKeywords: this.userFacingRules.keywords.filter(k => 
        title.includes(k) || description.includes(k)
      ),
      internalKeywords: this.internalRules.keywords.filter(k => 
        title.includes(k) || description.includes(k)
      ),
      userLabels: labels.filter(l => this.userFacingRules.labels.includes(l)),
      internalLabels: labels.filter(l => this.internalRules.labels.includes(l)),
      hasDescription: !!(description && description.length > 20),
      hasLabels: labels.length > 0,
      source: change.source,
      impact: change.impact
    };
  }

  /**
   * Calculate analysis statistics
   * @private
   */
  _calculateAnalysisStatistics(analysisResults) {
    if (!analysisResults.length) {
      return {
        total: 0,
        userFacing: 0,
        internal: 0,
        uncertain: 0,
        averageImpactScore: 0,
        averageConfidence: 0,
        impactLevelDistribution: { high: 0, medium: 0, low: 0, none: 0 },
        sourceDistribution: {},
        confidenceDistribution: { high: 0, medium: 0, low: 0 }
      };
    }

    const userFacingCount = analysisResults.filter(r => r.userImpactAnalysis.isUserFacing).length;
    const uncertainCount = analysisResults.filter(r => r.requiresManualReview).length;
    const internalCount = analysisResults.length - userFacingCount - uncertainCount;
    
    const totalImpactScore = analysisResults.reduce((sum, r) => sum + r.userImpactAnalysis.impactScore, 0);
    const totalConfidence = analysisResults.reduce((sum, r) => sum + r.userImpactAnalysis.confidence, 0);
    
    const impactLevelDistribution = analysisResults.reduce((dist, r) => {
      const level = r.userImpactAnalysis.impactLevel;
      dist[level] = (dist[level] || 0) + 1;
      return dist;
    }, { high: 0, medium: 0, low: 0, none: 0 });

    const sourceDistribution = analysisResults.reduce((dist, r) => {
      const source = r.source || 'unknown';
      dist[source] = (dist[source] || 0) + 1;
      return dist;
    }, {});

    const confidenceDistribution = analysisResults.reduce((dist, r) => {
      const confidence = r.userImpactAnalysis.confidence;
      if (confidence >= 0.8) {
        dist.high += 1;
      } else if (confidence >= 0.6) {
        dist.medium += 1;
      } else {
        dist.low += 1;
      }
      return dist;
    }, { high: 0, medium: 0, low: 0 });

    return {
      total: analysisResults.length,
      userFacing: userFacingCount,
      internal: internalCount,
      uncertain: uncertainCount,
      userFacingPercentage: (userFacingCount / analysisResults.length) * 100,
      internalPercentage: (internalCount / analysisResults.length) * 100,
      uncertainPercentage: (uncertainCount / analysisResults.length) * 100,
      averageImpactScore: totalImpactScore / analysisResults.length,
      averageConfidence: totalConfidence / analysisResults.length,
      impactLevelDistribution,
      sourceDistribution,
      confidenceDistribution
    };
  }

  /**
   * Add custom impact detection rule
   * @param {Object} rule - Custom rule object
   */
  addCustomRule(rule) {
    if (!rule || !rule.type || !rule.condition) {
      throw new Error('Invalid custom rule: must have type and condition');
    }

    this.config.customRules.push(rule);
  }

  /**
   * Update configuration
   * @param {Object} newConfig - New configuration options
   */
  updateConfiguration(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    // Reinitialize rules if weights changed
    if (newConfig.impactWeights || newConfig.exclusionStrictness) {
      this._initializeImpactRules();
    }
  }

  /**
   * Get current configuration
   * @returns {Object} Current analyzer configuration
   */
  getConfiguration() {
    return { ...this.config };
  }

  /**
   * Get analysis statistics for a set of changes
   * @param {Array} changes - Array of changes to analyze
   * @returns {Object} Detailed statistics about user impact analysis
   */
  getAnalysisStatistics(changes) {
    const analysis = this.analyzeChanges(changes);
    return analysis.statistics;
  }

  /**
   * Requirement 4.4: Filter out changes with no user impact
   * @param {Array} changes - Array of changes to filter
   * @param {Object} options - Filtering options
   * @returns {Object} Filtered results with excluded changes tracked
   */
  filterUserFacingChanges(changes, options = {}) {
    const {
      strictMode = false,
      includeUncertain = false,
      minConfidence = 0.5
    } = options;

    const analysis = this.analyzeChanges(changes);
    const filtered = {
      included: [],
      excluded: [],
      uncertain: [],
      exclusionReasons: {}
    };

    for (const change of analysis.analysisResults) {
      const impact = change.userImpactAnalysis;
      
      // Requirement 4.4: Exclude changes with no user impact
      if (!impact.isUserFacing || impact.impactScore < this.config.lowImpactThreshold) {
        filtered.excluded.push({
          ...change,
          exclusionReason: 'No user impact detected'
        });
        
        const reason = 'No user impact detected';
        filtered.exclusionReasons[reason] = (filtered.exclusionReasons[reason] || 0) + 1;
        continue;
      }

      // Apply confidence threshold
      if (impact.confidence < minConfidence) {
        if (includeUncertain) {
          filtered.uncertain.push({
            ...change,
            requiresManualReview: true,
            reviewReason: `Low confidence (${impact.confidence.toFixed(2)}) - requires manual review`
          });
        } else {
          filtered.excluded.push({
            ...change,
            exclusionReason: 'Low confidence in user impact assessment'
          });
          
          const reason = 'Low confidence in user impact assessment';
          filtered.exclusionReasons[reason] = (filtered.exclusionReasons[reason] || 0) + 1;
        }
        continue;
      }

      // Apply strict mode filtering
      if (strictMode && impact.impactLevel === 'low') {
        filtered.excluded.push({
          ...change,
          exclusionReason: 'Low impact in strict mode'
        });
        
        const reason = 'Low impact in strict mode';
        filtered.exclusionReasons[reason] = (filtered.exclusionReasons[reason] || 0) + 1;
        continue;
      }

      // Include the change
      filtered.included.push(change);
    }

    return {
      ...filtered,
      statistics: {
        total: changes.length,
        included: filtered.included.length,
        excluded: filtered.excluded.length,
        uncertain: filtered.uncertain.length,
        inclusionRate: (filtered.included.length / changes.length) * 100,
        exclusionReasons: filtered.exclusionReasons
      }
    };
  }

  /**
   * Requirement 4.5: Identify changes that require manual review due to uncertainty
   * @param {Array} changes - Array of changes to analyze
   * @param {Object} options - Review criteria options
   * @returns {Array} Changes that require manual review
   */
  identifyChangesForManualReview(changes, options = {}) {
    const {
      uncertaintyThreshold = 0.6,
      ambiguityThreshold = 0.3,
      conflictThreshold = 0.4
    } = options;

    const changesForReview = [];
    const analysis = this.analyzeChanges(changes);

    for (const change of analysis.analysisResults) {
      const impact = change.userImpactAnalysis;
      const reviewReasons = [];

      // Low confidence in assessment
      if (impact.confidence < uncertaintyThreshold) {
        reviewReasons.push(`Low confidence (${impact.confidence.toFixed(2)})`);
      }

      // Ambiguous impact score (neither clearly user-facing nor internal)
      if (impact.impactScore > ambiguityThreshold && impact.impactScore < (1 - ambiguityThreshold)) {
        reviewReasons.push(`Ambiguous impact score (${impact.impactScore.toFixed(2)})`);
      }

      // Conflicting signals (user-facing keywords but internal patterns)
      const factors = impact.factors;
      if (factors.userKeywords?.length > 0 && factors.internalKeywords?.length > 0) {
        reviewReasons.push('Conflicting user-facing and internal indicators');
      }

      // Source-specific uncertainty
      if (impact.sourceSpecificAnalysis) {
        const sourceAnalysis = impact.sourceSpecificAnalysis;
        if (sourceAnalysis.confidence < conflictThreshold) {
          reviewReasons.push(`Source-specific analysis uncertainty (${sourceAnalysis.source})`);
        }
      }

      // Missing key information
      if (!change.description || change.description.length < 10) {
        reviewReasons.push('Insufficient description for accurate analysis');
      }

      if (reviewReasons.length > 0) {
        changesForReview.push({
          ...change,
          requiresManualReview: true,
          reviewReasons,
          reviewPriority: this._calculateReviewPriority(impact, reviewReasons),
          suggestedAction: this._suggestReviewAction(impact, reviewReasons)
        });
      }
    }

    // Sort by review priority (highest first)
    changesForReview.sort((a, b) => b.reviewPriority - a.reviewPriority);

    return changesForReview;
  }

  /**
   * Calculate priority for manual review
   * @private
   */
  _calculateReviewPriority(impact, reviewReasons) {
    let priority = 0;

    // Higher priority for changes that might be user-facing but uncertain
    if (impact.impactScore > 0.5) {
      priority += 3;
    }

    // Higher priority for conflicting signals
    if (reviewReasons.some(reason => reason.includes('Conflicting'))) {
      priority += 2;
    }

    // Higher priority for high-impact changes with low confidence
    if (impact.impactLevel === 'high' && impact.confidence < 0.6) {
      priority += 2;
    }

    // Lower priority for clearly internal changes
    if (impact.isInternal && impact.confidence > 0.8) {
      priority -= 1;
    }

    return Math.max(0, priority);
  }

  /**
   * Suggest review action based on analysis
   * @private
   */
  _suggestReviewAction(impact, reviewReasons) {
    if (impact.impactScore > 0.7 && impact.confidence < 0.6) {
      return 'Likely user-facing - verify and include in changelog';
    }

    if (impact.impactScore < 0.3 && impact.confidence > 0.7) {
      return 'Likely internal - exclude from changelog';
    }

    if (reviewReasons.some(reason => reason.includes('Conflicting'))) {
      return 'Mixed signals - manual categorization needed';
    }

    if (reviewReasons.some(reason => reason.includes('Insufficient description'))) {
      return 'Add more context or exclude from changelog';
    }

    return 'Manual review needed to determine user impact';
  }
}

export default UserImpactAnalyzer;