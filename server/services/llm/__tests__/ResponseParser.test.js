import { describe, it, expect } from 'vitest';
import ResponseParser from '../ResponseParser.js';

describe('ResponseParser', () => {
  describe('parseResponse', () => {
    it('should throw error for invalid input', () => {
      expect(() => ResponseParser.parseResponse(null)).toThrow('Invalid response: must be a non-empty string');
      expect(() => ResponseParser.parseResponse('')).toThrow('Invalid response: must be a non-empty string');
      expect(() => ResponseParser.parseResponse(123)).toThrow('Invalid response: must be a non-empty string');
    });

    it('should parse valid JSON response', () => {
      const jsonResponse = JSON.stringify({
        wentWell: [
          { title: 'Good deployment', details: 'Deployment went smoothly' }
        ],
        didntGoWell: [
          { title: 'Bug found', details: 'Critical bug in production' }
        ],
        actionItems: [
          { title: 'Fix bug', details: 'Address the critical bug', priority: 'high' }
        ]
      });

      const result = ResponseParser.parseResponse(jsonResponse, 'openai');
      
      expect(result.wentWell).toHaveLength(1);
      expect(result.wentWell[0].title).toBe('Good deployment');
      expect(result.wentWell[0].source).toBe('ai');
      expect(result.wentWell[0].llmProvider).toBe('openai');
      
      expect(result.didntGoWell).toHaveLength(1);
      expect(result.didntGoWell[0].title).toBe('Bug found');
      
      expect(result.actionItems).toHaveLength(1);
      expect(result.actionItems[0].priority).toBe('high');
    });

    it('should parse JSON with extra text around it', () => {
      const response = `Here's my analysis:
      
      {
        "wentWell": [
          {"title": "Great teamwork", "details": "Team collaborated well"}
        ]
      }
      
      Hope this helps!`;

      const result = ResponseParser.parseResponse(response, 'openai');
      expect(result.wentWell).toHaveLength(1);
      expect(result.wentWell[0].title).toBe('Great teamwork');
    });

    it('should fallback to text parsing when JSON parsing fails', () => {
      const textResponse = `
      # What Went Well
      - Team delivered features on time
      - Good code review process
      
      # What Didn't Go Well  
      - Too many meetings
      - Deployment issues
      
      # Action Items
      - Reduce meeting frequency
      - Improve deployment process
      `;

      const result = ResponseParser.parseResponse(textResponse, 'anthropic');
      
      expect(result.wentWell.length).toBeGreaterThan(0);
      expect(result.didntGoWell.length).toBeGreaterThan(0);
      expect(result.actionItems.length).toBeGreaterThan(0);
      
      expect(result.wentWell[0].llmProvider).toBe('anthropic');
    });
  });

  describe('parseJsonResponse', () => {
    it('should return null for non-JSON text', () => {
      const result = ResponseParser.parseJsonResponse('This is just plain text', 'openai');
      expect(result).toBeNull();
    });

    it('should parse direct structure format', () => {
      const json = {
        wentWell: [{ title: 'Success', details: 'Great work' }],
        didntGoWell: [{ title: 'Issue', details: 'Had problems' }],
        actionItems: [{ title: 'Fix it', details: 'Need to fix' }]
      };

      const result = ResponseParser.parseJsonResponse(JSON.stringify(json), 'openai');
      
      expect(result.wentWell).toHaveLength(1);
      expect(result.didntGoWell).toHaveLength(1);
      expect(result.actionItems).toHaveLength(1);
    });

    it('should parse nested insights structure', () => {
      const json = {
        insights: {
          wentWell: [{ title: 'Success', details: 'Great work' }],
          didntGoWell: [{ title: 'Issue', details: 'Had problems' }],
          actionItems: [{ title: 'Fix it', details: 'Need to fix' }]
        }
      };

      const result = ResponseParser.parseJsonResponse(JSON.stringify(json), 'openai');
      
      expect(result.wentWell).toHaveLength(1);
      expect(result.didntGoWell).toHaveLength(1);
      expect(result.actionItems).toHaveLength(1);
    });

    it('should parse categorized array structure', () => {
      const json = [
        {
          category: 'Went Well',
          insights: [{ title: 'Success', details: 'Great work' }]
        },
        {
          category: 'Issues',
          insights: [{ title: 'Problem', details: 'Had issues' }]
        },
        {
          category: 'Action Items',
          insights: [{ title: 'Improve', details: 'Need improvement' }]
        }
      ];

      const jsonString = JSON.stringify(json);
      const result = ResponseParser.parseJsonResponse(jsonString, 'openai');
      
      expect(result.wentWell).toHaveLength(1);
      expect(result.didntGoWell).toHaveLength(1);
      expect(result.actionItems).toHaveLength(1);
    });

    it('should handle malformed JSON gracefully', () => {
      const result = ResponseParser.parseJsonResponse('{"invalid": json}', 'openai');
      expect(result).toBeNull();
    });
  });

  describe('parseTextResponse', () => {
    it('should parse markdown-style sections', () => {
      const text = `
      # What Went Well
      - Team delivered on time
      - Good communication
      
      # What Didn't Go Well
      - Too many bugs
      - Slow deployment
      
      # Action Items
      - Improve testing
      - Speed up CI/CD
      `;

      const result = ResponseParser.parseTextResponse(text, 'openai');
      
      expect(result.wentWell.length).toBeGreaterThan(0);
      expect(result.didntGoWell.length).toBeGreaterThan(0);
      expect(result.actionItems.length).toBeGreaterThan(0);
      
      expect(result.wentWell[0].source).toBe('ai');
      expect(result.actionItems[0].priority).toBe('medium'); // default
    });

    it('should parse bullet point sections', () => {
      const text = `
      * Positive aspects:
      - Great teamwork
      - Met deadlines
      
      * Issues encountered:
      - Server downtime
      - Communication gaps
      
      * Recommendations:
      - Monitor servers better
      - Daily standups
      `;

      const result = ResponseParser.parseTextResponse(text, 'anthropic');
      
      expect(result.wentWell.length).toBeGreaterThan(0);
      expect(result.didntGoWell.length).toBeGreaterThan(0);
      expect(result.actionItems.length).toBeGreaterThan(0);
    });

    it('should handle unstructured text', () => {
      const text = `The team worked really well together this sprint. 
      However, we had some deployment issues that caused delays. 
      We should improve our testing process going forward.`;

      const result = ResponseParser.parseTextResponse(text, 'openai');
      
      // Should extract general insights
      expect(result.wentWell.length + result.didntGoWell.length + result.actionItems.length).toBeGreaterThan(0);
    });
  });

  describe('extractSections', () => {
    it('should extract markdown headers', () => {
      const text = `
      # Section 1
      Content 1
      
      ## Section 2
      Content 2
      `;

      const sections = ResponseParser.extractSections(text);
      expect(sections).toHaveLength(2);
      expect(sections[0].header).toBe('# Section 1');
      expect(sections[0].content).toContain('Content 1');
    });

    it('should extract bullet point headers', () => {
      const text = `
      * What went well:
      - Item 1
      - Item 2
      
      * Issues:
      - Problem 1
      `;

      const sections = ResponseParser.extractSections(text);
      expect(sections).toHaveLength(2);
      expect(sections[0].header).toBe('* What went well:');
    });
  });

  describe('categorizeSection', () => {
    it('should categorize positive sections', () => {
      expect(ResponseParser.categorizeSection('What went well')).toBe('wentWell');
      expect(ResponseParser.categorizeSection('Positive aspects')).toBe('wentWell');
      expect(ResponseParser.categorizeSection('Successes')).toBe('wentWell');
      expect(ResponseParser.categorizeSection('Good things')).toBe('wentWell');
    });

    it('should categorize negative sections', () => {
      expect(ResponseParser.categorizeSection('What didn\'t go well')).toBe('didntGoWell');
      expect(ResponseParser.categorizeSection('Issues')).toBe('didntGoWell');
      expect(ResponseParser.categorizeSection('Problems')).toBe('didntGoWell');
      expect(ResponseParser.categorizeSection('Challenges')).toBe('didntGoWell');
    });

    it('should categorize action sections', () => {
      expect(ResponseParser.categorizeSection('Action items')).toBe('actionItems');
      expect(ResponseParser.categorizeSection('Improvements')).toBe('actionItems');
      expect(ResponseParser.categorizeSection('Recommendations')).toBe('actionItems');
      expect(ResponseParser.categorizeSection('Next steps')).toBe('actionItems');
    });

    it('should default to didntGoWell for unknown sections', () => {
      expect(ResponseParser.categorizeSection('Random section')).toBe('didntGoWell');
    });
  });

  describe('extractItemsFromText', () => {
    it('should extract bullet point items', () => {
      const lines = [
        '- First item with details',
        '- Second item',
        '  Additional details for second item',
        '* Third item'
      ];

      const items = ResponseParser.extractItemsFromText(lines);
      expect(items).toHaveLength(3);
      expect(items[0].title).toBe('First item with details');
      expect(items[1].details).toContain('Additional details');
    });

    it('should extract numbered items', () => {
      const lines = [
        '1. First numbered item',
        '2. Second numbered item',
        '3. Third item'
      ];

      const items = ResponseParser.extractItemsFromText(lines);
      expect(items).toHaveLength(3);
      expect(items[0].title).toBe('First numbered item');
    });

    it('should handle items without bullets', () => {
      const lines = [
        'First item without bullet',
        'Second item without bullet'
      ];

      const items = ResponseParser.extractItemsFromText(lines);
      expect(items).toHaveLength(1); // Should combine into one item
      expect(items[0].details).toContain('First item');
    });
  });

  describe('extractTitle', () => {
    it('should extract first sentence as title', () => {
      const text = 'This is the title. This is additional details.';
      const title = ResponseParser.extractTitle(text);
      expect(title).toBe('This is the title');
    });

    it('should truncate long text', () => {
      const longText = 'This is a very long text that should be truncated because it exceeds the maximum length limit';
      const title = ResponseParser.extractTitle(longText);
      expect(title).toHaveLength(50); // 47 chars + '...'
      expect(title.endsWith('...')).toBe(true);
    });

    it('should return full text if short', () => {
      const shortText = 'Short text';
      const title = ResponseParser.extractTitle(shortText);
      expect(title).toBe('Short text');
    });
  });

  describe('analyzeSentiment', () => {
    it('should detect positive sentiment', () => {
      expect(ResponseParser.analyzeSentiment('The team did great work')).toBe('positive');
      expect(ResponseParser.analyzeSentiment('Excellent progress this week')).toBe('positive');
    });

    it('should detect negative sentiment', () => {
      expect(ResponseParser.analyzeSentiment('We had many issues')).toBe('negative');
      expect(ResponseParser.analyzeSentiment('Poor performance this sprint')).toBe('negative');
    });

    it('should detect action sentiment', () => {
      expect(ResponseParser.analyzeSentiment('We should improve our process')).toBe('action');
      expect(ResponseParser.analyzeSentiment('Need to fix the deployment')).toBe('action');
    });

    it('should default to negative for neutral text', () => {
      expect(ResponseParser.analyzeSentiment('The weather is nice')).toBe('negative');
    });
  });

  describe('normalizeInsights', () => {
    it('should normalize array of insights', () => {
      const insights = [
        { title: 'Test', details: 'Details' },
        { title: 'Test 2', details: 'More details', confidence: 0.9 }
      ];

      const normalized = ResponseParser.normalizeInsights(insights, 'ai', 'openai');
      
      expect(normalized).toHaveLength(2);
      expect(normalized[0].source).toBe('ai');
      expect(normalized[0].llmProvider).toBe('openai');
      expect(normalized[0].confidence).toBe(0.8); // default
      expect(normalized[1].confidence).toBe(0.9); // preserved
    });

    it('should return empty array for invalid input', () => {
      expect(ResponseParser.normalizeInsights(null)).toEqual([]);
      expect(ResponseParser.normalizeInsights('not an array')).toEqual([]);
    });
  });

  describe('normalizeActionItems', () => {
    it('should normalize action items with default priority and assignee', () => {
      const items = [
        { title: 'Fix bug', details: 'Critical bug fix' },
        { title: 'Improve tests', details: 'Add more tests', priority: 'high', assignee: 'john' }
      ];

      const normalized = ResponseParser.normalizeActionItems(items, 'ai', 'openai');
      
      expect(normalized).toHaveLength(2);
      expect(normalized[0].priority).toBe('medium'); // default
      expect(normalized[0].assignee).toBe('team'); // default
      expect(normalized[1].priority).toBe('high'); // preserved
      expect(normalized[1].assignee).toBe('john'); // preserved
    });
  });

  describe('validateInsight', () => {
    it('should validate proper insight object', () => {
      const insight = { title: 'Test', details: 'Details' };
      const validated = ResponseParser.validateInsight(insight);
      
      expect(validated.title).toBe('Test');
      expect(validated.details).toBe('Details');
    });

    it('should handle string insight', () => {
      const validated = ResponseParser.validateInsight('This is a string insight');
      
      expect(validated.title).toBe('This is a string insight');
      expect(validated.details).toBe('This is a string insight');
    });

    it('should throw error for invalid insight', () => {
      expect(() => ResponseParser.validateInsight(null)).toThrow('Invalid insight: must be an object');
      expect(() => ResponseParser.validateInsight({})).toThrow('Invalid insight: must have either title or details');
    });

    it('should generate title from details if missing', () => {
      const insight = { details: 'This is the details without title' };
      const validated = ResponseParser.validateInsight(insight);
      
      expect(validated.title).toBe('This is the details without title');
    });

    it('should generate details from title if missing', () => {
      const insight = { title: 'This is the title' };
      const validated = ResponseParser.validateInsight(insight);
      
      expect(validated.details).toBe('This is the title');
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle empty JSON objects', () => {
      const result = ResponseParser.parseJsonResponse('{}', 'openai');
      
      expect(result.wentWell).toEqual([]);
      expect(result.didntGoWell).toEqual([]);
      expect(result.actionItems).toEqual([]);
    });

    it('should handle mixed content types in arrays', () => {
      const json = {
        wentWell: [
          'String insight',
          { title: 'Object insight', details: 'Details' },
          { details: 'Only details' }
        ]
      };

      const result = ResponseParser.parseJsonResponse(JSON.stringify(json), 'openai');
      expect(result.wentWell).toHaveLength(3);
    });

    it('should handle very long responses', () => {
      const longText = 'A'.repeat(10000);
      const result = ResponseParser.parseTextResponse(longText, 'openai');
      
      // Should not crash and should return some result
      expect(result).toBeDefined();
      expect(result.wentWell).toBeDefined();
    });

    it('should handle responses with special characters', () => {
      const specialText = `
      # What Went Well 🎉
      - Team used emojis! 😄
      - Code review with "quotes" and 'apostrophes'
      - URLs like https://example.com work
      
      # Issues ⚠️
      - Special chars: @#$%^&*()
      `;

      const result = ResponseParser.parseTextResponse(specialText, 'openai');
      // Should at least parse some content, even if categorization isn't perfect
      const totalInsights = result.wentWell.length + result.didntGoWell.length + result.actionItems.length;
      expect(totalInsights).toBeGreaterThan(0);
    });
  });
});