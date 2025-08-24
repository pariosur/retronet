import { useState, useEffect } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight, Copy, Download, Brain, Cog, Zap, Filter, SortAsc, SortDesc, X } from 'lucide-react';

function ResultsPage({ retroData, onBack }) {
  const [expandedItems, setExpandedItems] = useState({});
  const [filteredData, setFilteredData] = useState(retroData);
  const [showFilters, setShowFilters] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [filters, setFilters] = useState({
    categories: [],
    sources: [],
    impact: [],
    urgency: [],
    minPriority: 0,
    minConfidence: 0,
    search: ''
  });
  const [sortOptions, setSortOptions] = useState({
    sortBy: 'priority',
    sortOrder: 'desc',
    secondarySort: 'confidence'
  });
  const [availableCategories, setAvailableCategories] = useState([]);
  const [isFiltering, setIsFiltering] = useState(false);

  // Load available categories on mount
  useEffect(() => {
    fetchAvailableCategories();
  }, []);

  // Apply filters when they change
  useEffect(() => {
    applyFiltersAndSort();
  }, [filters, sortOptions, retroData]);

  // Close export menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (showExportMenu && !event.target.closest('.export-menu-container')) {
        setShowExportMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showExportMenu]);

  const fetchAvailableCategories = async () => {
    try {
      const response = await fetch('/api/insight-categories');
      const data = await response.json();
      setAvailableCategories(data.categories || []);
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    }
  };

  const applyFiltersAndSort = async () => {
    setIsFiltering(true);
    try {
      // Check if any filters or sorting is applied
      const hasFilters = Object.values(filters).some(value => 
        Array.isArray(value) ? value.length > 0 : value !== '' && value !== 0
      );
      const hasSorting = sortOptions.sortBy !== 'priority' || sortOptions.sortOrder !== 'desc';

      if (!hasFilters && !hasSorting) {
        setFilteredData(retroData);
        return;
      }

      const response = await fetch('/api/filter-insights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          insights: retroData,
          filters: hasFilters ? filters : {},
          sortOptions: hasSorting ? sortOptions : {}
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to filter insights');
      }

      const filteredResult = await response.json();
      setFilteredData(filteredResult);
    } catch (error) {
      console.error('Failed to apply filters:', error);
      setFilteredData(retroData); // Fallback to original data
    } finally {
      setIsFiltering(false);
    }
  };

  const updateFilter = (filterType, value) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: value
    }));
  };

  const toggleArrayFilter = (filterType, value) => {
    setFilters(prev => ({
      ...prev,
      [filterType]: prev[filterType].includes(value)
        ? prev[filterType].filter(item => item !== value)
        : [...prev[filterType], value]
    }));
  };

  const clearFilters = () => {
    setFilters({
      categories: [],
      sources: [],
      impact: [],
      urgency: [],
      minPriority: 0,
      minConfidence: 0,
      search: ''
    });
    setSortOptions({
      sortBy: 'priority',
      sortOrder: 'desc',
      secondarySort: 'confidence'
    });
  };

  const hasActiveFilters = () => {
    return Object.values(filters).some(value => 
      Array.isArray(value) ? value.length > 0 : value !== '' && value !== 0
    ) || sortOptions.sortBy !== 'priority' || sortOptions.sortOrder !== 'desc';
  };

  const toggleExpanded = (section, index) => {
    const key = `${section}-${index}`;
    setExpandedItems(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const copyToClipboard = () => {
    const text = formatRetroText(retroData);
    navigator.clipboard.writeText(text);
    alert('Retro copied to clipboard!');
  };

  const handleExport = async (format) => {
    try {
      const response = await fetch('/api/export-retro', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          retroData: filteredData,
          format,
          options: {
            includeMetadata: true,
            includeSourceAttribution: true,
            includeConfidenceScores: true,
            includeReasoningForAI: true
          }
        }),
      });

      if (!response.ok) {
        throw new Error('Export failed');
      }

      // Get the filename from the response headers
      const contentDisposition = response.headers.get('Content-Disposition');
      const filename = contentDisposition 
        ? contentDisposition.split('filename=')[1]?.replace(/"/g, '')
        : `retro-${new Date().toISOString().split('T')[0]}.${format}`;

      // Create blob and download
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Export failed:', error);
      alert('Export failed. Please try again.');
    }
  };

  const formatRetroText = (data) => {
    let text = '# Sprint Retro\n\n';
    
    // Helper function to format source attribution
    const formatSource = (item) => {
      const sources = [];
      if (item.source === 'ai') sources.push('AI');
      else if (item.source === 'rules') sources.push('Rules');
      else if (item.source === 'hybrid') sources.push('Hybrid');
      else sources.push('System');
      
      if (item.confidence && typeof item.confidence === 'number') {
        sources.push(`${Math.round(item.confidence * 100)}%`);
      }
      
      return sources.length > 0 ? ` [${sources.join(', ')}]` : '';
    };
    
    text += '## 🎉 What Went Well\n';
    data.wentWell.forEach(item => {
      text += `• ${item.title}${formatSource(item)}\n`;
      if (item.details) {
        text += `  ${item.details}\n`;
      }
    });
    
    text += '\n## 😬 What Didn\'t Go Well\n';
    data.didntGoWell.forEach(item => {
      text += `• ${item.title}${formatSource(item)}\n`;
      if (item.details) {
        text += `  ${item.details}\n`;
      }
    });
    
    text += '\n## 🎯 Action Items\n';
    data.actionItems.forEach(item => {
      text += `• ${item.title}${formatSource(item)}\n`;
      if (item.details) {
        text += `  ${item.details}\n`;
      }
      if (item.priority) {
        text += `  Priority: ${item.priority}\n`;
      }
      if (item.assignee) {
        text += `  Assignee: ${item.assignee}\n`;
      }
    });
    
    // Add analysis metadata if available
    if (data.analysisMetadata) {
      text += '\n## Analysis Information\n';
      if (data.analysisMetadata.llmAnalysisUsed) {
        text += '• AI analysis was used\n';
      }
      if (data.analysisMetadata.ruleBasedAnalysisUsed) {
        text += '• Rule-based analysis was used\n';
      }
      if (data.analysisMetadata.generatedAt) {
        text += `• Generated at: ${new Date(data.analysisMetadata.generatedAt).toLocaleString()}\n`;
      }
    }
    
    return text;
  };

  // Helper function to get source badge configuration
  const getSourceBadge = (source) => {
    switch (source) {
      case 'ai':
        return {
          icon: Brain,
          label: 'AI',
          className: 'bg-purple-100 text-purple-800 border-purple-200',
          tooltip: 'Generated by AI analysis'
        };
      case 'rules':
        return {
          icon: Cog,
          label: 'Rules',
          className: 'bg-blue-100 text-blue-800 border-blue-200',
          tooltip: 'Generated by rule-based analysis'
        };
      case 'hybrid':
        return {
          icon: Zap,
          label: 'Hybrid',
          className: 'bg-green-100 text-green-800 border-green-200',
          tooltip: 'Combined from multiple sources'
        };
      default:
        return {
          icon: Cog,
          label: 'System',
          className: 'bg-gray-100 text-gray-800 border-gray-200',
          tooltip: 'System generated'
        };
    }
  };

  // Helper function to format confidence score
  const formatConfidence = (confidence) => {
    if (typeof confidence !== 'number') return null;
    return Math.round(confidence * 100);
  };

  // Filter Panel Component
  const FilterPanel = () => (
    <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Filter className="w-5 h-5" />
          Filters & Sorting
        </h3>
        <div className="flex items-center gap-2">
          {hasActiveFilters() && (
            <button
              onClick={clearFilters}
              className="flex items-center gap-1 px-3 py-1 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-md hover:bg-gray-50"
            >
              <X className="w-3 h-3" />
              Clear All
            </button>
          )}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            {showFilters ? 'Hide' : 'Show'} Filters
            <ChevronDown className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {showFilters && (
        <div className="space-y-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => updateFilter('search', e.target.value)}
              placeholder="Search insights..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Categories */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Categories</label>
              <div className="space-y-1">
                {availableCategories.map(category => (
                  <label key={category.id} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.categories.includes(category.id)}
                      onChange={() => toggleArrayFilter('categories', category.id)}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700">{category.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Sources */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Sources</label>
              <div className="space-y-1">
                {['ai', 'rules', 'hybrid'].map(source => (
                  <label key={source} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.sources.includes(source)}
                      onChange={() => toggleArrayFilter('sources', source)}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700 capitalize">{source}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Impact */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Impact</label>
              <div className="space-y-1">
                {['high', 'medium', 'low'].map(impact => (
                  <label key={impact} className="flex items-center">
                    <input
                      type="checkbox"
                      checked={filters.impact.includes(impact)}
                      onChange={() => toggleArrayFilter('impact', impact)}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-700 capitalize">{impact}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Priority Range */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Minimum Priority: {filters.minPriority.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={filters.minPriority}
                onChange={(e) => updateFilter('minPriority', parseFloat(e.target.value))}
                className="w-full"
              />
            </div>

            {/* Confidence Range */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Minimum Confidence: {filters.minConfidence.toFixed(2)}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={filters.minConfidence}
                onChange={(e) => updateFilter('minConfidence', parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
          </div>

          {/* Sorting */}
          <div className="border-t pt-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
              <SortAsc className="w-4 h-4" />
              Sorting
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Sort By</label>
                <select
                  value={sortOptions.sortBy}
                  onChange={(e) => setSortOptions(prev => ({ ...prev, sortBy: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="priority">Priority</option>
                  <option value="confidence">Confidence</option>
                  <option value="impact">Impact</option>
                  <option value="urgency">Urgency</option>
                  <option value="category">Category</option>
                  <option value="source">Source</option>
                  <option value="title">Title</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Order</label>
                <select
                  value={sortOptions.sortOrder}
                  onChange={(e) => setSortOptions(prev => ({ ...prev, sortOrder: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="desc">Descending</option>
                  <option value="asc">Ascending</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Secondary Sort</label>
                <select
                  value={sortOptions.secondarySort}
                  onChange={(e) => setSortOptions(prev => ({ ...prev, secondarySort: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
                >
                  <option value="">None</option>
                  <option value="priority">Priority</option>
                  <option value="confidence">Confidence</option>
                  <option value="impact">Impact</option>
                  <option value="urgency">Urgency</option>
                  <option value="category">Category</option>
                  <option value="source">Source</option>
                  <option value="title">Title</option>
                </select>
              </div>
            </div>
          </div>
        </div>
      )}

      {isFiltering && (
        <div className="mt-4 flex items-center justify-center text-sm text-gray-600">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
          Applying filters...
        </div>
      )}
    </div>
  );

  const RetroSection = ({ title, items, emoji, bgColor }) => (
    <div className={`${bgColor} p-6 rounded-lg`}>
      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <span className="text-2xl">{emoji}</span>
        {title}
      </h2>
      <div className="space-y-3">
        {items.map((item, index) => {
          const sectionKey = title.toLowerCase().replace(/\s+/g, '');
          const isExpanded = expandedItems[`${sectionKey}-${index}`];
          const sourceBadge = getSourceBadge(item.source);
          const confidence = formatConfidence(item.confidence);
          const hasExpandableContent = item.details || item.reasoning || item.sourceInsights;

          return (
            <div key={index} className="bg-white/50 rounded-md p-3 border border-white/20">
              <div 
                className={`flex items-start justify-between ${hasExpandableContent ? 'cursor-pointer' : ''}`}
                onClick={hasExpandableContent ? () => toggleExpanded(sectionKey, index) : undefined}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 mb-2">
                    <span className="font-medium text-gray-900 flex-1">{item.title}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* Category Badge */}
                      {item.category && item.category !== 'general' && (
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium border ${
                          item.category === 'technical' 
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : item.category === 'process'
                            ? 'bg-green-50 text-green-700 border-green-200'
                            : item.category === 'teamDynamics'
                            ? 'bg-purple-50 text-purple-700 border-purple-200'
                            : 'bg-gray-50 text-gray-700 border-gray-200'
                        }`}>
                          {item.category === 'teamDynamics' ? 'Team' : 
                           item.category.charAt(0).toUpperCase() + item.category.slice(1)}
                        </span>
                      )}

                      {/* Priority Badge */}
                      {item.priority !== undefined && (
                        <span className={`inline-block px-2 py-1 rounded text-xs font-medium border ${
                          item.priority >= 0.8 
                            ? 'bg-red-50 text-red-700 border-red-200'
                            : item.priority >= 0.6
                            ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                            : 'bg-green-50 text-green-700 border-green-200'
                        }`}>
                          {item.priority >= 0.8 ? 'High' : item.priority >= 0.6 ? 'Medium' : 'Low'} Priority
                        </span>
                      )}

                      {/* Source Badge */}
                      <div 
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${sourceBadge.className}`}
                        title={sourceBadge.tooltip}
                      >
                        <sourceBadge.icon className="w-3 h-3" />
                        {sourceBadge.label}
                      </div>
                      
                      {/* Confidence Score for AI insights */}
                      {confidence !== null && item.source === 'ai' && (
                        <span className="inline-block bg-purple-50 text-purple-700 px-2 py-1 rounded text-xs font-medium border border-purple-200">
                          {confidence}%
                        </span>
                      )}
                      
                      {/* Expand/Collapse Icon */}
                      {hasExpandableContent && (
                        isExpanded 
                          ? <ChevronDown className="w-4 h-4 text-gray-500" />
                          : <ChevronRight className="w-4 h-4 text-gray-500" />
                      )}
                    </div>
                  </div>
                  
                  {/* Priority Badge for Action Items */}
                  {item.priority && (
                    <div className="mb-2">
                      <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                        item.priority === 'high' 
                          ? 'bg-red-100 text-red-800 border border-red-200' 
                          : item.priority === 'medium'
                          ? 'bg-yellow-100 text-yellow-800 border border-yellow-200'
                          : 'bg-green-100 text-green-800 border border-green-200'
                      }`}>
                        {item.priority} priority
                      </span>
                      {item.assignee && (
                        <span className="ml-2 inline-block bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs border border-gray-200">
                          {item.assignee}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Expandable Content */}
              {hasExpandableContent && isExpanded && (
                <div className="mt-3 pt-3 border-t border-gray-200 space-y-3">
                  {/* Basic Details */}
                  {item.details && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-1">Details</h4>
                      <p className="text-sm text-gray-600">{item.details}</p>
                    </div>
                  )}
                  
                  {/* AI Reasoning */}
                  {item.reasoning && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                        <Brain className="w-3 h-3" />
                        AI Reasoning
                      </h4>
                      <p className="text-sm text-gray-600 italic">{item.reasoning}</p>
                    </div>
                  )}
                  
                  {/* Source Insights for Hybrid */}
                  {item.sourceInsights && item.sourceInsights.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Source Breakdown</h4>
                      <div className="space-y-1">
                        {item.sourceInsights.map((sourceInsight, idx) => {
                          const srcBadge = getSourceBadge(sourceInsight.source);
                          const srcConfidence = formatConfidence(sourceInsight.confidence);
                          return (
                            <div key={idx} className="flex items-center justify-between text-xs bg-gray-50 rounded p-2">
                              <div className="flex items-center gap-2">
                                <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded ${srcBadge.className}`}>
                                  <srcBadge.icon className="w-2.5 h-2.5" />
                                  {srcBadge.label}
                                </div>
                                <span className="text-gray-600 truncate">{sourceInsight.title}</span>
                              </div>
                              {srcConfidence !== null && (
                                <span className="text-gray-500">{srcConfidence}%</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                  
                  {/* LLM Provider Info */}
                  {(item.llmProvider || item.llmModel) && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-1">AI Provider</h4>
                      <div className="text-xs text-gray-500">
                        {item.llmProvider && <span>Provider: {item.llmProvider}</span>}
                        {item.llmProvider && item.llmModel && <span> • </span>}
                        {item.llmModel && <span>Model: {item.llmModel}</span>}
                      </div>
                    </div>
                  )}
                  
                  {/* Impact and Urgency */}
                  {(item.impact || item.urgency) && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-1">Assessment</h4>
                      <div className="flex gap-2 text-xs">
                        {item.impact && (
                          <span className={`px-2 py-1 rounded ${
                            item.impact === 'high' 
                              ? 'bg-red-100 text-red-700'
                              : item.impact === 'medium'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-green-100 text-green-700'
                          }`}>
                            {item.impact} impact
                          </span>
                        )}
                        {item.urgency && (
                          <span className={`px-2 py-1 rounded ${
                            item.urgency === 'high' 
                              ? 'bg-red-100 text-red-700'
                              : item.urgency === 'medium'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-green-100 text-green-700'
                          }`}>
                            {item.urgency} urgency
                          </span>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Category Information */}
                  {item.categoryMetadata && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-1">Category Analysis</h4>
                      <div className="text-xs text-gray-500">
                        <div>Confidence: {Math.round((item.categoryMetadata.confidence || 0) * 100)}%</div>
                        {item.categoryMetadata.alternativeCategories && item.categoryMetadata.alternativeCategories.length > 0 && (
                          <div>
                            Alternative: {item.categoryMetadata.alternativeCategories[0].category} 
                            ({Math.round(item.categoryMetadata.alternativeCategories[0].score * 100)}%)
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Metadata */}
                  {item.metadata && Object.keys(item.metadata).length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 mb-1">Additional Info</h4>
                      <div className="text-xs text-gray-500">
                        {item.metadata.mergedFrom && (
                          <div>Merged from {item.metadata.mergedFrom} sources</div>
                        )}
                        {item.metadata.sources && (
                          <div>Sources: {item.metadata.sources.join(', ')}</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className="max-w-4xl mx-auto p-8">
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-800"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Generate
        </button>
        
        <div className="flex gap-2">
          <button
            onClick={copyToClipboard}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
          >
            <Copy className="w-4 h-4" />
            Copy
          </button>
          <div className="relative export-menu-container">
            <button 
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Export
              <ChevronDown className="w-4 h-4" />
            </button>
            
            {showExportMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-md shadow-lg z-10">
                <div className="py-1">
                  <button
                    onClick={() => {
                      handleExport('markdown');
                      setShowExportMenu(false);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                  >
                    <span>📝</span>
                    Markdown (.md)
                  </button>
                  <button
                    onClick={() => {
                      handleExport('json');
                      setShowExportMenu(false);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                  >
                    <span>📋</span>
                    JSON (.json)
                  </button>
                  <button
                    onClick={() => {
                      handleExport('csv');
                      setShowExportMenu(false);
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2"
                  >
                    <span>📊</span>
                    CSV (.csv)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Sprint Retro Results
        </h1>
        <p className="text-gray-600">
          Insights from your team's activity with AI-powered analysis
        </p>
        {retroData.analysisMetadata && (
          <div className="flex justify-center gap-4 mt-3 text-sm">
            {retroData.analysisMetadata.llmAnalysisUsed && (
              <div className="flex items-center gap-1 text-purple-600">
                <Brain className="w-4 h-4" />
                AI Analysis
              </div>
            )}
            {retroData.analysisMetadata.ruleBasedAnalysisUsed && (
              <div className="flex items-center gap-1 text-blue-600">
                <Cog className="w-4 h-4" />
                Rule-based Analysis
              </div>
            )}
          </div>
        )}
      </div>

      <FilterPanel />

      {/* Category Statistics */}
      {filteredData.categoryStatistics && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Insights Overview</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-600">Total:</span>
              <span className="ml-1 font-medium">{filteredData.categoryStatistics.total}</span>
            </div>
            <div>
              <span className="text-gray-600">Avg Priority:</span>
              <span className="ml-1 font-medium">
                {(filteredData.categoryStatistics.averagePriority || 0).toFixed(2)}
              </span>
            </div>
            <div>
              <span className="text-gray-600">Avg Confidence:</span>
              <span className="ml-1 font-medium">
                {Math.round((filteredData.categoryStatistics.averageConfidence || 0) * 100)}%
              </span>
            </div>
            <div>
              <span className="text-gray-600">Categories:</span>
              <span className="ml-1 font-medium">
                {Object.keys(filteredData.categoryStatistics.byCategory || {}).filter(cat => 
                  filteredData.categoryStatistics.byCategory[cat] > 0
                ).length}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <RetroSection
          title="What Went Well"
          items={filteredData.wentWell || []}
          emoji="🎉"
          bgColor="bg-green-50 border border-green-200"
        />
        
        <RetroSection
          title="What Didn't Go Well"
          items={filteredData.didntGoWell || []}
          emoji="😬"
          bgColor="bg-red-50 border border-red-200"
        />
        
        <RetroSection
          title="Action Items"
          items={filteredData.actionItems || []}
          emoji="🎯"
          bgColor="bg-blue-50 border border-blue-200"
        />
      </div>
    </div>
  );
}

export default ResultsPage;