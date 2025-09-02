import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import axios from 'axios';
import ReleaseNotesPage from '../ReleaseNotesPage';

// Mock @dnd-kit modules
vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }) => <div data-testid="dnd-context">{children}</div>,
  closestCenter: vi.fn(),
  KeyboardSensor: vi.fn(),
  PointerSensor: vi.fn(),
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
}));

vi.mock('@dnd-kit/sortable', () => ({
  arrayMove: vi.fn((array, from, to) => {
    const result = [...array];
    const [removed] = result.splice(from, 1);
    result.splice(to, 0, removed);
    return result;
  }),
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

// Mock axios
vi.mock('axios');
const mockedAxios = vi.mocked(axios);

// Mock the DateRangePicker component
vi.mock('../DateRangePicker', () => ({
  default: ({ value, onChange }) => (
    <div data-testid="date-range-picker">
      <input
        data-testid="start-date"
        value={value?.start || ''}
        onChange={(e) => onChange({ ...value, start: e.target.value })}
      />
      <input
        data-testid="end-date"
        value={value?.end || ''}
        onChange={(e) => onChange({ ...value, end: e.target.value })}
      />
    </div>
  )
}));

// Mock AppLayout component
vi.mock('../AppLayout', () => ({
  default: ({ children }) => <div data-testid="app-layout">{children}</div>
}));

describe('ReleaseNotesPage', () => {
  const mockOnNavigate = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the release notes page with initial elements', () => {
    render(<ReleaseNotesPage onNavigate={mockOnNavigate} />);
    
    expect(screen.getByText('Release Notes')).toBeInTheDocument();
    expect(screen.getByText('Generate customer-friendly changelogs from your development activity.')).toBeInTheDocument();
    expect(screen.getByTestId('date-range-picker')).toBeInTheDocument();
    expect(screen.getByText('Generate Release Notes')).toBeInTheDocument();
  });

  it('shows configuration section with date range picker', () => {
    render(<ReleaseNotesPage onNavigate={mockOnNavigate} />);
    
    expect(screen.getByText('Configuration')).toBeInTheDocument();
    expect(screen.getByText('Date Range')).toBeInTheDocument();
    expect(screen.getByTestId('date-range-picker')).toBeInTheDocument();
  });

  it('handles generate button click and shows progress', async () => {
    const mockReleaseNotes = {
      id: 'test-id',
      entries: {
        newFeatures: [
          {
            id: 'feature-1',
            title: 'New Feature',
            description: 'A new feature description',
            userValue: 'This helps users work faster'
          }
        ],
        improvements: [],
        fixes: []
      },
      metadata: {
        totalChanges: 1,
        userFacingChanges: 1
      }
    };

    mockedAxios.post.mockResolvedValueOnce({ data: mockReleaseNotes });

    render(<ReleaseNotesPage onNavigate={mockOnNavigate} />);
    
    const generateButton = screen.getByText('Generate Release Notes');
    fireEvent.click(generateButton);

    // Should show generating state
    expect(screen.getByText('Generating...')).toBeInTheDocument();
    expect(screen.getByText('Generating release notes...')).toBeInTheDocument();

    // Wait for generation to complete
    await waitFor(() => {
      expect(screen.getByText('🚀 New Features')).toBeInTheDocument();
    });

    expect(screen.getByText('New Feature')).toBeInTheDocument();
    expect(screen.getByText('A new feature description')).toBeInTheDocument();
  });

  it('handles API errors gracefully', async () => {
    mockedAxios.post.mockRejectedValueOnce({
      response: { data: { error: 'API Error' } }
    });

    render(<ReleaseNotesPage onNavigate={mockOnNavigate} />);
    
    const generateButton = screen.getByText('Generate Release Notes');
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText('Error')).toBeInTheDocument();
      expect(screen.getByText('API Error')).toBeInTheDocument();
    });
  });

  it('shows add entry modal when add entry button is clicked', async () => {
    const mockReleaseNotes = {
      id: 'test-id',
      entries: {
        newFeatures: [],
        improvements: [],
        fixes: []
      },
      metadata: {
        totalChanges: 0,
        userFacingChanges: 0
      }
    };

    mockedAxios.post.mockResolvedValueOnce({ data: mockReleaseNotes });

    render(<ReleaseNotesPage onNavigate={mockOnNavigate} />);
    
    // Generate release notes first
    const generateButton = screen.getByText('Generate Release Notes');
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText(/Add Entry/)).toBeInTheDocument();
    });

    // Click add entry button
    const addEntryButton = screen.getByText(/Add Entry/);
    fireEvent.click(addEntryButton);

    expect(screen.getByText('Add Custom Entry')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Brief, descriptive title for the change')).toBeInTheDocument();
  });

  it('displays release notes categories correctly', async () => {
    const mockReleaseNotes = {
      id: 'test-id',
      entries: {
        newFeatures: [
          { id: '1', title: 'Feature 1', description: 'Description 1' }
        ],
        improvements: [
          { id: '2', title: 'Improvement 1', description: 'Description 2' }
        ],
        fixes: [
          { id: '3', title: 'Fix 1', description: 'Description 3' }
        ]
      },
      metadata: {
        totalChanges: 3,
        userFacingChanges: 3
      }
    };

    mockedAxios.post.mockResolvedValueOnce({ data: mockReleaseNotes });

    render(<ReleaseNotesPage onNavigate={mockOnNavigate} />);
    
    const generateButton = screen.getByText('Generate Release Notes');
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText('🚀 New Features')).toBeInTheDocument();
      expect(screen.getByText('✨ Improvements')).toBeInTheDocument();
      expect(screen.getByText('🐛 Bug Fixes')).toBeInTheDocument();
    });

    expect(screen.getByText('Feature 1')).toBeInTheDocument();
    expect(screen.getByText('Improvement 1')).toBeInTheDocument();
    expect(screen.getByText('Fix 1')).toBeInTheDocument();
  });

  it('handles export functionality', async () => {
    const mockReleaseNotes = {
      id: 'test-id',
      entries: {
        newFeatures: [],
        improvements: [],
        fixes: []
      },
      metadata: {
        totalChanges: 0,
        userFacingChanges: 0
      }
    };

    mockedAxios.post.mockResolvedValueOnce({ data: mockReleaseNotes });
    mockedAxios.post.mockResolvedValueOnce({ 
      data: 'markdown content',
      headers: { 'content-type': 'text/markdown' }
    });

    // Mock URL.createObjectURL and related functions
    global.URL.createObjectURL = vi.fn(() => 'mock-url');
    global.URL.revokeObjectURL = vi.fn();
    
    // Mock document.createElement and appendChild
    const mockLink = {
      href: '',
      download: '',
      click: vi.fn()
    };
    vi.spyOn(document, 'createElement').mockReturnValue(mockLink);
    vi.spyOn(document.body, 'appendChild').mockImplementation(() => {});
    vi.spyOn(document.body, 'removeChild').mockImplementation(() => {});

    render(<ReleaseNotesPage onNavigate={mockOnNavigate} />);
    
    // Generate release notes first
    const generateButton = screen.getByText('Generate Release Notes');
    fireEvent.click(generateButton);

    await waitFor(() => {
      expect(screen.getByText('Markdown')).toBeInTheDocument();
    });

    // Click export button
    const exportButton = screen.getByText('Markdown');
    fireEvent.click(exportButton);

    await waitFor(() => {
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://localhost:3001/api/release-notes/test-id/export',
        { format: 'markdown' },
        { responseType: 'blob' }
      );
    });
  });
});