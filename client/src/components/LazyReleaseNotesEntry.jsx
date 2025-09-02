import { useState, useEffect, useRef, memo } from 'react';
import { Loader2, Edit3, Plus, X, Check, GripVertical, Trash2, ArrowRight } from 'lucide-react';

/**
 * LazyReleaseNotesEntry - Lazy-loaded release notes entry component
 * 
 * This component implements lazy loading and virtualization for large datasets
 * to improve performance when displaying many release notes entries.
 */
const LazyReleaseNotesEntry = memo(({ 
  entry, 
  category, 
  onEdit, 
  onDelete, 
  onMoveToCategory,
  isVisible = true,
  style = {},
  ...sortableProps 
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isInView, setIsInView] = useState(false);
  const entryRef = useRef(null);
  const observerRef = useRef(null);

  // Intersection Observer for lazy loading
  useEffect(() => {
    if (!entryRef.current || isLoaded) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const [entry] = entries;
        if (entry.isIntersecting) {
          setIsInView(true);
          setIsLoaded(true);
          // Disconnect observer once loaded
          if (observerRef.current) {
            observerRef.current.disconnect();
          }
        }
      },
      {
        rootMargin: '100px', // Load 100px before entering viewport
        threshold: 0.1
      }
    );

    observerRef.current.observe(entryRef.current);

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [isLoaded]);

  // Force load if visible prop changes
  useEffect(() => {
    if (isVisible && !isLoaded) {
      setIsLoaded(true);
      setIsInView(true);
    }
  }, [isVisible, isLoaded]);

  const categoryOptions = [
    { value: 'newFeatures', label: '🚀 New Features' },
    { value: 'improvements', label: '✨ Improvements' },
    { value: 'fixes', label: '🐛 Bug Fixes' },
  ];

  // Render placeholder while not loaded
  if (!isLoaded || !isInView) {
    return (
      <div
        ref={entryRef}
        style={style}
        className="border border-gray-100 rounded-lg p-3 bg-gray-50 animate-pulse"
      >
        <div className="flex items-start gap-3">
          <div className="w-4 h-4 bg-gray-200 rounded mt-1"></div>
          <div className="flex-1">
            <div className="h-4 bg-gray-200 rounded mb-2 w-3/4"></div>
            <div className="h-3 bg-gray-200 rounded mb-2 w-full"></div>
            <div className="h-3 bg-gray-200 rounded w-1/2"></div>
          </div>
          <div className="flex gap-1">
            <div className="w-4 h-4 bg-gray-200 rounded"></div>
            <div className="w-4 h-4 bg-gray-200 rounded"></div>
            <div className="w-4 h-4 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  // Render full entry once loaded
  return (
    <div
      ref={entryRef}
      style={style}
      className={`border border-gray-100 rounded-lg p-3 hover:bg-gray-50 transition-colors ${
        sortableProps.isDragging ? 'shadow-lg opacity-50' : ''
      }`}
      {...(sortableProps.setNodeRef ? { ref: sortableProps.setNodeRef } : {})}
    >
      <div className="flex items-start gap-3">
        <div
          {...(sortableProps.attributes || {})}
          {...(sortableProps.listeners || {})}
          className="mt-1 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 transition-colors"
        >
          <GripVertical className="w-4 h-4" />
        </div>
        
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-900 mb-1 truncate" title={entry.title}>
            {entry.title}
          </h4>
          <p className="text-sm text-gray-700 mb-2 line-clamp-2">
            {entry.description}
          </p>
          {entry.userValue && (
            <p className="text-xs text-gray-600 italic line-clamp-1" title={entry.userValue}>
              Why it matters: {entry.userValue}
            </p>
          )}
          
          {/* Category badge and metadata */}
          <div className="mt-2 flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700">
              {categoryOptions.find(opt => opt.value === category)?.label || category}
            </span>
            {entry.source === 'manual' && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-700">
                Manual
              </span>
            )}
            {entry.confidence && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-700">
                {Math.round(entry.confidence * 100)}% confidence
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Move to category dropdown */}
          <div className="relative group">
            <button 
              className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
              title="Move to category"
            >
              <ArrowRight className="w-4 h-4" />
            </button>
            <div className="absolute right-0 top-6 bg-white border border-gray-200 rounded-md shadow-lg z-10 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all min-w-max">
              <div className="p-1">
                <div className="text-xs text-gray-500 px-2 py-1">Move to:</div>
                {categoryOptions
                  .filter(opt => opt.value !== category)
                  .map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => onMoveToCategory(entry.id, category, opt.value)}
                      className="block w-full text-left px-2 py-1 text-xs hover:bg-gray-100 rounded whitespace-nowrap transition-colors"
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
            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
            title="Edit entry"
          >
            <Edit3 className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => onDelete(entry.id, category)}
            className="p-1 text-gray-400 hover:text-red-600 transition-colors"
            title="Delete entry"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
});

LazyReleaseNotesEntry.displayName = 'LazyReleaseNotesEntry';

export default LazyReleaseNotesEntry;