/**
 * Export Service
 * Handles exporting retro insights in multiple formats with source attribution
 */

export class ExportService {
  constructor(config = {}) {
    this.config = {
      includeMetadata: true,
      includeSourceAttribution: true,
      includeConfidenceScores: true,
      includeReasoningForAI: true,
      ...config
    };
  }

  /**
   * Export insights to markdown format
   */
  exportToMarkdown(retroData, options = {}) {
    const opts = { ...this.config, ...options };
    let markdown = '';

    // Header
    markdown += '# Sprint Retro Results\n\n';
    
    // Metadata section
    if (opts.includeMetadata && retroData.analysisMetadata) {
      markdown += this._generateMetadataSection(retroData.analysisMetadata);
    }

    // What Went Well section
    markdown += '## 🎉 What Went Well\n\n';
    markdown += this._formatInsightsForMarkdown(retroData.wentWell || [], opts);

    // What Didn't Go Well section
    markdown += '\n## 😬 What Didn\'t Go Well\n\n';
    markdown += this._formatInsightsForMarkdown(retroData.didntGoWell || [], opts);

    // Action Items section
    markdown += '\n## 🎯 Action Items\n\n';
    markdown += this._formatInsightsForMarkdown(retroData.actionItems || [], opts);

    // Category statistics if available
    if (opts.includeMetadata && retroData.categoryStatistics) {
      markdown += this._generateCategoryStatistics(retroData.categoryStatistics);
    }

    return markdown;
  }

  /**
   * Export insights to JSON format
   */
  exportToJSON(retroData, options = {}) {
    const opts = { ...this.config, ...options };
    
    const exportData = {
      metadata: {
        exportedAt: new Date().toISOString(),
        format: 'json',
        version: '1.0',
        includesSourceAttribution: opts.includeSourceAttribution,
        includesConfidenceScores: opts.includeConfidenceScores
      },
      analysisMetadata: retroData.analysisMetadata || {},
      insights: {
        wentWell: this._formatInsightsForJSON(retroData.wentWell || [], opts),
        didntGoWell: this._formatInsightsForJSON(retroData.didntGoWell || [], opts),
        actionItems: this._formatInsightsForJSON(retroData.actionItems || [], opts)
      },
      categoryStatistics: retroData.categoryStatistics || {},
      summary: {
        totalInsights: (retroData.wentWell?.length || 0) + 
                      (retroData.didntGoWell?.length || 0) + 
                      (retroData.actionItems?.length || 0),
        aiInsights: this._countInsightsBySource(retroData, 'ai'),
        ruleBasedInsights: this._countInsightsBySource(retroData, 'rules'),
        hybridInsights: this._countInsightsBySource(retroData, 'hybrid')
      }
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Export insights to CSV format
   */
  exportToCSV(retroData, options = {}) {
    const opts = { ...this.config, ...options };
    
    // Flatten all insights into a single array
    const allInsights = [
      ...(retroData.wentWell || []).map(insight => ({ ...insight, section: 'What Went Well' })),
      ...(retroData.didntGoWell || []).map(insight => ({ ...insight, section: 'What Didn\'t Go Well' })),
      ...(retroData.actionItems || []).map(insight => ({ ...insight, section: 'Action Items' }))
    ];

    // Define CSV headers
    const headers = [
      'Section',
      'Title',
      'Details',
      'Source',
      'Confidence',
      'Category',
      'Priority',
      'Impact',
      'Urgency'
    ];

    if (opts.includeReasoningForAI) {
      headers.push('AI Reasoning');
    }

    if (opts.includeSourceAttribution) {
      headers.push('LLM Provider', 'LLM Model');
    }

    headers.push('Assignee', 'Created At');

    // Generate CSV content
    let csv = headers.join(',') + '\n';

    for (const insight of allInsights) {
      const row = [
        this._escapeCsvValue(insight.section),
        this._escapeCsvValue(insight.title),
        this._escapeCsvValue(insight.details || ''),
        this._escapeCsvValue(insight.source || 'unknown'),
        insight.confidence ? (insight.confidence * 100).toFixed(1) + '%' : '',
        this._escapeCsvValue(insight.category || ''),
        this._escapeCsvValue(this._formatPriority(insight.priority)),
        this._escapeCsvValue(insight.impact || ''),
        this._escapeCsvValue(insight.urgency || '')
      ];

      if (opts.includeReasoningForAI) {
        row.push(this._escapeCsvValue(insight.reasoning || ''));
      }

      if (opts.includeSourceAttribution) {
        row.push(this._escapeCsvValue(insight.llmProvider || ''));
        row.push(this._escapeCsvValue(insight.llmModel || ''));
      }

      row.push(
        this._escapeCsvValue(insight.assignee || ''),
        this._escapeCsvValue(insight.createdAt || new Date().toISOString())
      );

      csv += row.join(',') + '\n';
    }

    return csv;
  }

  /**
   * Generate metadata section for markdown
   */
  _generateMetadataSection(metadata) {
    let section = '## Analysis Information\n\n';
    
    if (metadata.generatedAt) {
      section += `**Generated:** ${new Date(metadata.generatedAt).toLocaleString()}\n\n`;
    }

    if (metadata.dateRange) {
      section += `**Period:** ${metadata.dateRange.start} to ${metadata.dateRange.end}\n\n`;
    }

    if (metadata.teamMembers && metadata.teamMembers.length > 0) {
      section += `**Team Members:** ${metadata.teamMembers.join(', ')}\n\n`;
    }

    // Analysis methods used
    const methods = [];
    if (metadata.ruleBasedAnalysisUsed) methods.push('Rule-based Analysis');
    if (metadata.llmAnalysisUsed) methods.push('AI Analysis');
    
    if (methods.length > 0) {
      section += `**Analysis Methods:** ${methods.join(', ')}\n\n`;
    }

    // LLM specific information
    if (metadata.llm) {
      section += `**AI Provider:** ${metadata.llm.provider || 'Unknown'}\n\n`;
      if (metadata.llm.model) {
        section += `**AI Model:** ${metadata.llm.model}\n\n`;
      }
      if (metadata.llm.tokensUsed) {
        section += `**Tokens Used:** ${metadata.llm.tokensUsed.toLocaleString()}\n\n`;
      }
      if (metadata.llm.cost) {
        section += `**Estimated Cost:** $${metadata.llm.cost.toFixed(4)}\n\n`;
      }
    }

    return section;
  }

  /**
   * Format insights for markdown output
   */
  _formatInsightsForMarkdown(insights, options) {
    if (insights.length === 0) {
      return '_No insights found for this category._\n';
    }

    let markdown = '';
    
    insights.forEach((insight, index) => {
      markdown += `### ${index + 1}. ${insight.title}\n\n`;
      
      // Source attribution
      if (options.includeSourceAttribution) {
        const sourceInfo = this._formatSourceAttribution(insight);
        markdown += `**Source:** ${sourceInfo}\n\n`;
      }

      // Details
      if (insight.details) {
        markdown += `${insight.details}\n\n`;
      }

      // Category and priority
      const metadata = [];
      if (insight.category && insight.category !== 'general') {
        metadata.push(`Category: ${insight.category}`);
      }
      if (insight.priority !== undefined) {
        metadata.push(`Priority: ${this._formatPriority(insight.priority)}`);
      }
      if (insight.impact) {
        metadata.push(`Impact: ${insight.impact}`);
      }
      if (insight.urgency) {
        metadata.push(`Urgency: ${insight.urgency}`);
      }
      if (insight.assignee) {
        metadata.push(`Assignee: ${insight.assignee}`);
      }

      if (metadata.length > 0) {
        markdown += `**Metadata:** ${metadata.join(' • ')}\n\n`;
      }

      // AI reasoning
      if (options.includeReasoningForAI && insight.reasoning && insight.source === 'ai') {
        markdown += `**AI Reasoning:** _${insight.reasoning}_\n\n`;
      }

      // Source breakdown for hybrid insights
      if (insight.sourceInsights && insight.sourceInsights.length > 0) {
        markdown += `**Source Breakdown:**\n`;
        insight.sourceInsights.forEach(srcInsight => {
          const srcInfo = this._formatSourceAttribution(srcInsight);
          markdown += `- ${srcInsight.title} (${srcInfo})\n`;
        });
        markdown += '\n';
      }

      markdown += '---\n\n';
    });

    return markdown;
  }

  /**
   * Format insights for JSON output
   */
  _formatInsightsForJSON(insights, options) {
    return insights.map(insight => {
      const formatted = {
        title: insight.title,
        details: insight.details || null,
        source: insight.source || 'unknown',
        category: insight.category || null,
        priority: insight.priority,
        impact: insight.impact || null,
        urgency: insight.urgency || null,
        assignee: insight.assignee || null,
        createdAt: insight.createdAt || new Date().toISOString()
      };

      if (options.includeConfidenceScores && insight.confidence !== undefined) {
        formatted.confidence = insight.confidence;
        formatted.confidencePercentage = Math.round(insight.confidence * 100);
      }

      if (options.includeReasoningForAI && insight.reasoning) {
        formatted.reasoning = insight.reasoning;
      }

      if (options.includeSourceAttribution) {
        formatted.sourceAttribution = {
          llmProvider: insight.llmProvider || null,
          llmModel: insight.llmModel || null,
          sourceInsights: insight.sourceInsights || null
        };
      }

      // Category metadata
      if (insight.categoryMetadata) {
        formatted.categoryMetadata = insight.categoryMetadata;
      }

      // Additional metadata
      if (insight.metadata && Object.keys(insight.metadata).length > 0) {
        formatted.additionalMetadata = insight.metadata;
      }

      return formatted;
    });
  }

  /**
   * Format source attribution for display
   */
  _formatSourceAttribution(insight) {
    const parts = [];
    
    // Source type
    switch (insight.source) {
      case 'ai':
        parts.push('AI Analysis');
        break;
      case 'rules':
        parts.push('Rule-based Analysis');
        break;
      case 'hybrid':
        parts.push('Hybrid Analysis');
        break;
      default:
        parts.push('System Generated');
    }

    // Confidence score
    if (insight.confidence !== undefined) {
      parts.push(`${Math.round(insight.confidence * 100)}% confidence`);
    }

    // LLM provider info
    if (insight.llmProvider) {
      parts.push(`via ${insight.llmProvider}`);
      if (insight.llmModel) {
        parts.push(`(${insight.llmModel})`);
      }
    }

    return parts.join(' ');
  }

  /**
   * Format priority value for display
   */
  _formatPriority(priority) {
    if (typeof priority === 'number') {
      if (priority >= 0.8) return 'High';
      if (priority >= 0.6) return 'Medium';
      if (priority >= 0.4) return 'Low';
      return 'Very Low';
    }
    return priority || '';
  }

  /**
   * Generate category statistics section
   */
  _generateCategoryStatistics(stats) {
    let section = '\n## Category Statistics\n\n';
    
    if (stats.total) {
      section += `**Total Insights:** ${stats.total}\n\n`;
    }

    if (stats.averagePriority !== undefined) {
      section += `**Average Priority:** ${stats.averagePriority.toFixed(2)}\n\n`;
    }

    if (stats.averageConfidence !== undefined) {
      section += `**Average Confidence:** ${Math.round(stats.averageConfidence * 100)}%\n\n`;
    }

    if (stats.categoryBreakdown) {
      section += '**Category Breakdown:**\n';
      Object.entries(stats.categoryBreakdown).forEach(([category, count]) => {
        section += `- ${category}: ${count}\n`;
      });
      section += '\n';
    }

    if (stats.sourceBreakdown) {
      section += '**Source Breakdown:**\n';
      Object.entries(stats.sourceBreakdown).forEach(([source, count]) => {
        section += `- ${source}: ${count}\n`;
      });
      section += '\n';
    }

    return section;
  }

  /**
   * Count insights by source type
   */
  _countInsightsBySource(retroData, sourceType) {
    const allInsights = [
      ...(retroData.wentWell || []),
      ...(retroData.didntGoWell || []),
      ...(retroData.actionItems || [])
    ];
    
    return allInsights.filter(insight => insight.source === sourceType).length;
  }



  /**
   * Escape CSV values to handle commas, quotes, and newlines
   */
  _escapeCsvValue(value) {
    if (value === null || value === undefined) {
      return '';
    }
    
    const stringValue = String(value);
    
    // If the value contains comma, quote, or newline, wrap in quotes and escape internal quotes
    if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
      return '"' + stringValue.replace(/"/g, '""') + '"';
    }
    
    return stringValue;
  }
}

export default ExportService;