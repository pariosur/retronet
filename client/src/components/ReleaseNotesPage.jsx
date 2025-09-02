import { useState } from 'react';
import { Loader2, Download, Edit3, Plus, X, Check, FileText, AlertCircle, GripVertical, Trash2, ArrowRight, Zap } from 'lucide-react';
import axios from 'axios';
import AppLayout from './AppLayout';
import DateRangePicker from './DateRangePicker';
import VirtualizedReleaseNotesList from './VirtualizedReleaseNotesList';
import LazyReleaseNotesEntry from './LazyReleaseNotesEntry';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Sortable Item Component for drag-and-drop
function SortableReleaseNotesEntry({ entry, category, onEdit, onDelete, onMoveToCategory }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const categoryOptions = [
    { value: 'newFeatures', label: '🚀 New Features' },
    { value: 'improvements', label: '✨ Improvements' },
    { value: 'fixes', label: '🐛 Bug Fixes' },
  ];

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`border border-gray-100 rounded-lg p-3 hover:bg-gray-50 ${isDragging ? 'shadow-lg' : ''}`}
    >
      <div className="flex items-start gap-3">
        <div
          {...attributes}
          {...listeners}
          className="mt-1 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600"
        >
          <GripVertical className="w-4 h-4" />
        </div>
        
        <div className="flex-1">
          <h4 className="font-medium text-gray-900 mb-1">{entry.title}</h4>
          <p className="text-sm text-gray-700 mb-2">{entry.description}</p>
          {entry.userValue && (
            <p className="text-xs text-gray-600 italic">Why it matters: {entry.userValue}</p>
          )}
          
          {/* Category badge */}
          <div className="mt-2 flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700">
              {categoryOptions.find(opt => opt.value === category)?.label || category}
            </span>
            {entry.source === 'manual' && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-700">
                Manual
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-1">
          {/* Move to category dropdown */}
          <div className="relative group">
            <button className="p-1 text-gray-400 hover:text-gray-600">
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="absolute right-0 top-6 bg-white border border-gray-200 rounded-md shadow-lg z-10 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
              <div className="p-1">
                <div className="text-xs text-gray-500 px-2 py-1">Move to:</div>
                {categoryOptions
                  .filter(opt => opt.value !== category)
                  .map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => onMoveToCategory(entry.id, category, opt.value)}
                      className="block w-full text-left px-2 py-1 text-xs hover:bg-gray-100 rounded whitespace-nowrap"
                    >
                      {opt.label}
                    </button>
                  ))
                }
              </div>
            </div>
          </div>
          
          <button
            onClick={() => onEdit(entry.id, category)}
            className="p-1 text-gray-400 hover:text-gray-600"
          >
            <Edit3 className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => onDelete(entry.id, category)}
            className="p-1 text-gray-400 hover:text-red-600"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ReleaseNotesPage({ onNavigate }) {
  const [dateRange, setDateRange] = useState(() => {
    const start = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const end = new Date().toISOString().split('T')[0];
    return { start, end };
  });
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [releaseNotes, setReleaseNotes] = useState(null);
  const [error, setError] = useState(null);
  const [editingEntry, setEditingEntry] = useState(null);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [newEntry, setNewEntry] = useState({
    title: '',
    description: '',
    category: 'newFeatures',
    userValue: ''
  });
  const [retryInfo, setRetryInfo] = useState(null);
  const [retryCountdown, setRetryCountdown] = useState(0);
  const [enablePerformanceOptimizations, setEnablePerformanceOptimizations] = useState(true);
  const [performanceMetrics, setPerformanceMetrics] = useState(null);

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    setReleaseNotes(null);
    setProgress('Starting release notes generation...');
    
    let sessionId = null;
    let progressInterval = null;

    try {
      const response = await axios.post('http://localhost:3001/api/generate-release-notes', {
        dateRange,
        options: {
          enablePerformanceOptimizations
        }
      });
      
      sessionId = response.data.sessionId;
      
      // Start polling for progress updates
      progressInterval = setInterval(async () => {
        try {
          const progressResponse = await axios.get(`http://localhost:3001/api/release-notes-progress/${sessionId}`);
          const progressData = progressResponse.data;
          
          if (progressData.userFriendlyStatus) {
            setProgress(progressData.userFriendlyStatus);
          }
          
          // Stop polling if completed or failed
          if (progressData.status.completed) {
            clearInterval(progressInterval);
          }
        } catch (progressError) {
          // Progress polling failed, but don't interrupt main generation
          console.warn('Progress polling failed:', progressError);
        }
      }, 1000);
      
      setReleaseNotes(response.data);
      
      // Show warnings if there were issues during generation
      if (response.data.warnings) {
        const warningMessage = `${response.data.warnings.message}. ${response.data.warnings.degradationInfo?.message || ''}`;
        setError(warningMessage);
      }
      
      // Store performance metrics if available
      if (response.data.performanceMetrics) {
        setPerformanceMetrics(response.data.performanceMetrics);
      }
      
      setProgress('');
    } catch (error) {
      console.error('Error generating release notes:', error);
      
      // Handle structured error response
      if (error.response?.data) {
        const errorData = error.response.data;
        
        if (errorData.userFriendlyError) {
          const userError = errorData.userFriendlyError;
          let errorMessage = `${userError.title}: ${userError.message}`;
          
          // Add fallback information if available
          if (userError.fallback) {
            errorMessage += ` (${userError.fallback})`;
          }
          
          // Add retry information if available
          if (errorData.retryInfo?.recommended) {
            errorMessage += ` You can retry in ${Math.round(errorData.retryInfo.delay / 1000)} seconds.`;
          }
          
          setError(errorMessage);
          
          // Set retry information if available
          if (errorData.retryInfo?.recommended) {
            setRetryInfo(errorData.retryInfo);
            startRetryCountdown(errorData.retryInfo.delay);
          }
        } else {
          setError(errorData.error || 'Failed to generate release notes. Please try again.');
        }
      } else {
        setError('Failed to generate release notes. Please check your connection and try again.');
      }
      
      setProgress('');
    } finally {
      setIsGenerating(false);
      
      if (progressInterval) {
        clearInterval(progressInterval);
      }
    }
  };

  const startRetryCountdown = (delayMs) => {
    let remainingSeconds = Math.ceil(delayMs / 1000);
    setRetryCountdown(remainingSeconds);
    
    const countdownInterval = setInterval(() => {
      remainingSeconds -= 1;
      setRetryCountdown(remainingSeconds);
      
      if (remainingSeconds <= 0) {
        clearInterval(countdownInterval);
        setRetryCountdown(0);
      }
    }, 1000);
  };

  const handleRetry = () => {
    setRetryInfo(null);
    setRetryCountdown(0);
    handleGenerate();
  };

  const handleEditEntry = (entryId, category) => {
    const entry = releaseNotes.entries[category].find(e => e.id === entryId);
    if (entry) {
      setEditingEntry({ ...entry, category, originalId: entryId });
    }
  };

  const handleSaveEdit = async () => {
    if (!editingEntry || !releaseNotes) return;
    
    try {
      const updatedEntries = { ...releaseNotes.entries };
      
      // Find the original entry and its category
      let originalCategory = null;
      let originalIndex = -1;
      
      for (const [category, entries] of Object.entries(updatedEntries)) {
        const index = entries.findIndex(e => e.id === editingEntry.originalId);
        if (index !== -1) {
          originalCategory = category;
          originalIndex = index;
          break;
        }
      }
      
      if (originalCategory && originalIndex !== -1) {
        // Create updated entry
        const updatedEntry = {
          ...editingEntry,
          id: editingEntry.originalId,
          source: editingEntry.source || 'manual'
        };
        
        // If category changed, move the entry
        if (originalCategory !== editingEntry.category) {
          // Remove from original category
          updatedEntries[originalCategory].splice(originalIndex, 1);
          // Add to new category
          updatedEntries[editingEntry.category] = [...updatedEntries[editingEntry.category], updatedEntry];
        } else {
          // Update in same category
          updatedEntries[originalCategory][originalIndex] = updatedEntry;
        }
        
        const updatedReleaseNotes = {
          ...releaseNotes,
          entries: updatedEntries
        };
        
        // Update on server
        await axios.put(`http://localhost:3001/api/release-notes/${releaseNotes.id}`, updatedReleaseNotes);
        
        setReleaseNotes(updatedReleaseNotes);
        setEditingEntry(null);
      }
    } catch (error) {
      console.error('Error saving edit:', error);
      setError('Failed to save changes. Please try again.');
    }
  };

  const handleAddEntry = async () => {
    if (!newEntry.title.trim() || !newEntry.description.trim() || !releaseNotes) return;
    
    try {
      const entryId = `manual_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const entry = {
        ...newEntry,
        id: entryId,
        impact: 'medium',
        confidence: 1.0,
        source: 'manual',
        metadata: {
          originalTitle: newEntry.title,
          translationConfidence: 1.0,
          reviewRequired: false
        }
      };
      
      const updatedEntries = { ...releaseNotes.entries };
      updatedEntries[newEntry.category] = [...updatedEntries[newEntry.category], entry];
      
      const updatedReleaseNotes = {
        ...releaseNotes,
        entries: updatedEntries
      };
      
      // Update on server
      await axios.put(`http://localhost:3001/api/release-notes/${releaseNotes.id}`, updatedReleaseNotes);
      
      setReleaseNotes(updatedReleaseNotes);
      setNewEntry({ title: '', description: '', category: 'newFeatures', userValue: '' });
      setShowAddEntry(false);
    } catch (error) {
      console.error('Error adding entry:', error);
      setError('Failed to add entry. Please try again.');
    }
  };

  const handleDeleteEntry = async (entryId, category) => {
    if (!releaseNotes) return;
    
    try {
      const updatedEntries = { ...releaseNotes.entries };
      updatedEntries[category] = updatedEntries[category].filter(entry => entry.id !== entryId);
      
      const updatedReleaseNotes = {
        ...releaseNotes,
        entries: updatedEntries
      };
      
      // Update on server
      await axios.put(`http://localhost:3001/api/release-notes/${releaseNotes.id}`, updatedReleaseNotes);
      
      setReleaseNotes(updatedReleaseNotes);
    } catch (error) {
      console.error('Error deleting entry:', error);
      setError('Failed to delete entry. Please try again.');
    }
  };

  const handleMoveToCategory = async (entryId, fromCategory, toCategory) => {
    if (!releaseNotes || fromCategory === toCategory) return;
    
    try {
      const updatedEntries = { ...releaseNotes.entries };
      
      // Find and remove entry from source category
      const entryIndex = updatedEntries[fromCategory].findIndex(entry => entry.id === entryId);
      if (entryIndex === -1) return;
      
      const [entry] = updatedEntries[fromCategory].splice(entryIndex, 1);
      
      // Add entry to target category
      updatedEntries[toCategory] = [...updatedEntries[toCategory], entry];
      
      const updatedReleaseNotes = {
        ...releaseNotes,
        entries: updatedEntries
      };
      
      // Update on server
      await axios.put(`http://localhost:3001/api/release-notes/${releaseNotes.id}`, updatedReleaseNotes);
      
      setReleaseNotes(updatedReleaseNotes);
    } catch (error) {
      console.error('Error moving entry:', error);
      setError('Failed to move entry. Please try again.');
    }
  };

  const handleDragEnd = async (event) => {
    const { active, over } = event;
    
    if (!over || !releaseNotes) return;
    
    // Find which category the dragged item belongs to
    let sourceCategory = null;
    let sourceIndex = -1;
    
    for (const [category, entries] of Object.entries(releaseNotes.entries)) {
      const index = entries.findIndex(entry => entry.id === active.id);
      if (index !== -1) {
        sourceCategory = category;
        sourceIndex = index;
        break;
      }
    }
    
    if (!sourceCategory) return;
    
    // Find target position
    let targetCategory = sourceCategory;
    let targetIndex = -1;
    
    for (const [category, entries] of Object.entries(releaseNotes.entries)) {
      const index = entries.findIndex(entry => entry.id === over.id);
      if (index !== -1) {
        targetCategory = category;
        targetIndex = index;
        break;
      }
    }
    
    if (targetIndex === -1) return;
    
    try {
      const updatedEntries = { ...releaseNotes.entries };
      
      if (sourceCategory === targetCategory) {
        // Reordering within the same category
        if (sourceIndex !== targetIndex) {
          updatedEntries[sourceCategory] = arrayMove(
            updatedEntries[sourceCategory],
            sourceIndex,
            targetIndex
          );
        }
      } else {
        // Moving between categories
        const [entry] = updatedEntries[sourceCategory].splice(sourceIndex, 1);
        updatedEntries[targetCategory].splice(targetIndex, 0, entry);
      }
      
      const updatedReleaseNotes = {
        ...releaseNotes,
        entries: updatedEntries
      };
      
      // Update on server
      await axios.put(`http://localhost:3001/api/release-notes/${releaseNotes.id}`, updatedReleaseNotes);
      
      setReleaseNotes(updatedReleaseNotes);
    } catch (error) {
      console.error('Error reordering entries:', error);
      setError('Failed to reorder entries. Please try again.');
    }
  };

  const handleExport = async (format) => {
    if (!releaseNotes) return;
    
    try {
      const response = await axios.post(
        `http://localhost:3001/api/release-notes/${releaseNotes.id}/export`,
        { format },
        { responseType: 'blob' }
      );
      
      const blob = new Blob([response.data], { type: response.headers['content-type'] });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `release-notes-${dateRange.start}-to-${dateRange.end}.${format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting release notes:', error);
      setError('Failed to export release notes. Please try again.');
    }
  };

  const getCategoryTitle = (category) => {
    switch (category) {
      case 'newFeatures': return '🚀 New Features';
      case 'improvements': return '✨ Improvements';
      case 'fixes': return '🐛 Bug Fixes';
      default: return category;
    }
  };

  const getCategoryDescription = (category) => {
    switch (category) {
      case 'newFeatures': return 'Brand new functionality available to users';
      case 'improvements': return 'Enhancements to existing features';
      case 'fixes': return 'Bug fixes that improve user experience';
      default: return '';
    }
  };

  return (
    <AppLayout onNavigate={onNavigate}>
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <div className="mb-2">
            <FileText className="w-6 h-6 text-gray-700" />
          </div>
          <h1 className="text-xl font-semibold text-gray-900 mb-1">Release Notes</h1>
          <p className="text-sm text-gray-600">Generate customer-friendly changelogs from your development activity.</p>
          
          {releaseNotes && (
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800 mb-1">
                <strong>Editing Tips:</strong>
              </p>
              <ul className="text-xs text-blue-700 space-y-1">
                <li>• Drag entries with the grip handle to reorder within categories</li>
                <li>• Use the arrow button to move entries between categories</li>
                <li>• Click the edit button to modify entry details and category</li>
                <li>• Add custom entries for changes not captured automatically</li>
              </ul>
            </div>
          )}
        </div>

        {/* Configuration Section */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          <h2 className="text-sm font-semibold text-gray-800 mb-3">Configuration</h2>
          <div className="flex items-center gap-4 mb-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Date Range</label>
              <DateRangePicker 
                value={dateRange} 
                onChange={setDateRange}
                className="w-64"
              />
            </div>
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !dateRange.start || !dateRange.end}
              className="bg-gray-900 text-white py-2 px-4 rounded-md hover:bg-black transition-colors flex items-center gap-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  Generate Release Notes
                </>
              )}
            </button>
          </div>
          
          {/* Performance Optimization Controls */}
          <div className="flex items-center gap-4 pt-3 border-t border-gray-100">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="enableOptimizations"
                checked={enablePerformanceOptimizations}
                onChange={(e) => setEnablePerformanceOptimizations(e.target.checked)}
                className="rounded border-gray-300 text-gray-900 focus:ring-gray-500"
              />
              <label htmlFor="enableOptimizations" className="text-xs text-gray-600 flex items-center gap-1">
                <Zap className="w-3 h-3" />
                Enable performance optimizations
              </label>
            </div>
            
            {performanceMetrics && (
              <div className="text-xs text-gray-500">
                Cache hit rate: {performanceMetrics.cache?.hitRate || '0%'} | 
                Savings: {performanceMetrics.cache?.estimatedSavings || '$0.00'}
              </div>
            )}
          </div>
        </div>

        {/* Progress Section */}
        {isGenerating && (
          <div className="bg-white border border-gray-200 rounded-xl p-6 mb-6">
            <div className="flex items-center gap-2 mb-2 text-gray-900">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm font-medium">Generating release notes...</span>
            </div>
            <p className="text-sm text-gray-600 mb-4">{progress}</p>
            <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
              <div className="bg-gray-900 h-1.5 w-1/2 animate-pulse"></div>
            </div>
          </div>
        )}

        {/* Error Section */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
            <div className="flex items-center gap-2 text-red-800">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm font-medium">Error</span>
            </div>
            <p className="text-sm text-red-700 mt-1">{error}</p>
            
            {/* Retry Section */}
            {retryInfo && (
              <div className="mt-3 pt-3 border-t border-red-200">
                <div className="flex items-center gap-2">
                  {retryCountdown > 0 ? (
                    <button
                      disabled
                      className="px-3 py-1.5 text-sm bg-gray-100 text-gray-500 rounded-md cursor-not-allowed"
                    >
                      Retry in {retryCountdown}s
                    </button>
                  ) : (
                    <button
                      onClick={handleRetry}
                      className="px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                    >
                      Retry Now
                    </button>
                  )}
                  <span className="text-xs text-red-600">
                    Automatic retry recommended
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Release Notes Preview */}
        {releaseNotes && (
          <div className="space-y-6">
            {/* Header with Export Options */}
            <div className="bg-white border border-gray-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">
                    Release Notes - {dateRange.start} to {dateRange.end}
                  </h2>
                  <p className="text-sm text-gray-600">
                    Generated {releaseNotes.metadata?.totalChanges || 0} changes, 
                    {releaseNotes.metadata?.userFacingChanges || 0} user-facing
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowAddEntry(true)}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    <Plus className="w-4 h-4" />
                    Add Entry
                  </button>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleExport('markdown')}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      <Download className="w-4 h-4" />
                      Markdown
                    </button>
                    <button
                      onClick={() => handleExport('html')}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                    >
                      <Download className="w-4 h-4" />
                      HTML
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Release Notes Content with Drag and Drop */}
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              {['newFeatures', 'improvements', 'fixes'].map(category => (
                <div key={category} className="bg-white border border-gray-200 rounded-xl p-4">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {getCategoryTitle(category)}
                    </h3>
                    <p className="text-sm text-gray-600">{getCategoryDescription(category)}</p>
                  </div>
                  
                  {releaseNotes.entries[category]?.length > 0 ? (
                    <VirtualizedReleaseNotesList
                      entries={releaseNotes.entries[category]}
                      category={category}
                      onEdit={handleEditEntry}
                      onDelete={handleDeleteEntry}
                      onMoveToCategory={handleMoveToCategory}
                      height={Math.min(600, releaseNotes.entries[category].length * 120)}
                      itemHeight={120}
                    />
                  ) : (
                    <div className="border-2 border-dashed border-gray-200 rounded-lg p-6 text-center">
                      <p className="text-sm text-gray-500 italic">
                        No {category.replace(/([A-Z])/g, ' $1').toLowerCase()} found for this period.
                      </p>
                      <p className="text-xs text-gray-400 mt-1">
                        Drag entries here or add custom entries to populate this section.
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </DndContext>
          </div>
        )}

        {/* Edit Entry Modal */}
        {editingEntry && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Edit Entry</h3>
                  <p className="text-sm text-gray-600">
                    {editingEntry.source === 'manual' ? 'Custom entry' : 'AI-generated entry'}
                  </p>
                </div>
                <button
                  onClick={() => setEditingEntry(null)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input
                    type="text"
                    value={editingEntry.title}
                    onChange={(e) => setEditingEntry(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                    placeholder="Brief, descriptive title for the change"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={editingEntry.description}
                    onChange={(e) => setEditingEntry(prev => ({ ...prev, description: e.target.value }))}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                    placeholder="Describe what changed and how it affects users in simple, non-technical language"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">User Value (Why it matters)</label>
                  <textarea
                    value={editingEntry.userValue || ''}
                    onChange={(e) => setEditingEntry(prev => ({ ...prev, userValue: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                    placeholder="Explain the business value and user benefits of this change"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <select
                      value={editingEntry.category}
                      onChange={(e) => setEditingEntry(prev => ({ ...prev, category: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                    >
                      <option value="newFeatures">🚀 New Features</option>
                      <option value="improvements">✨ Improvements</option>
                      <option value="fixes">🐛 Bug Fixes</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Impact Level</label>
                    <select
                      value={editingEntry.impact || 'medium'}
                      onChange={(e) => setEditingEntry(prev => ({ ...prev, impact: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                    >
                      <option value="high">High Impact</option>
                      <option value="medium">Medium Impact</option>
                      <option value="low">Low Impact</option>
                    </select>
                  </div>
                </div>

                {/* Technical Details (if available) */}
                {editingEntry.technicalDetails && (
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Technical Details</h4>
                    <div className="bg-gray-50 rounded-md p-3 text-sm text-gray-600">
                      {editingEntry.technicalDetails.commits?.length > 0 && (
                        <div className="mb-2">
                          <span className="font-medium">Commits:</span> {editingEntry.technicalDetails.commits.length}
                        </div>
                      )}
                      {editingEntry.technicalDetails.issues?.length > 0 && (
                        <div className="mb-2">
                          <span className="font-medium">Issues:</span> {editingEntry.technicalDetails.issues.length}
                        </div>
                      )}
                      {editingEntry.technicalDetails.pullRequests?.length > 0 && (
                        <div>
                          <span className="font-medium">Pull Requests:</span> {editingEntry.technicalDetails.pullRequests.length}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex items-center justify-between mt-6">
                <div className="flex items-center gap-2">
                  {editingEntry.source !== 'manual' && (
                    <button
                      onClick={() => handleDeleteEntry(editingEntry.originalId, editingEntry.category)}
                      className="px-3 py-2 text-sm text-red-600 border border-red-300 rounded-md hover:bg-red-50 flex items-center gap-1"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete Entry
                    </button>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingEntry(null)}
                    className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveEdit}
                    disabled={!editingEntry.title.trim() || !editingEntry.description.trim()}
                    className="px-4 py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-black flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Check className="w-4 h-4" />
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Add Entry Modal */}
        {showAddEntry && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Add Custom Entry</h3>
                  <p className="text-sm text-gray-600">
                    Add a manual entry for changes not captured by automated analysis
                  </p>
                </div>
                <button
                  onClick={() => {
                    setShowAddEntry(false);
                    setNewEntry({ title: '', description: '', category: 'newFeatures', userValue: '' });
                  }}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input
                    type="text"
                    value={newEntry.title}
                    onChange={(e) => setNewEntry(prev => ({ ...prev, title: e.target.value }))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                    placeholder="Brief, descriptive title for the change"
                    autoFocus
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea
                    value={newEntry.description}
                    onChange={(e) => setNewEntry(prev => ({ ...prev, description: e.target.value }))}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                    placeholder="Describe what changed and how it affects users in simple, non-technical language"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">User Value (Why it matters)</label>
                  <textarea
                    value={newEntry.userValue}
                    onChange={(e) => setNewEntry(prev => ({ ...prev, userValue: e.target.value }))}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                    placeholder="Explain the business value and user benefits of this change"
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                    <select
                      value={newEntry.category}
                      onChange={(e) => setNewEntry(prev => ({ ...prev, category: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                    >
                      <option value="newFeatures">🚀 New Features</option>
                      <option value="improvements">✨ Improvements</option>
                      <option value="fixes">🐛 Bug Fixes</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Impact Level</label>
                    <select
                      value={newEntry.impact || 'medium'}
                      onChange={(e) => setNewEntry(prev => ({ ...prev, impact: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-gray-500"
                    >
                      <option value="high">High Impact</option>
                      <option value="medium">Medium Impact</option>
                      <option value="low">Low Impact</option>
                    </select>
                  </div>
                </div>

                {/* Preview */}
                {(newEntry.title || newEntry.description) && (
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">Preview</h4>
                    <div className="bg-gray-50 rounded-lg p-3 border border-gray-200">
                      <h5 className="font-medium text-gray-900 mb-1">
                        {newEntry.title || 'Entry title...'}
                      </h5>
                      <p className="text-sm text-gray-700 mb-2">
                        {newEntry.description || 'Entry description...'}
                      </p>
                      {newEntry.userValue && (
                        <p className="text-xs text-gray-600 italic">
                          Why it matters: {newEntry.userValue}
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex items-center justify-end gap-2 mt-6">
                <button
                  onClick={() => {
                    setShowAddEntry(false);
                    setNewEntry({ title: '', description: '', category: 'newFeatures', userValue: '' });
                  }}
                  className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddEntry}
                  disabled={!newEntry.title.trim() || !newEntry.description.trim()}
                  className="px-4 py-2 text-sm bg-gray-900 text-white rounded-md hover:bg-black flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                  Add Entry
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

export default ReleaseNotesPage;