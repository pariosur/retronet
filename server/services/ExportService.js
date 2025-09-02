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
   * Export release notes to markdown format
   */
  exportReleaseNotesToMarkdown(releaseNotes, options = {}) {
    const opts = { ...this.config, ...options };
    let markdown = '';

    // Header
    markdown += `# ${releaseNotes.title}\n\n`;
    
    // Date range
    if (releaseNotes.dateRange) {
      markdown += `**Release Period:** ${releaseNotes.dateRange.start} to ${releaseNotes.dateRange.end}\n\n`;
    }

    // Generation metadata
    if (opts.includeMetadata && releaseNotes.metadata) {
      markdown += this._generateReleaseNotesMetadata(releaseNotes.metadata);
    }

    // New Features section
    if (releaseNotes.entries.newFeatures && releaseNotes.entries.newFeatures.length > 0) {
      markdown += '## 🚀 New Features\n\n';
      markdown += this._formatReleaseNotesEntriesForMarkdown(releaseNotes.entries.newFeatures, opts);
    }

    // Improvements section
    if (releaseNotes.entries.improvements && releaseNotes.entries.improvements.length > 0) {
      markdown += '\n## ✨ Improvements\n\n';
      markdown += this._formatReleaseNotesEntriesForMarkdown(releaseNotes.entries.improvements, opts);
    }

    // Bug Fixes section
    if (releaseNotes.entries.fixes && releaseNotes.entries.fixes.length > 0) {
      markdown += '\n## 🐛 Bug Fixes\n\n';
      markdown += this._formatReleaseNotesEntriesForMarkdown(releaseNotes.entries.fixes, opts);
    }

    // Footer
    markdown += '\n---\n';
    markdown += `*Generated on ${new Date().toLocaleDateString()}*\n`;

    return markdown;
  }

  /**
   * Export release notes to HTML format
   */
  exportReleaseNotesToHTML(releaseNotes, options = {}) {
    const opts = { ...this.config, ...options };
    
    let html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${releaseNotes.title}</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            line-height: 1.6;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
        }
        h1 {
            color: #2c3e50;
            border-bottom: 3px solid #3498db;
            padding-bottom: 10px;
        }
        h2 {
            color: #34495e;
            margin-top: 30px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .entry {
            background: #f8f9fa;
            border-left: 4px solid #3498db;
            padding: 15px;
            margin: 15px 0;
            border-radius: 4px;
        }
        .entry-title {
            font-weight: bold;
            color: #2c3e50;
            margin-bottom: 8px;
        }
        .entry-description {
            color: #555;
            margin-bottom: 8px;
        }
        .entry-value {
            font-style: italic;
            color: #7f8c8d;
            font-size: 0.9em;
        }
        .metadata {
            background: #ecf0f1;
            padding: 15px;
            border-radius: 4px;
            margin: 20px 0;
            font-size: 0.9em;
        }
        .footer {
            text-align: center;
            margin-top: 40px;
            padding-top: 20px;
            border-top: 1px solid #bdc3c7;
            color: #7f8c8d;
            font-size: 0.9em;
        }
    </style>
</head>
<body>`;

    // Header
    html += `    <h1>${releaseNotes.title}</h1>\n`;
    
    // Date range
    if (releaseNotes.dateRange) {
      html += `    <p><strong>Release Period:</strong> ${releaseNotes.dateRange.start} to ${releaseNotes.dateRange.end}</p>\n`;
    }

    // Generation metadata
    if (opts.includeMetadata && releaseNotes.metadata) {
      html += this._generateReleaseNotesMetadataHTML(releaseNotes.metadata);
    }

    // New Features section
    if (releaseNotes.entries.newFeatures && releaseNotes.entries.newFeatures.length > 0) {
      html += '    <h2>🚀 New Features</h2>\n';
      html += this._formatReleaseNotesEntriesForHTML(releaseNotes.entries.newFeatures, opts);
    }

    // Improvements section
    if (releaseNotes.entries.improvements && releaseNotes.entries.improvements.length > 0) {
      html += '    <h2>✨ Improvements</h2>\n';
      html += this._formatReleaseNotesEntriesForHTML(releaseNotes.entries.improvements, opts);
    }

    // Bug Fixes section
    if (releaseNotes.entries.fixes && releaseNotes.entries.fixes.length > 0) {
      html += '    <h2>🐛 Bug Fixes</h2>\n';
      html += this._formatReleaseNotesEntriesForHTML(releaseNotes.entries.fixes, opts);
    }

    // Footer
    html += `    <div class="footer">
        <p>Generated on ${new Date().toLocaleDateString()}</p>
    </div>
</body>
</html>`;

    return html;
  }

  /**
   * Export release notes to JSON format
   */
  exportReleaseNotesToJSON(releaseNotes, options = {}) {
    const opts = { ...this.config, ...options };
    
    const exportData = {
      metadata: {
        exportedAt: new Date().toISOString(),
        format: 'json',
        version: '1.0',
        includesMetadata: opts.includeMetadata
      },
      releaseNotes: {
        id: releaseNotes.id,
        title: releaseNotes.title,
        dateRange: releaseNotes.dateRange,
        entries: {
          newFeatures: this._formatReleaseNotesEntriesForJSON(releaseNotes.entries.newFeatures || [], opts),
          improvements: this._formatReleaseNotesEntriesForJSON(releaseNotes.entries.improvements || [], opts),
          fixes: this._formatReleaseNotesEntriesForJSON(releaseNotes.entries.fixes || [], opts)
        },
        generationMetadata: opts.includeMetadata ? releaseNotes.metadata : undefined,
        createdAt: releaseNotes.createdAt,
        updatedAt: releaseNotes.updatedAt
      },
      summary: {
        totalEntries: (releaseNotes.entries.newFeatures?.length || 0) + 
                     (releaseNotes.entries.improvements?.length || 0) + 
                     (releaseNotes.entries.fixes?.length || 0),
        newFeatures: releaseNotes.entries.newFeatures?.length || 0,
        improvements: releaseNotes.entries.improvements?.length || 0,
        fixes: releaseNotes.entries.fixes?.length || 0
      }
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Generate release notes metadata section for markdown
   */
  _generateReleaseNotesMetadata(metadata) {
    let section = '## Generation Information\n\n';
    
    if (metadata.generationMethod) {
      const method = metadata.generationMethod === 'llm-enhanced' ? 'AI-Enhanced Analysis' : 'Rule-Based Analysis';
      section += `**Analysis Method:** ${method}\n\n`;
    }

    if (metadata.llmProvider && metadata.llmModel) {
      section += `**AI Provider:** ${metadata.llmProvider} (${metadata.llmModel})\n\n`;
    }

    if (metadata.sources && metadata.sources.length > 0) {
      section += `**Data Sources:** ${metadata.sources.join(', ')}\n\n`;
    }

    if (metadata.analysisTime) {
      section += `**Analysis Time:** ${metadata.analysisTime}ms\n\n`;
    }

    return section;
  }

  /**
   * Generate release notes metadata section for HTML
   */
  _generateReleaseNotesMetadataHTML(metadata) {
    let html = '    <div class="metadata">\n';
    html += '        <h3>Generation Information</h3>\n';
    
    if (metadata.generationMethod) {
      const method = metadata.generationMethod === 'llm-enhanced' ? 'AI-Enhanced Analysis' : 'Rule-Based Analysis';
      html += `        <p><strong>Analysis Method:</strong> ${method}</p>\n`;
    }

    if (metadata.llmProvider && metadata.llmModel) {
      html += `        <p><strong>AI Provider:</strong> ${metadata.llmProvider} (${metadata.llmModel})</p>\n`;
    }

    if (metadata.sources && metadata.sources.length > 0) {
      html += `        <p><strong>Data Sources:</strong> ${metadata.sources.join(', ')}</p>\n`;
    }

    if (metadata.analysisTime) {
      html += `        <p><strong>Analysis Time:</strong> ${metadata.analysisTime}ms</p>\n`;
    }

    html += '    </div>\n';
    return html;
  }

  /**
   * Format release notes entries for markdown output
   */
  _formatReleaseNotesEntriesForMarkdown(entries, options) {
    if (entries.length === 0) {
      return '_No entries in this category._\n';
    }

    let markdown = '';
    
    entries.forEach(entry => {
      markdown += `- **${entry.title}**: ${entry.description}`;
      
      if (entry.userValue && options.includeMetadata) {
        markdown += ` _${entry.userValue}_`;
      }
      
      markdown += '\n';
    });

    return markdown + '\n';
  }

  /**
   * Format release notes entries for HTML output
   */
  _formatReleaseNotesEntriesForHTML(entries, options) {
    if (entries.length === 0) {
      return '    <p><em>No entries in this category.</em></p>\n';
    }

    let html = '';
    
    entries.forEach(entry => {
      html += '    <div class="entry">\n';
      html += `        <div class="entry-title">${entry.title}</div>\n`;
      html += `        <div class="entry-description">${entry.description}</div>\n`;
      
      if (entry.userValue && options.includeMetadata) {
        html += `        <div class="entry-value">${entry.userValue}</div>\n`;
      }
      
      html += '    </div>\n';
    });

    return html;
  }

  /**
   * Format release notes entries for JSON output
   */
  _formatReleaseNotesEntriesForJSON(entries, options) {
    return entries.map(entry => {
      const formatted = {
        id: entry.id,
        title: entry.title,
        description: entry.description,
        category: entry.category,
        impact: entry.impact,
        userValue: entry.userValue
      };

      if (options.includeMetadata && entry.metadata) {
        formatted.metadata = entry.metadata;
      }

      return formatted;
    });
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