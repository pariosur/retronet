/**
 * InsightMerger - Combines rule-based and LLM insights with deduplication and source attribution
 * 
 * This class merges insights from different sources (rule-based analysis and LLM analysis),
 * identifies and handles duplicates, and maintains proper source attribution and confidence scoring.
 */

import { InsightCategorizer } from './InsightCategorizer.js';

export class InsightMerger {
  constructor(config = {}) {
    this.config = {
      similarityThreshold: config.similarityThreshold || 0.5,
      maxInsightsPerCategory: config.maxInsightsPerCategory || 10,
      prioritizeAI: config.prioritizeAI !== false,
      enableCategorization: config.enableCategorization !== false,
      ...config
    };
    
    // Initialize categorizer if enabled
    this.categorizer = this.config.enableCategorization 
      ? new InsightCategorizer(config.categorizerConfig || {})
      : null;
  }

  /**
   * Merge rule-based and LLM insights with deduplication
   * @param {Object} ruleBasedInsights - Insights from rule-based analysis
   * @param {Object} llmInsights - Insights from LLM analysis
   * @returns {Object} Merged insights with source attribution
   */
  static merge(ruleBasedInsights, llmInsights) {
    const merger = new InsightMerger();
    return merger.mergeInsights(ruleBasedInsights, llmInsights);
  }

  /**
   * Merge insights from multiple sources
   * @param {Object} ruleBasedInsights - Rule-based insights
   * @param {Object} llmInsights - LLM insights
   * @returns {Object} Merged and deduplicated insights
   */
  mergeInsights(ruleBasedInsights, llmInsights) {
    // Normalize input insights
    const normalizedRuleBased = this._normalizeInsights(ruleBasedInsights, 'rules');
    const normalizedLLM = this._normalizeInsights(llmInsights, 'ai');

    // Merge each category separately
    const mergedInsights = {
      wentWell: this._mergeCategory(normalizedRuleBased.wentWell, normalizedLLM.wentWell),
      didntGoWell: this._mergeCategory(normalizedRuleBased.didntGoWell, normalizedLLM.didntGoWell),
      actionItems: this._mergeCategory(normalizedRuleBased.actionItems, normalizedLLM.actionItems)
    };

    // Apply categorization if enabled
    if (this.categorizer) {
      mergedInsights.wentWell = this.categorizer.categorizeInsights(mergedInsights.wentWell);
      mergedInsights.didntGoWell = this.categorizer.categorizeInsights(mergedInsights.didntGoWell);
      mergedInsights.actionItems = this.categorizer.categorizeInsights(mergedInsights.actionItems);
    }

    // Add merge metadata
    mergedInsights.mergeMetadata = {
      totalRuleBasedInsights: this._countInsights(normalizedRuleBased),
      totalLLMInsights: this._countInsights(normalizedLLM),
      totalMergedInsights: this._countInsights(mergedInsights),
      duplicatesFound: this._countDuplicates(normalizedRuleBased, normalizedLLM),
      categorized: !!this.categorizer,
      mergedAt: new Date().toISOString()
    };

    // Add category statistics if categorization is enabled
    if (this.categorizer) {
      const allInsights = [
        ...mergedInsights.wentWell,
        ...mergedInsights.didntGoWell,
        ...mergedInsights.actionItems
      ];
      mergedInsights.categoryStatistics = this.categorizer.getCategoryStatistics(allInsights);
    }

    return mergedInsights;
  }

  /**
   * Normalize insights to ensure consistent structure
   * @private
   */
  _normalizeInsights(insights, defaultSource) {
    if (!insights || typeof insights !== 'object') {
      return { wentWell: [], didntGoWell: [], actionItems: [] };
    }

    const normalized = {
      wentWell: this._normalizeInsightArray(insights.wentWell || [], defaultSource),
      didntGoWell: this._normalizeInsightArray(insights.didntGoWell || [], defaultSource),
      actionItems: this._normalizeInsightArray(insights.actionItems || [], defaultSource)
    };

    return normalized;
  }

  /**
   * Normalize an array of insights
   * @private
   */
  _normalizeInsightArray(insights, defaultSource) {
    if (!Array.isArray(insights)) {
      return [];
    }

    return insights.map(insight => this._normalizeInsight(insight, defaultSource));
  }

  /**
   * Normalize a single insight to ensure consistent structure
   * @private
   */
  _normalizeInsight(insight, defaultSource) {
    if (!insight || typeof insight !== 'object') {
      return null;
    }

    const normalized = {
      title: insight.title || 'Untitled insight',
      details: insight.details || insight.description || '',
      source: insight.source || defaultSource,
      confidence: this._normalizeConfidence(insight.confidence, defaultSource),
      category: insight.category || 'general',
      data: insight.data || {},
      
      // LLM-specific fields
      llmProvider: insight.llmProvider || null,
      llmModel: insight.llmModel || null,
      reasoning: insight.reasoning || null,
      
      // Action item specific fields
      priority: insight.priority || null,
      assignee: insight.assignee || null,
      
      // Metadata
      metadata: insight.metadata || {},
      originalId: insight.id || this._generateId(insight)
    };

    return normalized;
  }

  /**
   * Normalize confidence score based on source
   * @private
   */
  _normalizeConfidence(confidence, source) {
    if (typeof confidence === 'number' && confidence >= 0 && confidence <= 1) {
      return confidence;
    }

    // Default confidence scores by source
    const defaultConfidence = {
      'ai': 0.8,
      'rules': 0.9,
      'hybrid': 0.85
    };

    return defaultConfidence[source] || 0.7;
  }

  /**
   * Generate a unique ID for an insight
   * @private
   */
  _generateId(insight) {
    const content = (insight.title || '') + (insight.details || '');
    return content.toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .substring(0, 16) + '_' + Date.now().toString(36);
  }

  /**
   * Merge insights from a specific category
   * @private
   */
  _mergeCategory(ruleBasedInsights, llmInsights) {
    const allInsights = [...ruleBasedInsights, ...llmInsights].filter(Boolean);
    
    if (allInsights.length === 0) {
      return [];
    }

    // Find and merge similar insights
    const mergedInsights = [];
    const processedIds = new Set();

    for (const insight of allInsights) {
      if (processedIds.has(insight.originalId)) {
        continue;
      }

      // Find similar insights
      const similarInsights = this._findSimilarInsights(insight, allInsights);
      
      if (similarInsights.length > 1) {
        // Merge similar insights
        const mergedInsight = this._mergeSimilarInsights(similarInsights);
        mergedInsights.push(mergedInsight);
        
        // Mark all similar insights as processed
        similarInsights.forEach(si => processedIds.add(si.originalId));
      } else {
        // No similar insights found, add as-is
        mergedInsights.push(insight);
        processedIds.add(insight.originalId);
      }
    }

    // Sort by confidence and source priority
    const sortedInsights = this._sortInsights(mergedInsights);

    // Limit number of insights per category
    return sortedInsights.slice(0, this.config.maxInsightsPerCategory);
  }

  /**
   * Find insights similar to the given insight
   * @private
   */
  _findSimilarInsights(targetInsight, allInsights) {
    const similarInsights = [targetInsight];

    for (const insight of allInsights) {
      if (insight.originalId === targetInsight.originalId) {
        continue;
      }

      if (this.detectSimilarInsights(targetInsight, insight)) {
        similarInsights.push(insight);
      }
    }

    return similarInsights;
  }

  /**
   * Detect if two insights are similar enough to be merged
   * @param {Object} insight1 - First insight
   * @param {Object} insight2 - Second insight
   * @returns {boolean} True if insights are similar
   */
  static detectSimilarInsights(insight1, insight2) {
    const merger = new InsightMerger();
    return merger.detectSimilarInsights(insight1, insight2);
  }

  /**
   * Detect similarity between two insights
   * @param {Object} insight1 - First insight
   * @param {Object} insight2 - Second insight
   * @returns {boolean} True if insights are similar
   */
  detectSimilarInsights(insight1, insight2) {
    if (!insight1 || !insight2) {
      return false;
    }

    // Calculate similarity scores for different aspects
    const titleSimilarity = this._calculateTextSimilarity(insight1.title, insight2.title);
    const detailsSimilarity = this._calculateTextSimilarity(insight1.details, insight2.details);
    const categorySimilarity = insight1.category === insight2.category ? 1 : 0;

    // Check for keyword overlap
    const keywordSimilarity = this._calculateKeywordSimilarity(insight1, insight2);

    // Weighted similarity score with more lenient thresholds
    const overallSimilarity = (
      titleSimilarity * 0.4 +
      detailsSimilarity * 0.2 +
      categorySimilarity * 0.1 +
      keywordSimilarity * 0.3
    );

    // Also check individual high similarity conditions
    const highTitleSimilarity = titleSimilarity >= 0.5;
    const highDetailsSimilarity = detailsSimilarity >= 0.5;
    const strongKeywordMatch = keywordSimilarity >= 0.8;
    const sameCategory = categorySimilarity === 1;
    
    // Check for moderate similarity in multiple areas
    const moderateTitleSimilarity = titleSimilarity >= 0.3;
    const moderateDetailsSimilarity = detailsSimilarity >= 0.3;
    const moderateKeywordMatch = keywordSimilarity >= 0.3;

    return overallSimilarity >= this.config.similarityThreshold || 
           highTitleSimilarity || 
           highDetailsSimilarity ||
           (strongKeywordMatch && sameCategory) ||
           (moderateTitleSimilarity && moderateDetailsSimilarity) ||
           (moderateDetailsSimilarity && moderateKeywordMatch);
  }

  /**
   * Calculate text similarity using simple word overlap
   * @private
   */
  _calculateTextSimilarity(text1, text2) {
    if (!text1 || !text2) {
      return 0;
    }

    const words1 = this._extractWords(text1);
    const words2 = this._extractWords(text2);

    if (words1.length === 0 || words2.length === 0) {
      return 0;
    }

    const intersection = words1.filter(word => words2.includes(word));
    const maxLength = Math.max(words1.length, words2.length);

    // Use Jaccard similarity but with a more lenient calculation
    return intersection.length / maxLength;
  }

  /**
   * Calculate keyword similarity between insights
   * @private
   */
  _calculateKeywordSimilarity(insight1, insight2) {
    const keywords1 = this._extractKeywords(insight1);
    const keywords2 = this._extractKeywords(insight2);

    if (keywords1.length === 0 || keywords2.length === 0) {
      return 0;
    }

    const intersection = keywords1.filter(keyword => keywords2.includes(keyword));
    const union = [...new Set([...keywords1, ...keywords2])];

    return intersection.length / union.length;
  }

  /**
   * Extract meaningful words from text
   * @private
   */
  _extractWords(text) {
    if (!text || typeof text !== 'string') {
      return [];
    }

    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
      'is', 'are', 'was', 'were', 'be', 'been', 'have', 'has', 'had', 'do', 'does', 'did',
      'will', 'would', 'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those'
    ]);

    return text.toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopWords.has(word))
      .slice(0, 20); // Limit to prevent performance issues
  }

  /**
   * Extract keywords from insight content
   * @private
   */
  _extractKeywords(insight) {
    const text = `${insight.title} ${insight.details}`.toLowerCase();
    
    // Common development and project management keywords
    const keywords = [];
    const keywordPatterns = [
      /\b(bug|fix|error|issue|problem|defect)\b/g,
      /\b(feature|enhancement|improvement|add|new)\b/g,
      /\b(test|testing|qa|quality)\b/g,
      /\b(deploy|deployment|release|production)\b/g,
      /\b(performance|speed|slow|fast|optimize)\b/g,
      /\b(security|auth|authentication|permission)\b/g,
      /\b(ui|ux|interface|design|user)\b/g,
      /\b(api|endpoint|service|backend)\b/g,
      /\b(database|db|query|data)\b/g,
      /\b(documentation|docs|readme)\b/g,
      /\b(milestone|deadline|schedule|timeline)\b/g,
      /\b(blocked|blocker|dependency|waiting)\b/g,
      /\b(review|feedback|discussion|meeting)\b/g,
      /\b(priority|urgent|critical|important)\b/g
    ];

    keywordPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        keywords.push(...matches);
      }
    });

    return [...new Set(keywords)];
  }

  /**
   * Merge multiple similar insights into one
   * @private
   */
  _mergeSimilarInsights(insights) {
    if (insights.length === 1) {
      return insights[0];
    }

    // Prioritize AI insights if configured, but preserve original order for sorting
    const sortedByPriority = [...insights].sort((a, b) => {
      if (this.config.prioritizeAI) {
        if (a.source === 'ai' && b.source !== 'ai') return -1;
        if (b.source === 'ai' && a.source !== 'ai') return 1;
      }
      return b.confidence - a.confidence;
    });

    const primary = sortedByPriority[0];

    // Create merged insight
    const merged = {
      ...primary,
      source: 'hybrid',
      confidence: this._calculateMergedConfidence(insights),
      
      // Combine details from all insights
      details: this._combineDetails(insights),
      
      // Merge data from all sources
      data: this._mergeData(insights),
      
      // Track source insights
      sourceInsights: insights.map(insight => ({
        source: insight.source,
        originalId: insight.originalId,
        confidence: insight.confidence,
        title: insight.title
      })),
      
      // Enhanced metadata
      metadata: {
        ...primary.metadata,
        mergedFrom: insights.length,
        sources: [...new Set(insights.map(i => i.source))],
        mergedAt: new Date().toISOString()
      }
    };

    return merged;
  }

  /**
   * Calculate confidence score for merged insight
   * @private
   */
  _calculateMergedConfidence(insights) {
    if (insights.length === 0) return 0;
    if (insights.length === 1) return insights[0].confidence;

    // Higher confidence when multiple sources agree
    const avgConfidence = insights.reduce((sum, insight) => sum + insight.confidence, 0) / insights.length;
    const agreementBonus = Math.min(0.1, (insights.length - 1) * 0.05);
    
    return Math.min(1, avgConfidence + agreementBonus);
  }

  /**
   * Combine details from multiple insights
   * @private
   */
  _combineDetails(insights) {
    if (insights.length === 0) {
      return '';
    }

    // Sort by priority to get the best primary insight
    const sortedByPriority = [...insights].sort((a, b) => {
      if (this.config.prioritizeAI) {
        if (a.source === 'ai' && b.source !== 'ai') return -1;
        if (b.source === 'ai' && a.source !== 'ai') return 1;
      }
      return b.confidence - a.confidence;
    });

    const primary = sortedByPriority[0];
    const secondary = sortedByPriority.slice(1);

    if (secondary.length === 0) {
      return primary.details || '';
    }

    // Start with primary details
    let combinedDetails = primary.details || '';

    // Add unique information from secondary insights
    secondary.forEach(insight => {
      if (insight.details && insight.details !== primary.details) {
        const uniqueInfo = this._extractUniqueInformation(insight.details, combinedDetails);
        if (uniqueInfo) {
          combinedDetails += combinedDetails ? ` ${uniqueInfo}` : uniqueInfo;
        }
      }
    });

    return combinedDetails.trim();
  }

  /**
   * Extract unique information from secondary details
   * @private
   */
  _extractUniqueInformation(secondaryDetails, primaryDetails) {
    if (!secondaryDetails || !primaryDetails) {
      return secondaryDetails || '';
    }

    const primaryWords = new Set(this._extractWords(primaryDetails));
    const secondaryWords = this._extractWords(secondaryDetails);
    
    const uniqueWords = secondaryWords.filter(word => !primaryWords.has(word));
    
    if (uniqueWords.length > 2) {
      // Try to extract meaningful phrases containing unique words
      const sentences = secondaryDetails.split(/[.!?]+/);
      const uniqueSentences = sentences.filter(sentence => {
        const sentenceWords = this._extractWords(sentence);
        return sentenceWords.some(word => uniqueWords.includes(word));
      });
      
      if (uniqueSentences.length > 0) {
        return uniqueSentences[0].trim();
      }
    }

    return '';
  }

  /**
   * Merge data objects from multiple insights
   * @private
   */
  _mergeData(insights) {
    const mergedData = {};

    insights.forEach(insight => {
      if (insight.data && typeof insight.data === 'object') {
        Object.assign(mergedData, insight.data);
      }
    });

    return mergedData;
  }

  /**
   * Sort insights by priority and confidence
   * @private
   */
  _sortInsights(insights) {
    return insights.sort((a, b) => {
      // First sort by source priority if configured
      if (this.config.prioritizeAI) {
        if (a.source === 'ai' && b.source !== 'ai') return -1;
        if (b.source === 'ai' && a.source !== 'ai') return 1;
        if (a.source === 'hybrid' && b.source === 'rules') return -1;
        if (b.source === 'hybrid' && a.source === 'rules') return 1;
      }

      // Then sort by confidence
      return b.confidence - a.confidence;
    });
  }

  /**
   * Count total insights in an insights object
   * @private
   */
  _countInsights(insights) {
    if (!insights || typeof insights !== 'object') {
      return 0;
    }

    return (insights.wentWell?.length || 0) +
           (insights.didntGoWell?.length || 0) +
           (insights.actionItems?.length || 0);
  }

  /**
   * Count duplicates found during merge
   * @private
   */
  _countDuplicates(ruleBasedInsights, llmInsights) {
    let duplicates = 0;
    const allRuleInsights = [
      ...(ruleBasedInsights.wentWell || []),
      ...(ruleBasedInsights.didntGoWell || []),
      ...(ruleBasedInsights.actionItems || [])
    ];
    const allLLMInsights = [
      ...(llmInsights.wentWell || []),
      ...(llmInsights.didntGoWell || []),
      ...(llmInsights.actionItems || [])
    ];

    allRuleInsights.forEach(ruleInsight => {
      allLLMInsights.forEach(llmInsight => {
        if (this.detectSimilarInsights(ruleInsight, llmInsight)) {
          duplicates++;
        }
      });
    });

    return duplicates;
  }

  /**
   * Get merger configuration
   * @returns {Object} Current configuration
   */
  getConfiguration() {
    return { ...this.config };
  }

  /**
   * Filter insights based on criteria
   * @param {Object} insights - Insights object with wentWell, didntGoWell, actionItems
   * @param {Object} filters - Filter criteria
   * @returns {Object} Filtered insights
   */
  filterInsights(insights, filters = {}) {
    if (!this.categorizer) {
      console.warn('Categorizer not enabled, returning unfiltered insights');
      return insights;
    }

    return {
      wentWell: this.categorizer.filterInsights(insights.wentWell || [], filters),
      didntGoWell: this.categorizer.filterInsights(insights.didntGoWell || [], filters),
      actionItems: this.categorizer.filterInsights(insights.actionItems || [], filters),
      mergeMetadata: insights.mergeMetadata,
      categoryStatistics: insights.categoryStatistics
    };
  }

  /**
   * Sort insights based on criteria
   * @param {Object} insights - Insights object with wentWell, didntGoWell, actionItems
   * @param {Object} sortOptions - Sort criteria
   * @returns {Object} Sorted insights
   */
  sortInsights(insights, sortOptions = {}) {
    if (!this.categorizer) {
      console.warn('Categorizer not enabled, returning unsorted insights');
      return insights;
    }

    return {
      wentWell: this.categorizer.sortInsights(insights.wentWell || [], sortOptions),
      didntGoWell: this.categorizer.sortInsights(insights.didntGoWell || [], sortOptions),
      actionItems: this.categorizer.sortInsights(insights.actionItems || [], sortOptions),
      mergeMetadata: insights.mergeMetadata,
      categoryStatistics: insights.categoryStatistics
    };
  }

  /**
   * Get available categories
   * @returns {Array} Array of available categories
   */
  getAvailableCategories() {
    if (!this.categorizer) {
      return [];
    }
    return this.categorizer.getAvailableCategories();
  }

  /**
   * Update merger configuration
   * @param {Object} newConfig - New configuration options
   */
  updateConfiguration(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    // Update categorizer if configuration changed
    if (this.categorizer && newConfig.categorizerConfig) {
      this.categorizer.updateConfiguration(newConfig.categorizerConfig);
    }
    
    // Initialize or disable categorizer based on new config
    if (newConfig.enableCategorization !== undefined) {
      if (newConfig.enableCategorization && !this.categorizer) {
        this.categorizer = new InsightCategorizer(newConfig.categorizerConfig || {});
      } else if (!newConfig.enableCategorization) {
        this.categorizer = null;
      }
    }
  }
}

export default InsightMerger;