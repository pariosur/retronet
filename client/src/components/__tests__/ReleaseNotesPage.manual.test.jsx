import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ReleaseNotesPage from '../ReleaseNotesPage';

// Mock all the dependencies
vi.mock('axios');
vi.mock('../DateRangePicker', () => ({
  default: () => <div data-testid="date-range-picker">Mock DateRangePicker</div>
}));
vi.mock('../AppLayout', () => ({
  default: ({ children }) => <div data-testid="app-layout">{children}</div>
}));
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }) => <div data-testid="dnd-context">{children}</div>,
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
}));
vi.mock('@dnd-kit/sortable', () => ({
  arrayMove: vi.fn(),
  SortableContext: ({ children }) => <div data-testid="sortable-context">{children}</div>,
  sortableKeyboardCoordinates: vi.fn(),
  verticalListSortingStrategy: vi.fn(),
  useSortable: vi.fn(() => ({
    attributes: {},
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    transition: null,
    isDragging: false,
  })),
}));
vi.mock('@dnd-kit/utilities', () => ({
  CSS: {
    Transform: {
      toString: vi.fn(() => ''),
    },
  },
}));

describe('ReleaseNotesPage - Manual Editing Features', () => {
  it('renders without crashing with drag-and-drop functionality', () => {
    const mockOnNavigate = vi.fn();
    
    render(<ReleaseNotesPage onNavigate={mockOnNavigate} />);
    
    // Basic rendering test
    expect(screen.getByText('Release Notes')).toBeInTheDocument();
    expect(screen.getByText('Generate customer-friendly changelogs from your development activity.')).toBeInTheDocument();
  });
});