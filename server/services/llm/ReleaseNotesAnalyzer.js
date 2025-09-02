/**
 * ReleaseNotesAnalyzer - Specialized LLM analyzer for release notes generation
 * 
 * This class extends the base LLMAnalyzer to provide specialized functionality
 * for analyzing development data and generating user-facing release notes.
 * It focuses on identifying user-impacting changes and translating technical
 * details into customer-friendly language.
 */

import { LLMAnalyzer } from './LLMAnalyzer.js';
import { PromptBuilder } from './PromptBuilder.js';
import ResponseParser from './ResponseParser.js';

export class ReleaseNotesAnalyzer extends LLMAnalyzer {
  constructor(config = {}) {
    super(config);
    
    // Release notes specific configuration
    this.releaseNotesConfig = {
      // Categories for release notes
      categories: config.categories || ['newFeatures', 'improvements', 'fixes'],
      
      // Confidence thresholds for different types of analysis
      userImpactThreshold: config.userImpactThreshold || 0.7,
      categorizationThreshold: config.categorizationThreshold || 0.6,
      translationThreshold: config.translationThreshold || 0.8,
      
      // Language and tone settings
      tone: config.tone || 'professional-friendly',
      audienceLevel: config.audienceLevel || 'business-user',
      includeEmojis: config.includeEmojis !== false,
      
      // Analysis settings
      maxEntriesPerCategory: config.maxEntriesPerCategory || 10,
      prioritizeRecent: config.prioritizeRecent !== false,
      
      ...config
    };

    // Initialize release notes specific prompt builder
    this.releaseNotesPromptBuilder = new ReleaseNotesPromptBuilder({
      ...this.config,
      ...this.releaseNotesConfig
    });
  }

  /**
   * Analyze development data for release notes generation
   * @param {Object} developmentData - Combined data from GitHub, Linear, and Slack
   * @param {Object} context - Additional context for analysis
   * @param {Object} dateRange - Date range for the release notes
   * @param {ProgressTracker} progressTracker - Optional progress tracker
   * @returns {Promise<Object>} Release notes analysis results
   */
  async analyzeForReleaseNotes(developmentData, context = {}, progressTracker = null) {
    if (!this.config.enabled || !this.provider) {
      console.log('LLM analysis disabled for release notes, using rule-based fallback');
      return null;
    }

    try {
      console.log('Starting release notes LLM analysis...');
      const startTime = Date.now();

      if (progressTracker) {
        progressTracker.startStep(0, { 
          analysisType: 'release-notes',
          dataSize: JSON.stringify(developmentData).length
        });
      }

      // Step 1: Identify user-impacting changes
      const userImpactAnalysis = await this.identifyUserImpact(developmentData, context, progressTracker);
      
      if (progressTracker) {
        progressTracker.completeStep(0, {
          userFacingChanges: userImpactAnalysis.userFacingChanges?.length || 0
        });
        progressTracker.startStep(1);
      }

      // Step 2: Generate user-friendly descriptions
      const userFriendlyDescriptions = await this.generateUserFriendlyDescriptions(
        userImpactAnalysis.userFacingChanges, 
        context, 
        progressTracker
      );

      if (progressTracker) {
        progressTracker.completeStep(1, {
          descriptionsGenerated: userFriendlyDescriptions.length
        });
        progressTracker.startStep(2);
      }

      // Step 3: Categorize by user value
      const categorizedChanges = await this.categorizeByUserValue(
        userFriendlyDescriptions, 
        context, 
        progressTracker
      );

      if (progressTracker) {
        progressTracker.completeStep(2, {
          newFeatures: categorizedChanges.newFeatures?.length || 0,
          improvements: categorizedChanges.improvements?.length || 0,
          fixes: categorizedChanges.fixes?.length || 0
        });
      }

      const duration = Date.now() - startTime;
      console.log(`Release notes LLM analysis completed in ${duration}ms`);

      return {
        userImpactAnalysis,
        userFriendlyDescriptions,
        categorizedChanges,
        metadata: {
          provider: this.config.provider,
          model: this.provider.getModel(),
          duration,
          analysisType: 'release-notes',
          generatedAt: new Date().toISOString()
        }
      };

    } catch (error) {
      console.error('Release notes LLM analysis failed:', error.message);
      
      if (progressTracker) {
        progressTracker.fail(error);
      }
      
      throw new Error(`Release notes analysis failed: ${error.message}`);
    }
  }

  /**
   * Identify user-impacting changes from development data
   * @param {Object} developmentData - Development data to analyze
   * @param {Object} context - Analysis context
   * @param {ProgressTracker} progressTracker - Optional progress tracker
   * @returns {Promise<Object>} User impact analysis results
   */
  async identifyUserImpact(developmentData, context = {}, progressTracker = null) {
    try {
      console.log('Analyzing user impact of changes...');

      if (progressTracker) {
        progressTracker.updateStepProgress(0, 0.3, 'Generating user impact analysis prompt...');
      }

      // Generate specialized prompt for user impact identification
      const prompt = this.releaseNotesPromptBuilder.generateUserImpactPrompt(developmentData, context);

      if (progressTracker) {
        progressTracker.updateStepProgress(0, 0.6, 'Calling LLM for user impact analysis...');
      }

      // Call LLM with user impact analysis prompt
      const response = await this._callLLMWithRetry(prompt, context, progressTracker);

      if (progressTracker) {
        progressTracker.updateStepProgress(0, 0.9, 'Parsing user impact analysis response...');
      }

      // Parse response to extract user-facing changes
      const parsedResponse = this._parseUserImpactResponse(response);

      return {
        userFacingChanges: parsedResponse.userFacingChanges || [],
        internalChanges: parsedResponse.internalChanges || [],
        confidence: parsedResponse.confidence || 0.8,
        reasoning: parsedResponse.reasoning || 'LLM analysis of user impact'
      };

    } catch (error) {
      console.error('User impact analysis failed:', error.message);
      throw new Error(`User impact analysis failed: ${error.message}`);
    }
  }

  /**
   * Generate user-friendly descriptions for changes
   * @param {Array} changes - Array of user-facing changes
   * @param {Object} context - Analysis context
   * @param {ProgressTracker} progressTracker - Optional progress tracker
   * @returns {Promise<Array>} Changes with user-friendly descriptions
   */
  async generateUserFriendlyDescriptions(changes, context = {}, progressTracker = null) {
    try {
      console.log('Generating user-friendly descriptions...');

      if (!changes || changes.length === 0) {
        return [];
      }

      if (progressTracker) {
        progressTracker.updateStepProgress(1, 0.3, 'Generating user-friendly language prompt...');
      }

      // Generate prompt for user-friendly language translation
      const prompt = this.releaseNotesPromptBuilder.generateUserFriendlyPrompt(changes, context);

      if (progressTracker) {
        progressTracker.updateStepProgress(1, 0.6, 'Calling LLM for language translation...');
      }

      // Call LLM for language translation
      const response = await this._callLLMWithRetry(prompt, context, progressTracker);

      if (progressTracker) {
        progressTracker.updateStepProgress(1, 0.9, 'Parsing user-friendly descriptions...');
      }

      // Parse response to get user-friendly descriptions
      const parsedResponse = this._parseUserFriendlyResponse(response, changes);

      return parsedResponse.translatedChanges || changes;

    } catch (error) {
      console.error('User-friendly description generation failed:', error.message);
      // Return original changes if translation fails
      return changes;
    }
  }

  /**
   * Categorize changes by user value (New Features, Improvements, Fixes)
   * @param {Array} changes - Array of changes with user-friendly descriptions
   * @param {Object} context - Analysis context
   * @param {ProgressTracker} progressTracker - Optional progress tracker
   * @returns {Promise<Object>} Categorized changes
   */
  async categorizeByUserValue(changes, context = {}, progressTracker = null) {
    try {
      console.log('Categorizing changes by user value...');

      if (!changes || changes.length === 0) {
        return {
          newFeatures: [],
          improvements: [],
          fixes: []
        };
      }

      if (progressTracker) {
        progressTracker.updateStepProgress(2, 0.3, 'Generating categorization prompt...');
      }

      // Generate prompt for categorization
      const prompt = this.releaseNotesPromptBuilder.generateCategorizationPrompt(changes, context);

      if (progressTracker) {
        progressTracker.updateStepProgress(2, 0.6, 'Calling LLM for categorization...');
      }

      // Call LLM for categorization
      const response = await this._callLLMWithRetry(prompt, context, progressTracker);

      if (progressTracker) {
        progressTracker.updateStepProgress(2, 0.9, 'Parsing categorization results...');
      }

      // Parse response to get categorized changes
      const parsedResponse = this._parseCategorizationResponse(response, changes);

      return {
        newFeatures: parsedResponse.newFeatures || [],
        improvements: parsedResponse.improvements || [],
        fixes: parsedResponse.fixes || [],
        metadata: {
          totalChanges: changes.length,
          categorizedChanges: (parsedResponse.newFeatures?.length || 0) + 
                             (parsedResponse.improvements?.length || 0) + 
                             (parsedResponse.fixes?.length || 0),
          confidence: parsedResponse.confidence || 0.8
        }
      };

    } catch (error) {
      console.error('Categorization failed:', error.message);
      // Return basic categorization if LLM fails
      return this._fallbackCategorization(changes);
    }
  }

  /**
   * Call LLM with specialized retry logic for release notes
   * @private
   */
  async _callLLMWithRetry(prompt, context, progressTracker = null) {
    // Use the base class retry logic but with release notes specific error handling
    try {
      return await super._callLLMWithRetry(prompt, context, progressTracker);
    } catch (error) {
      // Add release notes specific error context
      throw new Error(`Release notes LLM call failed: ${error.message}`);
    }
  }

  /**
   * Parse user impact analysis response
   * @private
   */
  _parseUserImpactResponse(response) {
    try {
      // Try to parse as JSON first
      if (typeof response === 'string') {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            userFacingChanges: parsed.userFacingChanges || [],
            internalChanges: parsed.internalChanges || [],
            confidence: parsed.confidence || 0.8,
            reasoning: parsed.reasoning || 'LLM analysis'
          };
        }
      }

      // Fallback to text parsing
      return this._parseUserImpactFromText(response);

    } catch (error) {
      console.warn('Failed to parse user impact response:', error.message);
      return {
        userFacingChanges: [],
        internalChanges: [],
        confidence: 0.5,
        reasoning: 'Failed to parse LLM response'
      };
    }
  }

  /**
   * Parse user impact from text response
   * @private
   */
  _parseUserImpactFromText(response) {
    const userFacingChanges = [];
    const internalChanges = [];

    // Simple text parsing logic
    const lines = response.split('\n').filter(line => line.trim());
    
    let currentSection = null;
    
    for (const line of lines) {
      const trimmed = line.trim();
      
      if (trimmed.toLowerCase().includes('user-facing') || 
          trimmed.toLowerCase().includes('customer-facing')) {
        currentSection = 'user';
        continue;
      }
      
      if (trimmed.toLowerCase().includes('internal') || 
          trimmed.toLowerCase().includes('technical')) {
        currentSection = 'internal';
        continue;
      }
      
      // Extract changes from bullet points or numbered lists
      if (trimmed.match(/^[\*\-\+]\s/) || trimmed.match(/^\d+\.\s/)) {
        const change = {
          title: trimmed.replace(/^[\*\-\+]\s*|^\d+\.\s*/, ''),
          confidence: 0.7,
          source: 'llm-analysis'
        };
        
        if (currentSection === 'user') {
          userFacingChanges.push(change);
        } else if (currentSection === 'internal') {
          internalChanges.push(change);
        } else {
          // Default to user-facing if unclear
          userFacingChanges.push(change);
        }
      }
    }

    return {
      userFacingChanges,
      internalChanges,
      confidence: 0.7,
      reasoning: 'Parsed from LLM text response'
    };
  }

  /**
   * Parse user-friendly description response
   * @private
   */
  _parseUserFriendlyResponse(response, originalChanges) {
    try {
      // Try JSON parsing first
      if (typeof response === 'string') {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            translatedChanges: parsed.translatedChanges || parsed.changes || originalChanges,
            confidence: parsed.confidence || 0.8
          };
        }
      }

      // Fallback to mapping original changes with improved descriptions
      return {
        translatedChanges: originalChanges.map(change => ({
          ...change,
          userFriendlyTitle: change.title,
          userFriendlyDescription: change.description || change.title,
          translationConfidence: 0.6
        })),
        confidence: 0.6
      };

    } catch (error) {
      console.warn('Failed to parse user-friendly response:', error.message);
      return {
        translatedChanges: originalChanges,
        confidence: 0.5
      };
    }
  }

  /**
   * Parse categorization response
   * @private
   */
  _parseCategorizationResponse(response, originalChanges) {
    try {
      // Try JSON parsing first
      if (typeof response === 'string') {
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return {
            newFeatures: parsed.newFeatures || [],
            improvements: parsed.improvements || [],
            fixes: parsed.fixes || [],
            confidence: parsed.confidence || 0.8
          };
        }
      }

      // Fallback to text parsing
      return this._parseCategorizationFromText(response, originalChanges);

    } catch (error) {
      console.warn('Failed to parse categorization response:', error.message);
      return this._fallbackCategorization(originalChanges);
    }
  }

  /**
   * Parse categorization from text response
   * @private
   */
  _parseCategorizationFromText(response, originalChanges) {
    const categorized = {
      newFeatures: [],
      improvements: [],
      fixes: []
    };

    const lines = response.split('\n').filter(line => line.trim());
    let currentCategory = null;

    for (const line of lines) {
      const trimmed = line.trim().toLowerCase();
      
      // Identify category headers
      if (trimmed.includes('new feature') || trimmed.includes('feature')) {
        currentCategory = 'newFeatures';
        continue;
      }
      
      if (trimmed.includes('improvement') || trimmed.includes('enhancement')) {
        currentCategory = 'improvements';
        continue;
      }
      
      if (trimmed.includes('fix') || trimmed.includes('bug')) {
        currentCategory = 'fixes';
        continue;
      }
      
      // Extract items from bullet points
      if (trimmed.match(/^[\*\-\+]\s/) || trimmed.match(/^\d+\.\s/)) {
        const itemText = line.replace(/^[\*\-\+]\s*|^\d+\.\s*/, '').trim();
        
        // Try to match with original changes
        const matchedChange = originalChanges.find(change => 
          change.title.toLowerCase().includes(itemText.toLowerCase()) ||
          itemText.toLowerCase().includes(change.title.toLowerCase())
        );
        
        const change = matchedChange || {
          title: itemText,
          description: itemText,
          confidence: 0.6,
          source: 'llm-categorization'
        };
        
        if (currentCategory && categorized[currentCategory]) {
          categorized[currentCategory].push({
            ...change,
            category: currentCategory
          });
        }
      }
    }

    return {
      ...categorized,
      confidence: 0.7
    };
  }

  /**
   * Fallback categorization using rule-based logic
   * @private
   */
  _fallbackCategorization(changes) {
    const categorized = {
      newFeatures: [],
      improvements: [],
      fixes: []
    };

    for (const change of changes) {
      const title = (change.title || '').toLowerCase();
      const description = (change.description || '').toLowerCase();
      
      // Simple keyword-based categorization
      if (title.includes('fix') || title.includes('bug') || title.includes('issue')) {
        categorized.fixes.push({ ...change, category: 'fixes' });
      } else if (title.includes('add') || title.includes('new') || title.includes('feature')) {
        categorized.newFeatures.push({ ...change, category: 'newFeatures' });
      } else {
        categorized.improvements.push({ ...change, category: 'improvements' });
      }
    }

    return categorized;
  }

  /**
   * Get release notes analyzer status
   */
  getStatus() {
    const baseStatus = super.getStatus();
    return {
      ...baseStatus,
      releaseNotesConfig: this.releaseNotesConfig,
      capabilities: {
        userImpactAnalysis: true,
        userFriendlyTranslation: true,
        categorization: true,
        multiLanguageSupport: false // Future enhancement
      }
    };
  }
}

/**
 * ReleaseNotesPromptBuilder - Specialized prompt builder for release notes analysis
 */
class ReleaseNotesPromptBuilder extends PromptBuilder {
  constructor(config = {}) {
    super(config);
    this.releaseNotesConfig = config;
  }

  /**
   * Generate prompt for user impact identification
   */
  generateUserImpactPrompt(developmentData, context) {
    const systemPrompt = this._buildUserImpactSystemPrompt(context);
    const userPrompt = this._buildUserImpactUserPrompt(developmentData, context);
    
    return {
      system: systemPrompt,
      user: userPrompt,
      metadata: {
        promptType: 'user-impact-analysis',
        dataSize: JSON.stringify(developmentData).length
      }
    };
  }

  /**
   * Generate prompt for user-friendly language translation
   */
  generateUserFriendlyPrompt(changes, context) {
    const systemPrompt = this._buildUserFriendlySystemPrompt(context);
    const userPrompt = this._buildUserFriendlyUserPrompt(changes, context);
    
    return {
      system: systemPrompt,
      user: userPrompt,
      metadata: {
        promptType: 'user-friendly-translation',
        changesCount: changes.length
      }
    };
  }

  /**
   * Generate prompt for categorization
   */
  generateCategorizationPrompt(changes, context) {
    const systemPrompt = this._buildCategorizationSystemPrompt(context);
    const userPrompt = this._buildCategorizationUserPrompt(changes, context);
    
    return {
      system: systemPrompt,
      user: userPrompt,
      metadata: {
        promptType: 'categorization',
        changesCount: changes.length
      }
    };
  }

  /**
   * Build system prompt for user impact analysis
   * @private
   */
  _buildUserImpactSystemPrompt(context) {
    return `You are an expert product analyst specializing in identifying user-facing changes from development data. Your task is to analyze GitHub commits, Linear issues, and Slack messages to distinguish between changes that impact end users versus internal technical changes.

**Your Expertise:**
- Deep understanding of software development workflows and their user impact
- Ability to identify customer-facing features, improvements, and bug fixes
- Experience in filtering out internal refactoring, infrastructure, and developer tooling changes

**Analysis Guidelines:**

1. **User-Facing Changes** (INCLUDE these):
   - New features that users can see or interact with
   - UI/UX improvements and changes
   - Performance improvements that users will notice
   - Bug fixes that affect user experience
   - API changes that impact external integrations
   - Security improvements that affect user data or access
   - Changes to user workflows or processes

2. **Internal Changes** (EXCLUDE these):
   - Code refactoring without user-visible changes
   - Internal infrastructure updates
   - Developer tooling and build process changes
   - Internal testing and CI/CD improvements
   - Code cleanup and technical debt reduction
   - Internal documentation updates
   - Database schema changes without user impact

**Context Information:**
- Analysis Period: ${context.dateRange?.start} to ${context.dateRange?.end}
- Team Size: ${context.teamSize || 'Unknown'}
- Product Type: ${context.productType || 'Software application'}

**Output Format:**
Provide your analysis as a JSON object:
{
  "userFacingChanges": [
    {
      "title": "Clear description of the user-facing change",
      "description": "Detailed explanation of what changed and why it matters to users",
      "impact": "high|medium|low",
      "category": "feature|improvement|fix",
      "confidence": 0.9,
      "reasoning": "Explanation of why this is user-facing"
    }
  ],
  "internalChanges": [
    {
      "title": "Description of internal change",
      "reasoning": "Why this is internal-only"
    }
  ],
  "confidence": 0.85,
  "reasoning": "Overall analysis approach and confidence factors"
}`;
  }

  /**
   * Build user prompt for user impact analysis
   * @private
   */
  _buildUserImpactUserPrompt(developmentData, context) {
    const dataString = JSON.stringify(developmentData, null, 2);
    
    return `Please analyze the following development data to identify user-facing changes versus internal technical changes:

**Development Data:**
${dataString}

**Analysis Instructions:**
1. Examine each commit, issue, and message for user impact
2. Consider the context and description to determine if users would notice the change
3. Focus on changes that affect user experience, functionality, or workflows
4. Exclude purely technical or internal improvements
5. Provide confidence scores based on the clarity of user impact
6. Include reasoning for your categorization decisions

Please provide your analysis in the specified JSON format.`;
  }

  /**
   * Build system prompt for user-friendly translation
   * @private
   */
  _buildUserFriendlySystemPrompt(context) {
    const tone = this.releaseNotesConfig.tone || 'professional-friendly';
    const audience = this.releaseNotesConfig.audienceLevel || 'business-user';
    
    return `You are an expert technical writer specializing in translating technical changes into user-friendly language for ${audience} audiences. Your task is to rewrite technical descriptions into clear, accessible language that explains the value and impact to end users.

**Writing Guidelines:**

1. **Tone and Style:**
   - Use a ${tone} tone throughout
   - Write for ${audience} level understanding
   - Avoid technical jargon and acronyms
   - Use active voice and present tense
   - Keep descriptions concise but informative

2. **Content Focus:**
   - Emphasize user benefits and value
   - Explain "what" changed and "why it matters"
   - Use concrete examples when possible
   - Focus on outcomes rather than implementation details
   - Highlight improvements to user experience

3. **Language Transformation:**
   - "Fixed bug" → "Resolved issue that improves reliability"
   - "Optimized performance" → "Made the system faster and more responsive"
   - "Refactored code" → "Improved system stability and maintainability"
   - "Added API endpoint" → "Enhanced integration capabilities"
   - "Updated dependencies" → "Improved security and performance"

4. **Structure:**
   - Start with the user benefit
   - Provide brief context if needed
   - Keep each description to 1-2 sentences
   - Use parallel structure across similar changes

**Output Format:**
Provide translations as a JSON object:
{
  "translatedChanges": [
    {
      "originalTitle": "Technical title from source",
      "userFriendlyTitle": "Clear, benefit-focused title",
      "originalDescription": "Technical description",
      "userFriendlyDescription": "User-focused description explaining value and impact",
      "userValue": "Why this matters to users",
      "translationConfidence": 0.9
    }
  ],
  "confidence": 0.85
}`;
  }

  /**
   * Build user prompt for user-friendly translation
   * @private
   */
  _buildUserFriendlyUserPrompt(changes, context) {
    const changesString = JSON.stringify(changes, null, 2);
    
    return `Please translate the following technical changes into user-friendly language:

**Changes to Translate:**
${changesString}

**Translation Instructions:**
1. Rewrite titles to focus on user benefits rather than technical details
2. Transform descriptions to explain value and impact to end users
3. Remove or explain technical jargon
4. Emphasize improvements to user experience
5. Keep language accessible to non-technical stakeholders
6. Maintain accuracy while improving clarity

Please provide your translations in the specified JSON format.`;
  }

  /**
   * Build system prompt for categorization
   * @private
   */
  _buildCategorizationSystemPrompt(context) {
    return `You are an expert product manager specializing in organizing product changes into user-focused categories for release notes. Your task is to categorize changes into New Features, Improvements, and Bug Fixes based on their impact and value to users.

**Category Definitions:**

1. **New Features** - Completely new functionality that users can access:
   - Brand new capabilities or tools
   - New user interfaces or workflows
   - New integrations or connections
   - New options or settings that expand functionality
   - Features that enable users to do something they couldn't do before

2. **Improvements** - Enhancements to existing functionality:
   - Performance optimizations that users will notice
   - User experience improvements
   - Enhanced existing features with new capabilities
   - Better workflows or processes
   - Improved reliability or stability
   - Enhanced security or privacy features

3. **Bug Fixes** - Resolution of issues that were causing problems:
   - Fixes for broken functionality
   - Resolution of error conditions
   - Corrections to incorrect behavior
   - Fixes for crashes or instability
   - Resolution of data or display issues

**Categorization Guidelines:**
- Consider the primary user impact when categorizing
- If a change spans multiple categories, choose the most significant impact
- Prioritize user-visible changes over technical improvements
- Consider the user's perspective: "What does this mean for me?"
- When in doubt, categorize as "Improvements"

**Output Format:**
Provide categorization as a JSON object:
{
  "newFeatures": [
    {
      "title": "User-friendly title",
      "description": "User-focused description",
      "userValue": "Why this new feature matters",
      "confidence": 0.9,
      "reasoning": "Why this is categorized as a new feature"
    }
  ],
  "improvements": [
    {
      "title": "User-friendly title", 
      "description": "User-focused description",
      "userValue": "How this improves the user experience",
      "confidence": 0.85,
      "reasoning": "Why this is categorized as an improvement"
    }
  ],
  "fixes": [
    {
      "title": "User-friendly title",
      "description": "User-focused description", 
      "userValue": "How this fix improves reliability",
      "confidence": 0.9,
      "reasoning": "Why this is categorized as a bug fix"
    }
  ],
  "confidence": 0.87
}`;
  }

  /**
   * Build user prompt for categorization
   * @private
   */
  _buildCategorizationUserPrompt(changes, context) {
    const changesString = JSON.stringify(changes, null, 2);
    
    return `Please categorize the following changes into New Features, Improvements, and Bug Fixes:

**Changes to Categorize:**
${changesString}

**Categorization Instructions:**
1. Analyze each change for its primary user impact
2. Consider what users will experience as a result of each change
3. Focus on the most significant benefit or improvement
4. Provide reasoning for your categorization decisions
5. Include confidence scores based on clarity of categorization
6. Ensure descriptions remain user-focused and valuable

Please provide your categorization in the specified JSON format.`;
  }
}