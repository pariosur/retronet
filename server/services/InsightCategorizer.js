/**
 * InsightCategorizer - Categorizes insights into technical, process, and team dynamics categories
 * 
 * This class analyzes insight content to automatically categorize insights and provides
 * filtering, sorting, and priority scoring functionality.
 */

export class InsightCategorizer {
  constructor(config = {}) {
    this.config = {
      enableAutoCategories: config.enableAutoCategories !== false,
      customCategories: config.customCategories || [],
      priorityWeights: {
        confidence: config.priorityWeights?.confidence || 0.4,
        impact: config.priorityWeights?.impact || 0.3,
        urgency: config.priorityWeights?.urgency || 0.2,
        source: config.priorityWeights?.source || 0.1
      },
      ...config
    };

    // Define category patterns for automatic categorization
    this.categoryPatterns = {
      technical: {
        keywords: [
          'bug', 'fix', 'error', 'exception', 'crash', 'performance', 'optimization',
          'code', 'api', 'database', 'query', 'deployment', 'build', 'test', 'testing',
          'security', 'vulnerability', 'authentication', 'authorization', 'infrastructure',
          'server', 'client', 'frontend', 'backend', 'framework', 'library', 'dependency',
          'refactor', 'architecture', 'design pattern', 'algorithm', 'data structure',
          'memory', 'cpu', 'network', 'latency', 'throughput', 'scalability'
        ],
        patterns: [
          /\b(technical|code|api|database|server|client|bug|error|performance)\b/i,
          /\b(deployment|build|test|security|infrastructure|framework)\b/i,
          /\b(refactor|architecture|algorithm|memory|cpu|network)\b/i
        ]
      },
      process: {
        keywords: [
          'process', 'workflow', 'procedure', 'methodology', 'sprint', 'standup',
          'retrospective', 'planning', 'estimation', 'deadline', 'milestone', 'release',
          'documentation', 'review', 'approval', 'communication', 'meeting', 'ceremony',
          'agile', 'scrum', 'kanban', 'continuous integration', 'ci/cd', 'devops',
          'quality assurance', 'qa', 'deployment process', 'rollback', 'monitoring',
          'incident', 'postmortem', 'automation', 'manual', 'efficiency', 'bottleneck'
        ],
        patterns: [
          /\b(process|workflow|procedure|methodology|sprint|planning)\b/i,
          /\b(documentation|review|meeting|agile|scrum|kanban)\b/i,
          /\b(ci\/cd|devops|qa|deployment|automation|efficiency)\b/i
        ]
      },
      teamDynamics: {
        keywords: [
          'team', 'collaboration', 'communication', 'feedback', 'morale', 'culture',
          'onboarding', 'mentoring', 'knowledge sharing', 'pair programming', 'mob programming',
          'conflict', 'resolution', 'leadership', 'motivation', 'engagement', 'burnout',
          'work-life balance', 'remote', 'distributed', 'timezone', 'async', 'synchronous',
          'trust', 'transparency', 'accountability', 'responsibility', 'ownership',
          'skill development', 'training', 'learning', 'growth', 'career', 'promotion'
        ],
        patterns: [
          /\b(team|collaboration|communication|feedback|morale|culture)\b/i,
          /\b(onboarding|mentoring|knowledge sharing|pair programming)\b/i,
          /\b(conflict|leadership|motivation|burnout|work-life balance)\b/i,
          /\b(remote|distributed|trust|transparency|accountability)\b/i,
          /\b(skill development|training|learning|growth|career)\b/i
        ]
      }
    };

    // Define impact indicators
    this.impactIndicators = {
      high: [
        'critical', 'urgent', 'blocker', 'blocking', 'severe', 'major', 'significant',
        'production', 'outage', 'downtime', 'security breach', 'data loss',
        'customer impact', 'revenue impact', 'compliance', 'legal'
      ],
      medium: [
        'important', 'moderate', 'noticeable', 'affects', 'impacts', 'delays',
        'performance issue', 'user experience', 'workflow disruption'
      ],
      low: [
        'minor', 'small', 'cosmetic', 'nice to have', 'enhancement', 'improvement',
        'optimization', 'cleanup', 'refactoring'
      ]
    };

    // Define urgency indicators
    this.urgencyIndicators = {
      high: [
        'immediately', 'asap', 'urgent', 'critical', 'emergency', 'hotfix',
        'before release', 'end of sprint', 'deadline'
      ],
      medium: [
        'soon', 'next sprint', 'this week', 'priority', 'important'
      ],
      low: [
        'eventually', 'future', 'backlog', 'when time permits', 'nice to have'
      ]
    };
  }

  /**
   * Categorize insights automatically based on content analysis
   * @param {Array} insights - Array of insights to categorize
   * @returns {Array} Insights with category field added
   */
  categorizeInsights(insights) {
    if (!Array.isArray(insights)) {
      return [];
    }

    return insights.map(insight => {
      const category = this.determineCategory(insight);
      const impact = this.assessImpact(insight);
      const urgency = this.assessUrgency(insight);
      const priority = this.calculatePriority(insight, impact, urgency);

      return {
        ...insight,
        category,
        impact,
        urgency,
        priority,
        categoryMetadata: {
          autoDetected: true,
          confidence: this.getCategoryConfidence(insight, category),
          alternativeCategories: this.getAlternativeCategories(insight, category)
        }
      };
    });
  }

  /**
   * Determine the primary category for an insight
   * @param {Object} insight - Insight object
   * @returns {string} Category name
   */
  determineCategory(insight) {
    if (!this.config.enableAutoCategories) {
      return insight.category || 'general';
    }

    // If insight already has a category, validate it
    if (insight.category && this.isValidCategory(insight.category)) {
      return insight.category;
    }

    const content = `${insight.title || ''} ${insight.details || ''}`.toLowerCase();
    const scores = {};

    // Calculate scores for each category
    Object.keys(this.categoryPatterns).forEach(category => {
      scores[category] = this.calculateCategoryScore(content, category);
    });

    // Find the category with the highest score
    const maxScore = Math.max(...Object.values(scores));
    const bestCategory = Object.keys(scores).find(cat => scores[cat] === maxScore);

    // Only assign category if confidence is above threshold
    if (maxScore > 0.3) {
      return bestCategory;
    }

    return 'general';
  }

  /**
   * Calculate category score based on keyword and pattern matching
   * @param {string} content - Insight content
   * @param {string} category - Category to score
   * @returns {number} Score between 0 and 1
   */
  calculateCategoryScore(content, category) {
    const categoryData = this.categoryPatterns[category];
    if (!categoryData) return 0;

    let score = 0;
    let totalPossible = 0;

    // Score based on keyword matches
    const keywordMatches = categoryData.keywords.filter(keyword => 
      content.includes(keyword.toLowerCase())
    ).length;
    const keywordScore = Math.min(keywordMatches / 3, 1); // Normalize to max 1
    score += keywordScore * 0.6;
    totalPossible += 0.6;

    // Score based on pattern matches
    const patternMatches = categoryData.patterns.filter(pattern => 
      pattern.test(content)
    ).length;
    const patternScore = Math.min(patternMatches / 2, 1); // Normalize to max 1
    score += patternScore * 0.4;
    totalPossible += 0.4;

    return totalPossible > 0 ? score / totalPossible : 0;
  }

  /**
   * Get category confidence score
   * @param {Object} insight - Insight object
   * @param {string} category - Assigned category
   * @returns {number} Confidence score between 0 and 1
   */
  getCategoryConfidence(insight, category) {
    if (category === 'general') return 0.5;
    
    const content = `${insight.title || ''} ${insight.details || ''}`.toLowerCase();
    return this.calculateCategoryScore(content, category);
  }

  /**
   * Get alternative categories that also match
   * @param {Object} insight - Insight object
   * @param {string} primaryCategory - Primary assigned category
   * @returns {Array} Array of alternative categories with scores
   */
  getAlternativeCategories(insight, primaryCategory) {
    const content = `${insight.title || ''} ${insight.details || ''}`.toLowerCase();
    const alternatives = [];

    Object.keys(this.categoryPatterns).forEach(category => {
      if (category !== primaryCategory) {
        const score = this.calculateCategoryScore(content, category);
        if (score > 0.2) {
          alternatives.push({ category, score });
        }
      }
    });

    return alternatives.sort((a, b) => b.score - a.score);
  }

  /**
   * Assess impact level of an insight
   * @param {Object} insight - Insight object
   * @returns {string} Impact level: 'high', 'medium', 'low'
   */
  assessImpact(insight) {
    const content = `${insight.title || ''} ${insight.details || ''}`.toLowerCase();

    // Check for explicit impact indicators
    for (const [level, indicators] of Object.entries(this.impactIndicators)) {
      if (indicators.some(indicator => content.includes(indicator))) {
        return level;
      }
    }

    // Assess based on insight type and source
    if (insight.source === 'ai' && insight.confidence > 0.8) {
      return 'medium';
    }

    if (insight.category === 'technical' && content.includes('production')) {
      return 'high';
    }

    if (insight.category === 'teamDynamics' && content.includes('burnout')) {
      return 'high';
    }

    return 'medium'; // Default impact
  }

  /**
   * Assess urgency level of an insight
   * @param {Object} insight - Insight object
   * @returns {string} Urgency level: 'high', 'medium', 'low'
   */
  assessUrgency(insight) {
    const content = `${insight.title || ''} ${insight.details || ''}`.toLowerCase();

    // Check for explicit urgency indicators
    for (const [level, indicators] of Object.entries(this.urgencyIndicators)) {
      if (indicators.some(indicator => content.includes(indicator))) {
        return level;
      }
    }

    // Assess based on insight priority field if available
    if (insight.priority) {
      const priority = insight.priority.toLowerCase();
      if (priority === 'high' || priority === 'critical') return 'high';
      if (priority === 'medium') return 'medium';
      if (priority === 'low') return 'low';
    }

    return 'medium'; // Default urgency
  }

  /**
   * Calculate overall priority score for an insight
   * @param {Object} insight - Insight object
   * @param {string} impact - Impact level
   * @param {string} urgency - Urgency level
   * @returns {number} Priority score between 0 and 1
   */
  calculatePriority(insight, impact, urgency) {
    const weights = this.config.priorityWeights;
    
    // Convert levels to numeric scores
    const impactScore = this.levelToScore(impact);
    const urgencyScore = this.levelToScore(urgency);
    const confidenceScore = insight.confidence || 0.5;
    
    // Source priority (AI insights might be weighted differently)
    const sourceScore = this.getSourceScore(insight.source);

    // Calculate weighted priority
    const priority = (
      confidenceScore * weights.confidence +
      impactScore * weights.impact +
      urgencyScore * weights.urgency +
      sourceScore * weights.source
    );

    return Math.min(Math.max(priority, 0), 1); // Clamp between 0 and 1
  }

  /**
   * Convert level string to numeric score
   * @param {string} level - Level string ('high', 'medium', 'low')
   * @returns {number} Numeric score
   */
  levelToScore(level) {
    switch (level) {
      case 'high': return 1.0;
      case 'medium': return 0.6;
      case 'low': return 0.3;
      default: return 0.5;
    }
  }

  /**
   * Get source priority score
   * @param {string} source - Insight source
   * @returns {number} Source score
   */
  getSourceScore(source) {
    switch (source) {
      case 'ai': return 0.8;
      case 'hybrid': return 0.9;
      case 'rules': return 0.7;
      default: return 0.5;
    }
  }

  /**
   * Filter insights based on criteria
   * @param {Array} insights - Array of insights to filter
   * @param {Object} filters - Filter criteria
   * @returns {Array} Filtered insights
   */
  filterInsights(insights, filters = {}) {
    if (!Array.isArray(insights)) {
      return [];
    }

    return insights.filter(insight => {
      // Filter by category
      if (filters.categories && filters.categories.length > 0) {
        if (!filters.categories.includes(insight.category)) {
          return false;
        }
      }

      // Filter by source
      if (filters.sources && filters.sources.length > 0) {
        if (!filters.sources.includes(insight.source)) {
          return false;
        }
      }

      // Filter by impact
      if (filters.impact && filters.impact.length > 0) {
        if (!filters.impact.includes(insight.impact)) {
          return false;
        }
      }

      // Filter by urgency
      if (filters.urgency && filters.urgency.length > 0) {
        if (!filters.urgency.includes(insight.urgency)) {
          return false;
        }
      }

      // Filter by minimum priority
      if (filters.minPriority !== undefined) {
        if (insight.priority < filters.minPriority) {
          return false;
        }
      }

      // Filter by minimum confidence
      if (filters.minConfidence !== undefined) {
        if ((insight.confidence || 0) < filters.minConfidence) {
          return false;
        }
      }

      // Filter by text search
      if (filters.search && typeof filters.search === 'string') {
        const searchText = filters.search.toLowerCase();
        const content = `${insight.title || ''} ${insight.details || ''}`.toLowerCase();
        if (!content.includes(searchText)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Sort insights based on criteria
   * @param {Array} insights - Array of insights to sort
   * @param {Object} sortOptions - Sort criteria
   * @returns {Array} Sorted insights
   */
  sortInsights(insights, sortOptions = {}) {
    if (!Array.isArray(insights)) {
      return [];
    }

    const {
      sortBy = 'priority',
      sortOrder = 'desc',
      secondarySort = 'confidence'
    } = sortOptions;

    return [...insights].sort((a, b) => {
      let primaryComparison = this.compareInsights(a, b, sortBy);
      
      if (primaryComparison === 0 && secondarySort) {
        primaryComparison = this.compareInsights(a, b, secondarySort);
      }

      return sortOrder === 'desc' ? -primaryComparison : primaryComparison;
    });
  }

  /**
   * Compare two insights based on a field
   * @param {Object} a - First insight
   * @param {Object} b - Second insight
   * @param {string} field - Field to compare
   * @returns {number} Comparison result
   */
  compareInsights(a, b, field) {
    switch (field) {
      case 'priority':
        return (a.priority || 0) - (b.priority || 0);
      
      case 'confidence':
        return (a.confidence || 0) - (b.confidence || 0);
      
      case 'impact':
        return this.levelToScore(a.impact) - this.levelToScore(b.impact);
      
      case 'urgency':
        return this.levelToScore(a.urgency) - this.levelToScore(b.urgency);
      
      case 'category':
        return (a.category || '').localeCompare(b.category || '');
      
      case 'source':
        return this.getSourceScore(a.source) - this.getSourceScore(b.source);
      
      case 'title':
        return (a.title || '').localeCompare(b.title || '');
      
      default:
        return 0;
    }
  }

  /**
   * Get available categories
   * @returns {Array} Array of category objects with metadata
   */
  getAvailableCategories() {
    const defaultCategories = [
      {
        id: 'technical',
        name: 'Technical',
        description: 'Code, infrastructure, and technical implementation issues',
        color: '#3B82F6'
      },
      {
        id: 'process',
        name: 'Process',
        description: 'Workflow, methodology, and process-related insights',
        color: '#10B981'
      },
      {
        id: 'teamDynamics',
        name: 'Team Dynamics',
        description: 'Team collaboration, communication, and culture',
        color: '#8B5CF6'
      },
      {
        id: 'general',
        name: 'General',
        description: 'General insights that don\'t fit other categories',
        color: '#6B7280'
      }
    ];

    return [...defaultCategories, ...this.config.customCategories];
  }

  /**
   * Check if a category is valid
   * @param {string} category - Category to validate
   * @returns {boolean} True if valid
   */
  isValidCategory(category) {
    const availableCategories = this.getAvailableCategories();
    return availableCategories.some(cat => cat.id === category);
  }

  /**
   * Get insight statistics by category
   * @param {Array} insights - Array of insights
   * @returns {Object} Statistics object
   */
  getCategoryStatistics(insights) {
    if (!Array.isArray(insights)) {
      return {};
    }

    const stats = {
      total: insights.length,
      byCategory: {},
      bySource: {},
      byImpact: {},
      byUrgency: {},
      averagePriority: 0,
      averageConfidence: 0
    };

    // Initialize category counts
    this.getAvailableCategories().forEach(cat => {
      stats.byCategory[cat.id] = 0;
    });

    let totalPriority = 0;
    let totalConfidence = 0;

    insights.forEach(insight => {
      // Count by category
      const category = insight.category || 'general';
      stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;

      // Count by source
      const source = insight.source || 'unknown';
      stats.bySource[source] = (stats.bySource[source] || 0) + 1;

      // Count by impact
      const impact = insight.impact || 'medium';
      stats.byImpact[impact] = (stats.byImpact[impact] || 0) + 1;

      // Count by urgency
      const urgency = insight.urgency || 'medium';
      stats.byUrgency[urgency] = (stats.byUrgency[urgency] || 0) + 1;

      // Sum for averages
      totalPriority += insight.priority || 0;
      totalConfidence += insight.confidence || 0;
    });

    // Calculate averages
    if (insights.length > 0) {
      stats.averagePriority = totalPriority / insights.length;
      stats.averageConfidence = totalConfidence / insights.length;
    }

    return stats;
  }

  /**
   * Update configuration
   * @param {Object} newConfig - New configuration options
   */
  updateConfiguration(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Get current configuration
   * @returns {Object} Current configuration
   */
  getConfiguration() {
    return { ...this.config };
  }
}

export default InsightCategorizer;