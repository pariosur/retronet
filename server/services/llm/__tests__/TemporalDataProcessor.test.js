/**
 * Tests for TemporalDataProcessor
 */

import { TemporalDataProcessor } from '../TemporalDataProcessor.js';

describe('TemporalDataProcessor', () => {
  let processor;
  let mockTeamData;
  let mockDateRange;

  beforeEach(() => {
    processor = new TemporalDataProcessor({
      chunkSizeHours: 24,
      overlapHours: 2
    });

    mockDateRange = {
      start: '2024-01-01T00:00:00Z',
      end: '2024-01-03T23:59:59Z'
    };

    mockTeamData = {
      github: {
        commits: [
          {
            sha: 'abc123',
            commit: {
              message: 'Fix user authentication bug',
              author: { name: 'Alice', date: '2024-01-01T10:30:00Z' }
            },
            author: { login: 'alice' },
            stats: { additions: 15, deletions: 3 }
          }
        ],
        pullRequests: [
          {
            number: 123,
            title: 'Authentication improvements',
            user: { login: 'alice' },
            state: 'merged',
            created_at: '2024-01-01T09:00:00Z',
            merged_at: '2024-01-01T16:00:00Z'
          }
        ]
      },
      linear: {
        issues: [
          {
            id: 'issue-1',
            title: 'Fix login bug',
            createdAt: '2024-01-01T08:00:00Z',
            completedAt: '2024-01-01T17:00:00Z',
            assignee: { name: 'Alice' },
            state: { name: 'Done' }
          }
        ]
      },
      slack: {
        messages: [
          {
            text: 'Working on the authentication fix',
            user: 'alice',
            channel: 'dev-team',
            ts: '1704096600'
          }
        ]
      }
    };
  });

  test('should process team data and create temporal chunks', () => {
    const result = processor.processTeamData(mockTeamData, mockDateRange);

    expect(result.totalEvents).toBeGreaterThan(0);
    expect(result.chunks).toBeDefined();
    expect(Array.isArray(result.chunks)).toBe(true);
  });

  test('should extract events with proper structure', () => {
    const events = processor._extractAllEvents(mockTeamData);
    
    expect(events.length).toBeGreaterThan(0);
    
    const firstEvent = events[0];
    expect(firstEvent).toHaveProperty('type');
    expect(firstEvent).toHaveProperty('source');
    expect(firstEvent).toHaveProperty('timestamp');
    expect(firstEvent).toHaveProperty('data');
  });
});