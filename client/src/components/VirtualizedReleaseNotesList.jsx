import { useState, useEffect, useRef, useMemo, memo } from 'react';
import * as ReactWindow from 'react-window';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import LazyReleaseNotesEntry from './LazyReleaseNotesEntry';

/**
 * VirtualizedReleaseNotesList - Virtualized list component for large datasets
 * 
 * This component uses react-window for virtualization to handle large numbers
 * of release notes entries efficiently.
 */

// Sortable wrapper for virtualized items
const SortableVirtualizedItem = memo(({ index, style, data }) => {
  const { entries, category, onEdit, onDelete, onMoveToCategory } = data;
  const entry = entries[index];
  
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: entry.id });

  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
    ...style,
  };

  return (
    <div style={sortableStyle}>
      <LazyReleaseNotesEntry
        entry={entry}
        category={category}
        onEdit={onEdit}
        onDelete={onDelete}
        onMoveToCategory={onMoveToCategory}
        setNodeRef={setNodeRef}
        attributes={attributes}
        listeners={listeners}
        isDragging={isDragging}
        style={{ margin: '0 0 8px 0' }}
      />
    </div>
  );
});

SortableVirtualizedItem.displayName = 'SortableVirtualizedItem';

const VirtualizedReleaseNotesList = memo(({ 
  entries, 
  category, 
  onEdit, 
  onDelete, 
  onMoveToCategory,
  height = 400,
  itemHeight = 120,
  overscan = 5 
}) => {
  const listRef = useRef(null);
  const [isVirtualized, setIsVirtualized] = useState(false);
  
  // Threshold for enabling virtualization
  const VIRTUALIZATION_THRESHOLD = 20;

  // Determine if virtualization should be used
  useEffect(() => {
    setIsVirtualized(entries.length > VIRTUALIZATION_THRESHOLD);
  }, [entries.length]);

  // Memoized data for the virtualized list
  const listData = useMemo(() => ({
    entries,
    category,
    onEdit,
    onDelete,
    onMoveToCategory
  }), [entries, category, onEdit, onDelete, onMoveToCategory]);

  // If not enough items, render normally without virtualization
  if (!isVirtualized) {
    return (
      <SortableContext
        items={entries.map(entry => entry.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2">
          {entries.map(entry => (
            <LazyReleaseNotesEntry
              key={entry.id}
              entry={entry}
              category={category}
              onEdit={onEdit}
              onDelete={onDelete}
              onMoveToCategory={onMoveToCategory}
            />
          ))}
        </div>
      </SortableContext>
    );
  }

  // Render virtualized list for large datasets
  return (
    <div className="virtualized-list-container">
      <div className="mb-2 text-xs text-gray-500">
        Showing {entries.length} entries (virtualized for performance)
      </div>
      
      <SortableContext
        items={entries.map(entry => entry.id)}
        strategy={verticalListSortingStrategy}
      >
        <ReactWindow.FixedSizeList
          ref={listRef}
          height={height}
          itemCount={entries.length}
          itemSize={itemHeight}
          itemData={listData}
          overscanCount={overscan}
          className="virtualized-release-notes-list"
        >
          {SortableVirtualizedItem}
        </ReactWindow.FixedSizeList>
      </SortableContext>
    </div>
  );
});

VirtualizedReleaseNotesList.displayName = 'VirtualizedReleaseNotesList';

export default VirtualizedReleaseNotesList;