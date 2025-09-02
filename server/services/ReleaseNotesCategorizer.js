/**
 * ReleaseNotesCategorizer - Intelligent categorization of changes into user-facing categories
 * 
 * This class provides both rule-based and confidence-scored categorization of changes
 * into New Features, Improvements, and Fixes. It serves as a fallback when LLM analysis
 * is unavailable and provides confidence scoring for all categorization decisions.
 */

export class ReleaseNotesCategorizer {
  constructor(config = {}) {
    this.config = {
      // Confidence thresholds
      highConfidenceThreshold: config.highConfidenceThreshold || 0.8,
      mediumConfidenceThreshold: config.mediumConfidenceThreshold || 0.6,
      
      // Category weights for scoring
      categoryWeights: {
        keywords: 0.4,
        labels: 0.3,
        patterns: 0.2,
        context: 0.1
      },
      
      // Custom rules
      customRules: config.customRules || [],
      
      ...config
    };

    // Initialize categorization rules
    this._initializeCategoryRules();
  }

  /**
   * Categorize a single change into the most appropriate category
   * @param {Object} change - The change object to categorize
   * @returns {Object} Categorization result with category, confidence, and reasoning
   */
  categorizeChange(change) {
    if (!change || typeof change !== 'object') {
      throw new Error('Invalid change object provided for categorization');
    }

    try {
      // Calculate confidence scores for each category
      const scores = {
        newFeatures: this._calculateFeatureScore(change),
        improvements: this._calculateImprovementScore(change),
        fixes: this._calculateFixScore(change)
      };

      // Find the category with the highest score
      const bestCategory = Object.keys(scores).reduce((a, b) => 
        scores[a] > scores[b] ? a : b
      );

      const confidence = scores[bestCategory];
      const reasoning = this._generateReasoning(change, bestCategory, scores);

      return {
        category: bestCategory,
        confidence,
        reasoning,
        allScores: scores,
        alternatives: this.suggestAlternativeCategories(change, bestCategory)
      };

    } catch (error) {
      console.error('Error categorizing change:', error.message);
      
      // Fallback to default categorization
      return {
        category: 'improvements',
        confidence: 0.3,
        reasoning: 'Fallback categorization due to analysis error',
        allScores: { newFeatures: 0.3, improvements: 0.3, fixes: 0.3 },
        alternatives: []
      };
    }
  }

  /**
   * Get confidence score for a specific change-category combination
   * @param {Object} change - The change object
   * @param {string} category - The category to score ('newFeatures', 'improvements', 'fixes')
   * @returns {number} Confidence score between 0 and 1
   */
  getConfidenceScore(change, category) {
    if (!change || !category) {
      return 0;
    }

    switch (category) {
      case 'newFeatures':
        return this._calculateFeatureScore(change);
      case 'improvements':
        return this._calculateImprovementScore(change);
      case 'fixes':
        return this._calculateFixScore(change);
      default:
        return 0;
    }
  }

  /**
   * Suggest alternative categories for a change
   * @param {Object} change - The change object
   * @param {string} excludeCategory - Category to exclude from suggestions
   * @returns {Array} Array of alternative categories with confidence scores
   */
  suggestAlternativeCategories(change, excludeCategory = null) {
    const scores = {
      newFeatures: this._calculateFeatureScore(change),
      improvements: this._calculateImprovementScore(change),
      fixes: this._calculateFixScore(change)
    };

    // Remove the excluded category
    if (excludeCategory) {
      delete scores[excludeCategory];
    }

    // Sort by confidence and return top alternatives
    return Object.entries(scores)
      .sort(([, a], [, b]) => b - a)
      .filter(([, score]) => score > this.config.mediumConfidenceThreshold)
      .map(([category, confidence]) => ({
        category,
        confidence,
        reasoning: this._generateAlternativeReasoning(change, category)
      }));
  }

  /**
   * Batch categorize multiple changes
   * @param {Array} changes - Array of change objects
   * @returns {Array} Array of categorization results
   */
  categorizeChanges(changes) {
    if (!Array.isArray(changes)) {
      throw new Error('Changes must be an array');
    }

    return changes.map(change => {
      try {
        return {
          ...change,
          categorization: this.categorizeChange(change)
        };
      } catch (error) {
        console.error('Error categorizing individual change:', error.message);
        return {
          ...change,
          categorization: {
            category: 'improvements',
            confidence: 0.3,
            reasoning: 'Error during categorization',
            allScores: {},
            alternatives: []
          }
        };
      }
    });
  }

  /**
   * Initialize category rules and patterns
   * @private
   */
  _initializeCategoryRules() {
    // New Features indicators
    this.featureRules = {
      keywords: [
        'add', 'new', 'create', 'implement', 'introduce', 'launch',
        'feature', 'functionality', 'capability', 'support', 'enable'
      ],
      labels: [
        'feature', 'enhancement', 'new-feature', 'addition', 'capability'
      ],
      patterns: [
        /^add\s+/i,
        /^new\s+/i,
        /^implement\s+/i,
        /^introduce\s+/i,
        /^create\s+/i,
        /\b(new|added|introduced)\s+(feature|functionality|capability)\b/i
      ],
      exclusions: [
        'fix', 'bug', 'issue', 'error', 'problem', 'broken'
      ]
    };

    // Bug Fixes indicators
    this.fixRules = {
      keywords: [
        'fix', 'bug', 'issue', 'error', 'problem', 'resolve', 'correct',
        'repair', 'patch', 'hotfix', 'crash', 'broken', 'failing'
      ],
      labels: [
        'bug', 'bugfix', 'fix', 'hotfix', 'patch', 'issue', 'defect'
      ],
      patterns: [
        /^fix\s+/i,
        /^resolve\s+/i,
        /^correct\s+/i,
        /\b(fix|fixed|fixes|resolve|resolved)\b/i,
        /\b(bug|issue|error|problem)\b/i,
        /\bcrash\b/i
      ],
      exclusions: []
    };

    // Improvements indicators
    this.improvementRules = {
      keywords: [
        'improve', 'enhance', 'optimize', 'update', 'upgrade', 'refactor',
        'performance', 'speed', 'faster', 'better', 'efficiency', 'usability'
      ],
      labels: [
        'improvement', 'enhancement', 'optimization', 'performance', 'refactor'
      ],
      patterns: [
        /^improve\s+/i,
        /^enhance\s+/i,
        /^optimize\s+/i,
        /^update\s+/i,
        /\b(improve|improved|enhancement|optimization)\b/i,
        /\b(faster|better|more\s+efficient)\b/i
      ],
      exclusions: []
    };
  }

  /**
   * Calculate feature score for a change
   * @private
   */
  _calculateFeatureScore(change) {
    const title = (change.title || '').toLowerCase();
    const description = (change.description || '').toLowerCase();
    const labels = (change.labels || []).map(l => l.toLowerCase());
    
    let score = 0;
    const weights = this.config.categoryWeights;

    // Keyword matching - boost score for matches
    const keywordMatches = this.featureRules.keywords.filter(keyword => 
      title.includes(keyword) || description.includes(keyword)
    ).length;
    if (keywordMatches > 0) {
      score += Math.min(keywordMatches * 0.3, weights.keywords);
    }

    // Label matching - strong signal
    const labelMatches = this.featureRules.labels.filter(label => 
      labels.includes(label)
    ).length;
    if (labelMatches > 0) {
      score += Math.min(labelMatches * 0.4, weights.labels);
    }

    // Pattern matching - strong signal
    const patternMatches = this.featureRules.patterns.filter(pattern => 
      pattern.test(title) || pattern.test(description)
    ).length;
    if (patternMatches > 0) {
      score += Math.min(patternMatches * 0.4, weights.patterns);
    }

    // Exclusion penalty
    const exclusionMatches = this.featureRules.exclusions.filter(exclusion => 
      title.includes(exclusion) || description.includes(exclusion)
    ).length;
    score -= exclusionMatches * 0.2;

    // Context scoring
    score += this._calculateContextScore(change, 'newFeatures') * weights.context;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate improvement score for a change
   * @private
   */
  _calculateImprovementScore(change) {
    const title = (change.title || '').toLowerCase();
    const description = (change.description || '').toLowerCase();
    const labels = (change.labels || []).map(l => l.toLowerCase());
    
    let score = 0;
    const weights = this.config.categoryWeights;

    // Keyword matching
    const keywordMatches = this.improvementRules.keywords.filter(keyword => 
      title.includes(keyword) || description.includes(keyword)
    ).length;
    if (keywordMatches > 0) {
      score += Math.min(keywordMatches * 0.3, weights.keywords);
    }

    // Label matching
    const labelMatches = this.improvementRules.labels.filter(label => 
      labels.includes(label)
    ).length;
    if (labelMatches > 0) {
      score += Math.min(labelMatches * 0.4, weights.labels);
    }

    // Pattern matching
    const patternMatches = this.improvementRules.patterns.filter(pattern => 
      pattern.test(title) || pattern.test(description)
    ).length;
    if (patternMatches > 0) {
      score += Math.min(patternMatches * 0.4, weights.patterns);
    }

    // Context scoring
    score += this._calculateContextScore(change, 'improvements') * weights.context;

    // Default category bonus (improvements is the fallback)
    score += 0.1;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate fix score for a change
   * @private
   */
  _calculateFixScore(change) {
    const title = (change.title || '').toLowerCase();
    const description = (change.description || '').toLowerCase();
    const labels = (change.labels || []).map(l => l.toLowerCase());
    
    let score = 0;
    const weights = this.config.categoryWeights;

    // Keyword matching
    const keywordMatches = this.fixRules.keywords.filter(keyword => 
      title.includes(keyword) || description.includes(keyword)
    ).length;
    if (keywordMatches > 0) {
      score += Math.min(keywordMatches * 0.3, weights.keywords);
    }

    // Label matching
    const labelMatches = this.fixRules.labels.filter(label => 
      labels.includes(label)
    ).length;
    if (labelMatches > 0) {
      score += Math.min(labelMatches * 0.4, weights.labels);
    }

    // Pattern matching
    const patternMatches = this.fixRules.patterns.filter(pattern => 
      pattern.test(title) || pattern.test(description)
    ).length;
    if (patternMatches > 0) {
      score += Math.min(patternMatches * 0.4, weights.patterns);
    }

    // Context scoring
    score += this._calculateContextScore(change, 'fixes') * weights.context;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Calculate context-based score for a change
   * @private
   */
  _calculateContextScore(change, category) {
    let contextScore = 0;

    // Source-based scoring
    if (change.source === 'github') {
      // GitHub-specific context
      if (change.sourceType === 'pullRequest') {
        contextScore += 0.1; // PRs often have better descriptions
      }
    } else if (change.source === 'linear') {
      // Linear-specific context
      if (change.priority >= 3) {
        contextScore += category === 'fixes' ? 0.2 : 0.1;
      }
    }

    // Impact-based scoring
    if (change.impact === 'high') {
      contextScore += category === 'newFeatures' ? 0.2 : 0.1;
    } else if (change.impact === 'low') {
      contextScore += category === 'fixes' ? 0.1 : 0;
    }

    // Confidence-based scoring
    if (change.confidence && change.confidence > 0.8) {
      contextScore += 0.1;
    }

    return contextScore;
  }

  /**
   * Generate reasoning for categorization decision
   * @private
   */
  _generateReasoning(change, category, scores) {
    const reasons = [];
    const title = change.title || '';
    const description = change.description || '';

    // Add specific reasoning based on category
    switch (category) {
      case 'newFeatures':
        if (this.featureRules.keywords.some(k => title.toLowerCase().includes(k))) {
          reasons.push('Contains new feature keywords');
        }
        if (this.featureRules.patterns.some(p => p.test(title))) {
          reasons.push('Matches new feature patterns');
        }
        break;

      case 'fixes':
        if (this.fixRules.keywords.some(k => title.toLowerCase().includes(k))) {
          reasons.push('Contains bug fix keywords');
        }
        if (this.fixRules.patterns.some(p => p.test(title))) {
          reasons.push('Matches bug fix patterns');
        }
        break;

      case 'improvements':
        if (this.improvementRules.keywords.some(k => title.toLowerCase().includes(k))) {
          reasons.push('Contains improvement keywords');
        }
        reasons.push('Best fit among available categories');
        break;
    }

    // Add confidence context
    const confidence = scores[category];
    if (confidence > this.config.highConfidenceThreshold) {
      reasons.push('High confidence categorization');
    } else if (confidence > this.config.mediumConfidenceThreshold) {
      reasons.push('Medium confidence categorization');
    } else {
      reasons.push('Low confidence categorization');
    }

    return reasons.join('; ');
  }

  /**
   * Generate reasoning for alternative category suggestions
   * @private
   */
  _generateAlternativeReasoning(change, category) {
    const title = change.title || '';
    
    switch (category) {
      case 'newFeatures':
        return 'Could be a new feature based on title patterns';
      case 'improvements':
        return 'Could be an improvement based on enhancement indicators';
      case 'fixes':
        return 'Could be a bug fix based on issue-related keywords';
      default:
        return 'Alternative categorization possible';
    }
  }

  /**
   * Add custom categorization rule
   * @param {Object} rule - Custom rule object
   */
  addCustomRule(rule) {
    if (!rule || !rule.category || !rule.condition) {
      throw new Error('Invalid custom rule: must have category and condition');
    }

    this.config.customRules.push(rule);
  }

  /**
   * Get categorization statistics for a set of changes
   * @param {Array} changes - Array of changes to analyze
   * @returns {Object} Statistics about categorization confidence and distribution
   */
  getCategorizationStatistics(changes) {
    if (!Array.isArray(changes) || changes.length === 0) {
      return {
        total: 0,
        distribution: { newFeatures: 0, improvements: 0, fixes: 0 },
        averageConfidence: 0,
        highConfidenceCount: 0,
        lowConfidenceCount: 0
      };
    }

    const categorized = this.categorizeChanges(changes);
    const distribution = { newFeatures: 0, improvements: 0, fixes: 0 };
    let totalConfidence = 0;
    let highConfidenceCount = 0;
    let lowConfidenceCount = 0;

    categorized.forEach(change => {
      const cat = change.categorization;
      distribution[cat.category]++;
      totalConfidence += cat.confidence;
      
      if (cat.confidence > this.config.highConfidenceThreshold) {
        highConfidenceCount++;
      } else if (cat.confidence < this.config.mediumConfidenceThreshold) {
        lowConfidenceCount++;
      }
    });

    return {
      total: changes.length,
      distribution,
      averageConfidence: totalConfidence / changes.length,
      highConfidenceCount,
      lowConfidenceCount,
      confidenceDistribution: {
        high: highConfidenceCount,
        medium: changes.length - highConfidenceCount - lowConfidenceCount,
        low: lowConfidenceCount
      }
    };
  }

  /**
   * Get current configuration
   * @returns {Object} Current categorizer configuration
   */
  getConfiguration() {
    return { ...this.config };
  }

  /**
   * Update configuration
   * @param {Object} newConfig - New configuration options
   */
  updateConfiguration(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    // Reinitialize rules if category weights changed
    if (newConfig.categoryWeights) {
      this._initializeCategoryRules();
    }
  }
}

export default ReleaseNotesCategorizer;