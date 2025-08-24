/**
 * ResponseParser - Converts LLM text responses to structured insights
 * 
 * This class handles parsing LLM responses into the expected insight format,
 * with fallback mechanisms for malformed responses and validation of required fields.
 */
class ResponseParser {
  /**
   * Parse LLM response into structured insights
   * @param {string} response - Raw LLM response text
   * @param {string} provider - LLM provider name for source attribution
   * @returns {Object} Structured insights object with wentWell, didntGoWell, actionItems
   */
  static parseResponse(response, provider = 'unknown') {
    if (!response || typeof response !== 'string' || response.trim().length === 0) {
      console.warn('Empty or invalid LLM response, returning empty insights');
      return {
        wentWell: [],
        didntGoWell: [],
        actionItems: [],
        metadata: {
          provider,
          parseError: 'Empty response from LLM',
          fallback: true
        }
      };
    }

    // First try JSON parsing
    try {
      const jsonResult = this.parseJsonResponse(response, provider);
      if (jsonResult) {
        return jsonResult;
      }
    } catch (error) {
      console.warn('JSON parsing failed, falling back to text extraction:', error.message);
    }

    // Fallback to text extraction
    return this.parseTextResponse(response, provider);
  }

  /**
   * Parse JSON-formatted LLM response
   * @param {string} response - Raw response text
   * @param {string} provider - LLM provider name
   * @returns {Object|null} Parsed insights or null if not valid JSON
   */
  static parseJsonResponse(response, provider) {
    let parsed;
    
    // First try to parse the entire response as JSON
    try {
      parsed = JSON.parse(response);
    } catch (error) {
      // Try to extract JSON from response (handle cases where LLM adds extra text)
      // Look for balanced braces or brackets
      let jsonStr = null;
      
      // Try to find object JSON
      const objectMatch = response.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
      if (objectMatch) {
        jsonStr = objectMatch[0];
      } else {
        // Try to find array JSON
        const arrayMatch = response.match(/\[[^\[\]]*(?:\[[^\[\]]*\][^\[\]]*)*\]/);
        if (arrayMatch) {
          jsonStr = arrayMatch[0];
        }
      }
      
      if (!jsonStr) {
        return null;
      }

      try {
        parsed = JSON.parse(jsonStr);
      } catch (parseError) {
        return null;
      }
    }

    // Validate and normalize the structure
    const insights = {
      wentWell: [],
      didntGoWell: [],
      actionItems: []
    };

    // Handle various possible JSON structures
    if (parsed.wentWell || parsed.didntGoWell || parsed.actionItems) {
      // Direct structure match
      insights.wentWell = this.normalizeInsights(parsed.wentWell || [], 'ai', provider);
      insights.didntGoWell = this.normalizeInsights(parsed.didntGoWell || [], 'ai', provider);
      insights.actionItems = this.normalizeActionItems(parsed.actionItems || [], 'ai', provider);
    } else if (parsed.insights) {
      // Nested insights structure
      const nestedInsights = parsed.insights;
      insights.wentWell = this.normalizeInsights(nestedInsights.wentWell || [], 'ai', provider);
      insights.didntGoWell = this.normalizeInsights(nestedInsights.didntGoWell || [], 'ai', provider);
      insights.actionItems = this.normalizeActionItems(nestedInsights.actionItems || [], 'ai', provider);
    } else if (Array.isArray(parsed)) {
      // Array of categorized insights
      parsed.forEach(item => {
        if (item.category && item.insights) {
          const category = item.category.toLowerCase();
          if (category.includes('went well') || category.includes('positive')) {
            insights.wentWell.push(...this.normalizeInsights(item.insights, 'ai', provider));
          } else if (category.includes('didn\'t go well') || category.includes('negative') || category.includes('issues')) {
            insights.didntGoWell.push(...this.normalizeInsights(item.insights, 'ai', provider));
          } else if (category.includes('action') || category.includes('improvement')) {
            insights.actionItems.push(...this.normalizeActionItems(item.insights, 'ai', provider));
          }
        }
      });
    }

    return insights;
  }

  /**
   * Parse text-formatted LLM response using pattern matching
   * @param {string} response - Raw response text
   * @param {string} provider - LLM provider name
   * @returns {Object} Parsed insights
   */
  static parseTextResponse(response, provider) {
    const insights = {
      wentWell: [],
      didntGoWell: [],
      actionItems: []
    };

    // Split response into sections
    const sections = this.extractSections(response);

    // Parse each section
    sections.forEach(section => {
      const category = this.categorizeSection(section.header);
      const items = this.extractItemsFromText(section.content);
      
      const normalizedItems = items.map(item => ({
        title: item.title || 'Insight from AI analysis',
        details: item.details || item.title || '',
        source: 'ai',
        llmProvider: provider,
        confidence: 0.7, // Default confidence for text-parsed insights
        reasoning: item.reasoning || 'Extracted from LLM text response'
      }));

      if (category === 'wentWell') {
        insights.wentWell.push(...normalizedItems);
      } else if (category === 'didntGoWell') {
        insights.didntGoWell.push(...normalizedItems);
      } else if (category === 'actionItems') {
        // Convert to action items format
        const actionItems = normalizedItems.map(item => ({
          ...item,
          priority: item.priority || 'medium',
          assignee: item.assignee || 'team'
        }));
        insights.actionItems.push(...actionItems);
      }
    });

    // If no sections found, try to extract general insights
    if (insights.wentWell.length === 0 && insights.didntGoWell.length === 0 && insights.actionItems.length === 0) {
      const generalInsights = this.extractGeneralInsights(response, provider);
      return generalInsights;
    }

    return insights;
  }

  /**
   * Extract sections from text response
   * @param {string} text - Response text
   * @returns {Array} Array of {header, content} objects
   */
  static extractSections(text) {
    const sections = [];
    const lines = text.split('\n');
    let currentSection = null;

    lines.forEach(line => {
      const trimmed = line.trim();
      
      // Check if line is a header (starts with #, *, -, or contains keywords)
      if (this.isHeaderLine(trimmed)) {
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = {
          header: trimmed,
          content: []
        };
      } else if (currentSection && trimmed) {
        currentSection.content.push(trimmed);
      }
    });

    if (currentSection) {
      sections.push(currentSection);
    }

    return sections;
  }

  /**
   * Check if a line is a section header
   * @param {string} line - Text line
   * @returns {boolean} True if line is a header
   */
  static isHeaderLine(line) {
    if (!line) return false;
    
    // Markdown headers
    if (line.startsWith('#')) return true;
    
    // Keywords that indicate sections (remove special chars for better matching)
    const cleanLine = line.toLowerCase().replace(/[^\w\s]/g, ' ');
    const keywords = [
      'went well', 'positive', 'success', 'good',
      'didnt go well', 'negative', 'issues', 'problems', 'challenges',
      'action items', 'improvements', 'recommendations', 'next steps'
    ];
    
    const hasKeyword = keywords.some(keyword => 
      cleanLine.includes(keyword)
    );
    
    // List markers with keywords or standalone
    if (line.match(/^[\*\-\+]\s/) && (hasKeyword || line.includes(':'))) return true;
    
    return hasKeyword;
  }

  /**
   * Categorize a section based on its header
   * @param {string} header - Section header text
   * @returns {string} Category: 'wentWell', 'didntGoWell', or 'actionItems'
   */
  static categorizeSection(header) {
    // Remove special characters and emojis for better matching
    const lower = header.toLowerCase().replace(/[^\w\s]/g, ' ');
    
    if (lower.includes('went well') || lower.includes('positive') || 
        lower.includes('success') || lower.includes('good')) {
      return 'wentWell';
    }
    
    if (lower.includes('didnt go well') || lower.includes('negative') || 
        lower.includes('issues') || lower.includes('problems') || 
        lower.includes('challenges')) {
      return 'didntGoWell';
    }
    
    if (lower.includes('action') || lower.includes('improvement') || 
        lower.includes('recommendation') || lower.includes('next steps')) {
      return 'actionItems';
    }
    
    // Default to didntGoWell for unrecognized sections
    return 'didntGoWell';
  }

  /**
   * Extract individual items from section content
   * @param {Array} contentLines - Array of content lines
   * @returns {Array} Array of parsed items
   */
  static extractItemsFromText(contentLines) {
    const items = [];
    let currentItem = null;

    contentLines.forEach(line => {
      // Check if line starts a new item (bullet point, number, etc.)
      if (line.match(/^[\*\-\+]\s/) || line.match(/^\d+\.\s/)) {
        if (currentItem) {
          items.push(currentItem);
        }
        
        const cleanLine = line.replace(/^[\*\-\+]\s*|^\d+\.\s*/, '').trim();
        currentItem = {
          title: this.extractTitle(cleanLine),
          details: cleanLine
        };
      } else if (currentItem) {
        // Continue current item
        currentItem.details += ' ' + line;
      } else {
        // Start new item without bullet
        currentItem = {
          title: this.extractTitle(line),
          details: line
        };
      }
    });

    if (currentItem) {
      items.push(currentItem);
    }

    return items;
  }

  /**
   * Extract title from a line of text
   * @param {string} text - Text line
   * @returns {string} Extracted title
   */
  static extractTitle(text) {
    // Take first sentence or first 50 characters
    const sentences = text.split(/[.!?]/);
    if (sentences.length > 1 && sentences[0].length < 100) {
      return sentences[0].trim();
    }
    
    return text.length > 50 ? text.substring(0, 47).trim() + '...' : text.trim();
  }

  /**
   * Extract general insights when no clear structure is found
   * @param {string} text - Response text
   * @param {string} provider - LLM provider name
   * @returns {Object} Insights object
   */
  static extractGeneralInsights(text, provider) {
    // Split text into sentences and try to categorize
    const sentences = text.split(/[.!?]/).filter(s => s.trim().length > 10);
    
    const insights = {
      wentWell: [],
      didntGoWell: [],
      actionItems: []
    };

    sentences.forEach(sentence => {
      const trimmed = sentence.trim();
      if (trimmed.length < 10) return;

      const sentiment = this.analyzeSentiment(trimmed);
      const insight = {
        title: this.extractTitle(trimmed),
        details: trimmed,
        source: 'ai',
        llmProvider: provider,
        confidence: 0.5, // Lower confidence for general extraction
        reasoning: 'Extracted from unstructured LLM response'
      };

      if (sentiment === 'positive') {
        insights.wentWell.push(insight);
      } else if (sentiment === 'negative') {
        insights.didntGoWell.push(insight);
      } else if (sentiment === 'action') {
        insights.actionItems.push({
          ...insight,
          priority: 'medium',
          assignee: 'team'
        });
      }
    });

    return insights;
  }

  /**
   * Simple sentiment analysis for text
   * @param {string} text - Text to analyze
   * @returns {string} 'positive', 'negative', or 'action'
   */
  static analyzeSentiment(text) {
    const lower = text.toLowerCase();
    
    const positiveWords = ['good', 'great', 'excellent', 'success', 'well', 'improved', 'better'];
    const negativeWords = ['bad', 'poor', 'issue', 'problem', 'difficult', 'challenge', 'failed'];
    const actionWords = ['should', 'need', 'must', 'recommend', 'suggest', 'improve', 'fix'];

    const positiveCount = positiveWords.filter(word => lower.includes(word)).length;
    const negativeCount = negativeWords.filter(word => lower.includes(word)).length;
    const actionCount = actionWords.filter(word => lower.includes(word)).length;

    if (actionCount > 0) return 'action';
    if (positiveCount > negativeCount) return 'positive';
    if (negativeCount > 0) return 'negative';
    
    return 'negative'; // Default to negative for neutral content
  }

  /**
   * Normalize insights array to standard format
   * @param {Array} insights - Raw insights array
   * @param {string} source - Source type ('ai', 'rules', 'hybrid')
   * @param {string} provider - LLM provider name
   * @returns {Array} Normalized insights
   */
  static normalizeInsights(insights, source = 'ai', provider = 'unknown') {
    if (!Array.isArray(insights)) {
      return [];
    }

    return insights.map(insight => {
      const normalized = this.validateInsight(insight);
      return {
        ...normalized,
        source,
        llmProvider: provider,
        confidence: insight.confidence || 0.8,
        reasoning: insight.reasoning || 'Generated by LLM analysis'
      };
    });
  }

  /**
   * Normalize action items array to standard format
   * @param {Array} actionItems - Raw action items array
   * @param {string} source - Source type
   * @param {string} provider - LLM provider name
   * @returns {Array} Normalized action items
   */
  static normalizeActionItems(actionItems, source = 'ai', provider = 'unknown') {
    if (!Array.isArray(actionItems)) {
      return [];
    }

    return actionItems.map(item => {
      const normalized = this.validateInsight(item);
      return {
        ...normalized,
        source,
        llmProvider: provider,
        confidence: item.confidence || 0.8,
        reasoning: item.reasoning || 'Generated by LLM analysis',
        priority: item.priority || 'medium',
        assignee: item.assignee || 'team'
      };
    });
  }

  /**
   * Validate and normalize a single insight
   * @param {Object} insight - Raw insight object
   * @returns {Object} Validated insight
   */
  static validateInsight(insight) {
    if (!insight) {
      throw new Error('Invalid insight: must be an object');
    }

    // Handle string insights
    if (typeof insight === 'string') {
      return {
        title: this.extractTitle(insight),
        details: insight,
        category: this.inferCategoryFromText(insight)
      };
    }

    if (typeof insight !== 'object') {
      throw new Error('Invalid insight: must be an object');
    }

    // Validate required fields
    if (!insight.title && !insight.details) {
      throw new Error('Invalid insight: must have either title or details');
    }

    const content = insight.title || insight.details || '';

    return {
      title: insight.title || this.extractTitle(insight.details || ''),
      details: insight.details || insight.title || '',
      category: insight.category || this.inferCategoryFromText(content),
      data: insight.data || {}
    };
  }

  /**
   * Infer category from text content (basic categorization)
   * @param {string} text - Text to analyze
   * @returns {string} Inferred category
   */
  static inferCategoryFromText(text) {
    if (!text || typeof text !== 'string') {
      return 'general';
    }

    const lower = text.toLowerCase();

    // Technical indicators
    const technicalKeywords = [
      'bug', 'error', 'fix', 'code', 'api', 'database', 'performance',
      'deployment', 'build', 'test', 'security', 'infrastructure'
    ];
    
    // Process indicators
    const processKeywords = [
      'process', 'workflow', 'sprint', 'planning', 'meeting', 'documentation',
      'review', 'agile', 'scrum', 'methodology', 'procedure'
    ];
    
    // Team dynamics indicators
    const teamKeywords = [
      'team', 'collaboration', 'communication', 'feedback', 'culture',
      'morale', 'onboarding', 'mentoring', 'conflict', 'leadership'
    ];

    const technicalScore = technicalKeywords.filter(keyword => lower.includes(keyword)).length;
    const processScore = processKeywords.filter(keyword => lower.includes(keyword)).length;
    const teamScore = teamKeywords.filter(keyword => lower.includes(keyword)).length;

    if (technicalScore > processScore && technicalScore > teamScore) {
      return 'technical';
    } else if (processScore > teamScore) {
      return 'process';
    } else if (teamScore > 0) {
      return 'teamDynamics';
    }

    return 'general';
  }
}

export default ResponseParser;