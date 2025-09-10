import { ModelTokenLimits } from "./ModelTokenLimits.js";

/**
 * PromptBuilder Class
 * Generates optimized LLM prompts from team data with context-aware templates
 * and dynamic token counting based on model capabilities
 */
export class PromptBuilder {
  constructor(config = {}) {
    this.config = {
      systemPromptTokens: config.systemPromptTokens || 800,
      reserveTokens: config.reserveTokens || 200,
      ...config,
    };

    // Initialize ModelTokenLimits for dynamic token management
    this.tokenLimits = new ModelTokenLimits();

    // Default model configuration (can be overridden per request)
    this.defaultProvider = config.provider || "openai";
    this.defaultModel = config.model || "gpt-4o";

    // Calculate initial token limits using default model
    this._updateTokenLimits(this.defaultProvider, this.defaultModel);
  }

  /**
   * Updates token limits based on the specified model
   * @private
   */
  _updateTokenLimits(provider, model) {
    const limits = this.tokenLimits.getModelLimits(provider, model);
    const split = this.tokenLimits.calculateOptimalSplit(
      provider,
      model,
      this.config.systemPromptTokens
    );

    this.currentLimits = limits;
    this.maxTokens = limits.total;
    // Apply a safety margin so real tokenization overhead never exceeds limits
    // Use higher default margin for better data utilization
    const targetMargin = this.config.safetyMargin ?? 0.92;
    const safetyMargin = Math.max(0.85, Math.min(0.99, targetMargin));
    this.maxDataTokens = Math.floor(split.userData * safetyMargin);
    this.outputBuffer = split.outputBuffer;

    console.log(
      `PromptBuilder configured for ${provider}/${model}: ${this.maxDataTokens.toLocaleString()} tokens available for data (safety ${Math.round(
        safetyMargin * 100
      )}%, inputCap ${this.currentLimits.input})`
    );
  }

  /**
   * Generates optimized prompt for team retrospective analysis
   * @param {Object} teamData - Combined data from GitHub, Linear, and Slack
   * @param {Object} context - Additional context like date range, team size, model info
   * @param {Object} options - Prompt generation options
   * @returns {Object} Optimized prompt with system and user messages
   */
  generateRetroPrompt(teamData, context = {}) {
    const { dateRange, teamSize, repositories, channels, model, provider } =
      context;

    // Decide chosen provider/model up-front so system prompt uses correct rules (e.g., GPT-5 strict JSON)
    const chosenProvider = provider || this.defaultProvider;
    const chosenModel = model || this.defaultModel;

    // 1) Build system prompt first to measure its actual token size (using chosenModel)
    const preliminarySystemPrompt = this._buildSystemPrompt(
      dateRange,
      teamSize,
      repositories,
      channels,
      chosenModel,
      context
    );
    const actualSystemTokens = this.estimateTokens(preliminarySystemPrompt);

    // 2) Update token limits using real system prompt token count
    //    so the available data budget is accurate
    // Use actual system prompt size for accurate budgeting
    this.config.systemPromptTokens = actualSystemTokens;
    this._updateTokenLimits(chosenProvider, chosenModel);

    // 3) Optimize data for the now-accurate data token budget
    const optimizedData = this.optimizeDataForTokens(teamData, context);

    // 4) Reuse the same system prompt (content identical) and build user prompt
    const systemPrompt = preliminarySystemPrompt;
    const userPrompt = this._buildUserPrompt(
      optimizedData,
      chosenModel,
      context
    );

    const prompt = {
      system: systemPrompt,
      user: userPrompt,
      metadata: {
        provider: chosenProvider,
        model: chosenModel,
        tokenLimits: this.currentLimits,
        maxDataTokens: this.maxDataTokens,
        estimatedTokens:
          this.estimateTokens(systemPrompt) + this.estimateTokens(userPrompt),
        optimization: this._getOptimizationInfo(teamData, optimizedData),
      },
    };

    return prompt;
  }

  /**
   * Infers the provider from model name
   * @private
   */
  _inferProvider(model) {
    const modelLower = model.toLowerCase();

    if (modelLower.includes("gpt") || modelLower.includes("openai")) {
      return "openai";
    } else if (
      modelLower.includes("claude") ||
      modelLower.includes("anthropic")
    ) {
      return "anthropic";
    } else if (modelLower.includes("llama") || modelLower.includes("mistral")) {
      return "local";
    }

    // Default to openai if we can't infer
    return "openai";
  }

  /**
   * Gets optimization information for metadata
   * @private
   */
  _getOptimizationInfo(originalData, optimizedData) {
    const originalSize = this.estimateTokens(JSON.stringify(originalData));
    const optimizedSize = this.estimateTokens(JSON.stringify(optimizedData));

    return {
      originalTokens: originalSize,
      optimizedTokens: optimizedSize,
      reductionRatio:
        originalSize > 0 ? (originalSize - optimizedSize) / originalSize : 0,
      withinLimits: optimizedSize <= this.maxDataTokens,
      availableTokens: this.maxDataTokens,
      utilization: optimizedSize / this.maxDataTokens,
    };
  }

  /**
   * Infers provider from model name
   * @private
   */
  _inferProvider(model) {
    const modelLower = model.toLowerCase();
    if (modelLower.includes("gpt") || modelLower.includes("openai")) {
      return "openai";
    } else if (
      modelLower.includes("claude") ||
      modelLower.includes("anthropic")
    ) {
      return "anthropic";
    } else if (modelLower.includes("llama") || modelLower.includes("mistral")) {
      return "local";
    }
    return this.defaultProvider;
  }

  /**
   * Gets optimization information for metadata
   * @private
   */
  _getOptimizationInfo(originalData, optimizedData) {
    const originalSize = this.estimateTokens(JSON.stringify(originalData));
    const optimizedSize = this.estimateTokens(JSON.stringify(optimizedData));

    return {
      originalTokens: originalSize,
      optimizedTokens: optimizedSize,
      reductionRatio:
        originalSize > 0 ? (originalSize - optimizedSize) / originalSize : 0,
      withinLimits: optimizedSize <= this.maxDataTokens,
      availableTokens: this.maxDataTokens,
      utilization: optimizedSize / this.maxDataTokens,
    };
  }

  /**
   * Selects appropriate prompt template based on available data and analysis type
   * @private
   */
  _selectTemplate(teamData, options) {
    // Check for temporal analysis types
    if (options.analysisType === "temporal_aggregation") {
      return this._getTemporalAggregationTemplate();
    }

    if (options.temporalChunk) {
      return this._getTemporalChunkTemplate();
    }

    // Standard data-based template selection
    const hasGitHub =
      teamData.github &&
      (teamData.github.commits?.length > 0 ||
        teamData.github.pullRequests?.length > 0);
    const hasLinear = teamData.linear && teamData.linear.issues?.length > 0;
    const hasSlack = teamData.slack && teamData.slack.messages?.length > 0;

    // Select template based on data availability
    if (hasGitHub && hasLinear && hasSlack) {
      return this._getFullAnalysisTemplate();
    } else if (hasGitHub && hasLinear) {
      return this._getDevFocusedTemplate();
    } else if (hasGitHub && hasSlack) {
      return this._getCodeCommunicationTemplate();
    } else if (hasLinear && hasSlack) {
      return this._getProjectCommunicationTemplate();
    } else if (hasGitHub) {
      return this._getCodeOnlyTemplate();
    } else if (hasLinear) {
      return this._getProjectOnlyTemplate();
    } else if (hasSlack) {
      return this._getCommunicationOnlyTemplate();
    } else {
      return this._getMinimalTemplate();
    }
  }

  /**
   * Template for full analysis with all data sources
   * @private
   */
  _getFullAnalysisTemplate() {
    return {
      name: "full-analysis",
      systemPrompt: `You are an expert team retrospective analyst with access to comprehensive team data. Analyze code activity, project management, and team communication to generate actionable insights.

Focus Areas:
1. **Code Quality & Development**: Analyze commit patterns, PR reviews, code changes, and development velocity
2. **Project Management**: Examine issue completion rates, sprint performance, and project tracking effectiveness  
3. **Team Communication**: Assess collaboration quality, communication patterns, and team dynamics
4. **Cross-functional Insights**: Identify connections between code changes, project progress, and team discussions

Analysis Guidelines:
- Look for patterns across all data sources that indicate team health and productivity
- Identify correlations between communication patterns and development outcomes
- Assess how project management practices impact code quality and team satisfaction
- Provide specific examples from the data to support your insights
- Focus on actionable recommendations that address root causes, not just symptoms`,

      dataInstructions: `Analyze the following team data comprehensively:
- GitHub: commits, pull requests, reviews, and repository activity
- Linear: issues, project progress, completion patterns, and workflow efficiency
- Slack: team communication, collaboration patterns, and discussion topics`,
    };
  }

  /**
   * Template for temporal chunk analysis
   * @private
   */
  _getTemporalChunkTemplate() {
    return {
      name: "temporal-chunk",
      systemPrompt: `You are an expert team analyst focusing on a specific time period. Analyze the chronological sequence of events to understand team dynamics and productivity patterns during this timeframe.

Focus Areas:
1. **Temporal Patterns**: How activities unfold over time and their sequence
2. **Cross-Platform Correlations**: How events on different platforms relate to each other temporally
3. **Team Rhythm**: Working patterns, collaboration timing, and activity distribution
4. **Cause and Effect**: How earlier events influence later activities

Analysis Guidelines:
- Pay attention to the chronological order of events and their relationships
- Look for patterns in timing (working hours, response times, activity clusters)
- Identify how activities on one platform trigger or correlate with activities on others
- Consider the context of this time period within the larger analysis timeframe
- Focus on insights that are specific to this temporal window`,

      dataInstructions: `Analyze this temporal chunk of team activity:
- Time Range: Events organized chronologically within a specific time window
- Cross-Platform Events: Activities from GitHub, Linear, and Slack in temporal sequence
- Activity Patterns: Working hours, collaboration timing, and event correlations
- Context: This is one time slice of a larger retrospective analysis`,
    };
  }

  /**
   * Template for temporal aggregation analysis
   * @private
   */
  _getTemporalAggregationTemplate() {
    return {
      name: "temporal-aggregation",
      systemPrompt: `You are an expert team retrospective analyst synthesizing insights from multiple temporal analysis chunks. Your goal is to identify overarching patterns, trends, and insights that emerge from the chronological analysis of team data.

Focus Areas:
1. **Temporal Trends**: How team patterns evolved over the analysis period
2. **Recurring Patterns**: Consistent behaviors and rhythms across time periods
3. **Inflection Points**: Moments where team dynamics or productivity changed significantly
4. **Cross-Temporal Insights**: Insights that only become apparent when viewing the full timeline

Analysis Guidelines:
- Synthesize insights from individual time periods into broader patterns
- Identify trends in team productivity, collaboration, and communication over time
- Look for correlations between different time periods and their outcomes
- Focus on actionable insights that address systemic patterns rather than isolated incidents
- Provide recommendations based on the temporal evolution of team dynamics`,

      dataInstructions: `Analyze the aggregated temporal insights:
- Chunk Summaries: Individual insights from chronological time periods
- Activity Trends: How different types of activities changed over time
- Pattern Analysis: Recurring behaviors and correlations across time periods
- Cross-Chunk Correlations: Relationships and influences between different time periods`,
    };
  }

  /**
   * Template for development-focused analysis (GitHub + Linear)
   * @private
   */
  _getDevFocusedTemplate() {
    return {
      name: "dev-focused",
      systemPrompt: `You are an expert development team analyst. Focus on code development practices and project management effectiveness.

Focus Areas:
1. **Development Velocity**: Analyze commit frequency, PR turnaround times, and code review effectiveness
2. **Code Quality**: Examine PR feedback, refactoring patterns, and technical debt indicators
3. **Project Delivery**: Assess issue completion rates, sprint performance, and requirement clarity
4. **Development Process**: Identify bottlenecks in the development workflow and areas for improvement

Analysis Guidelines:
- Correlate code activity with project progress and issue resolution
- Identify patterns in development practices that impact delivery speed and quality
- Look for signs of technical debt, process inefficiencies, or resource constraints
- Provide specific recommendations for improving development workflows`,

      dataInstructions: `Analyze the development and project data:
- GitHub: development activity, code reviews, and repository changes
- Linear: project progress, issue tracking, and delivery metrics`,
    };
  }

  /**
   * Template for code and communication analysis (GitHub + Slack)
   * @private
   */
  _getCodeCommunicationTemplate() {
    return {
      name: "code-communication",
      systemPrompt: `You are an expert analyst focusing on development practices and team communication dynamics.

Focus Areas:
1. **Development Communication**: How well the team communicates about code changes and technical decisions
2. **Knowledge Sharing**: Effectiveness of technical discussions and code review processes
3. **Collaboration Quality**: Team coordination on development tasks and problem-solving
4. **Technical Culture**: Team attitudes toward code quality, learning, and improvement

Analysis Guidelines:
- Correlate communication patterns with development activity and code quality
- Identify how team discussions influence development decisions and outcomes
- Look for signs of effective knowledge sharing or communication gaps
- Assess team collaboration on technical challenges and solutions`,

      dataInstructions: `Analyze the development and communication data:
- GitHub: code changes, development activity, and technical progress
- Slack: team discussions, technical communication, and collaboration patterns`,
    };
  }

  /**
   * Template for project and communication analysis (Linear + Slack)
   * @private
   */
  _getProjectCommunicationTemplate() {
    return {
      name: "project-communication",
      systemPrompt: `You are an expert analyst focusing on project management effectiveness and team communication.

Focus Areas:
1. **Project Communication**: How well the team communicates about project progress and priorities
2. **Requirement Clarity**: Effectiveness of project planning and requirement communication
3. **Team Coordination**: Collaboration on project tasks and milestone achievement
4. **Process Effectiveness**: How communication patterns impact project delivery and team satisfaction

Analysis Guidelines:
- Correlate communication patterns with project progress and issue resolution
- Identify how team discussions influence project decisions and outcomes
- Look for signs of effective project coordination or communication bottlenecks
- Assess team alignment on priorities, goals, and project direction`,

      dataInstructions: `Analyze the project management and communication data:
- Linear: project progress, issue tracking, and delivery patterns
- Slack: team discussions, project communication, and coordination patterns`,
    };
  }

  /**
   * Template for code-only analysis
   * @private
   */
  _getCodeOnlyTemplate() {
    return {
      name: "code-only",
      systemPrompt: `You are an expert code analysis specialist. Focus exclusively on development practices and code quality indicators.

Focus Areas:
1. **Development Patterns**: Commit frequency, timing, and consistency
2. **Code Review Quality**: PR feedback, review thoroughness, and collaboration
3. **Technical Practices**: Code organization, refactoring patterns, and technical decisions
4. **Development Velocity**: Productivity indicators and potential bottlenecks

Analysis Guidelines:
- Focus on what the code activity reveals about team practices and code quality
- Identify patterns in development workflows and collaboration effectiveness
- Look for signs of technical debt, process issues, or areas for improvement
- Provide actionable recommendations based solely on development activity`,

      dataInstructions: `Analyze the development activity data:
- GitHub: commits, pull requests, code reviews, and repository changes`,
    };
  }

  /**
   * Template for project-only analysis
   * @private
   */
  _getProjectOnlyTemplate() {
    return {
      name: "project-only",
      systemPrompt: `You are an expert project management analyst. Focus on project delivery effectiveness and workflow efficiency.

Focus Areas:
1. **Delivery Performance**: Issue completion rates, cycle times, and throughput
2. **Project Planning**: Requirement clarity, estimation accuracy, and scope management
3. **Workflow Efficiency**: Process bottlenecks, handoffs, and resource utilization
4. **Team Capacity**: Workload distribution and capacity planning effectiveness

Analysis Guidelines:
- Focus on project management effectiveness and delivery patterns
- Identify workflow inefficiencies and process improvement opportunities
- Look for patterns in issue types, completion times, and project progress
- Provide recommendations for improving project delivery and team productivity`,

      dataInstructions: `Analyze the project management data:
- Linear: issues, project progress, completion patterns, and workflow metrics`,
    };
  }

  /**
   * Template for communication-only analysis
   * @private
   */
  _getCommunicationOnlyTemplate() {
    return {
      name: "communication-only",
      systemPrompt: `You are an expert team communication analyst. Focus on team dynamics and collaboration effectiveness.

Focus Areas:
1. **Communication Patterns**: Frequency, timing, and participation in team discussions
2. **Collaboration Quality**: How well the team works together and shares information
3. **Team Dynamics**: Leadership, decision-making, and conflict resolution patterns
4. **Knowledge Sharing**: Effectiveness of information exchange and learning

Analysis Guidelines:
- Focus on what communication patterns reveal about team health and effectiveness
- Identify collaboration strengths and areas where communication could improve
- Look for signs of good team dynamics or potential communication issues
- Provide recommendations for enhancing team communication and collaboration`,

      dataInstructions: `Analyze the team communication data:
- Slack: team discussions, communication patterns, and collaboration indicators`,
    };
  }

  /**
   * Template for minimal data scenarios
   * @private
   */
  _getMinimalTemplate() {
    return {
      name: "minimal",
      systemPrompt: `You are a team retrospective analyst working with limited data. Provide the best possible insights based on available information.

Focus Areas:
1. **Available Data Analysis**: Extract maximum value from the provided data
2. **General Recommendations**: Provide broadly applicable team improvement suggestions
3. **Data Collection**: Suggest additional data sources that could improve future retrospectives
4. **Process Improvement**: Recommend practices that could enhance team effectiveness

Analysis Guidelines:
- Work with whatever data is available to provide useful insights
- Be transparent about limitations due to limited data
- Focus on general best practices and common team improvement areas
- Suggest ways to gather more comprehensive data for future retrospectives`,

      dataInstructions: `Analyze the available team data and provide insights based on what information is present.`,
    };
  }

  /**
   * Builds the system prompt with context and options
   * @private
   */
  _buildSystemPrompt(
    dateRange,
    teamSize,
    repositories,
    channels,
    model,
    context = {}
  ) {
    const isGPT5 = model && model.startsWith("gpt-5");
    const isGemini = model && model.startsWith("gemini");

    // Build context information
    let contextInfo = `
Context Information:
- Analysis Period: ${
      dateRange?.start && dateRange?.end
        ? `${dateRange.start} to ${dateRange.end}`
        : "Not specified"
    }
- Team Size: ${teamSize || "Unknown"}
- Repositories: ${repositories?.join(", ") || "Not specified"}
- Communication Channels: ${channels?.join(", ") || "Not specified"}`;

    // Add temporal context if available
    if (context.temporalChunk) {
      contextInfo += `
- Temporal Chunk: ${context.temporalChunk.timeRange}
- Events in Period: ${context.temporalChunk.eventCount}
- Activity Patterns: ${JSON.stringify(context.temporalChunk.patterns)}`;
    }

    if (context.analysisType === "temporal_aggregation") {
      contextInfo += `
- Analysis Type: Temporal Aggregation
- Total Chunks Analyzed: ${context.totalChunks}
- Temporal Processing: Events organized chronologically and analyzed in time-based segments`;
    }

    const basePrompt = `You are an expert software engineering team retrospective analyst with deep expertise in team dynamics, software development processes, and organizational psychology.

Your task is to analyze team data from multiple sources (GitHub commits/PRs, Linear issues, Slack messages) and generate actionable insights for a team retrospective meeting.

${contextInfo}

Analysis Guidelines:
1. **Deep Pattern Analysis**: Look for meaningful patterns across time, team members, and data sources. Don't just count activities - understand what they reveal about team dynamics and effectiveness.

2. **Cross-Source Correlation**: Actively connect insights between GitHub activity, Linear issues, and Slack communications. For example, how do Slack discussions correlate with code changes or issue resolution?

3. **Temporal Awareness**: ${
      context.temporalChunk
        ? "Focus on the chronological sequence of events within this specific time period and how they relate to each other."
        : context.analysisType === "temporal_aggregation"
        ? "Synthesize patterns and trends that emerge across multiple time periods."
        : "Consider the timing and sequence of activities to understand team rhythms and workflows."
    }

4. **Specific Evidence**: Every insight must be supported by concrete examples from the data. Quote commit messages, reference specific issues, mention actual Slack conversations.

5. **Quantitative Context**: Include numbers, timeframes, and measurable patterns. "3 critical bugs resolved within 2 hours" is better than "quick bug fixes."

6. **Root Cause Analysis**: Don't just identify what happened - analyze why it happened and what underlying factors contributed to successes or challenges.

7. **Actionable Depth**: Recommendations should be specific enough that the team can implement them immediately. Include who, what, when, and how.

8. **Team-Level Focus**: Analyze team patterns and collective behaviors rather than individual performance. Look for systemic strengths and improvement opportunities.

Writing Style:
- Use a Paul Graham–like essay style: clear, direct, conversational.
- Prefer short sentences, simple words, and concrete examples.
- Avoid jargon, hedging, and compressed phrasing; favor clarity over density.`;

    const outputFormat = `
Output Format:
Provide your analysis as a JSON object with the following structure:
{
  "wentWell": [
    {
      "title": "Clear, plain-language summary (4-8 words, active voice)",
      "details": "Exactly two short sentences with specific examples, data points, and context. State what happened and why it was positive, with concrete evidence.",
      "source": "ai",
      "confidence": 0.85,
      "category": "technical|process|team-dynamics|communication",
      "reasoning": "Brief explanation of the analysis process and evidence used."
    }
  ],
  "didntGoWell": [
    {
      "title": "Clear, plain-language issue summary (4-8 words, active voice)",
      "details": "Exactly two short sentences with specific examples and context. State what went wrong and the likely root cause with concrete evidence.",
      "source": "ai",
      "confidence": 0.75,
      "category": "technical|process|team-dynamics|communication",
      "reasoning": "Brief explanation of how this issue was identified and why it matters."
    }
  ],
  "actionItems": [
    {
      "title": "Clear, actionable recommendation (4-8 words)",
      "details": "Exactly two short sentences stating what to do, the owners, and the expected outcome.",
      "source": "ai",
      "priority": "high|medium|low",
      "category": "technical|process|team-dynamics|communication",
      "reasoning": "Brief explanation of why this action helps."
    }
  ]
}

Quality Requirements for Insights:
- Each insight must be backed by specific data points or patterns from the provided team data
- Include concrete examples (commit messages, issue titles, Slack discussions, etc.)
- Provide quantitative context where possible (number of commits, time patterns, frequency, etc.)
- Connect insights across data sources (e.g., how Slack discussions relate to GitHub activity)
- Focus on actionable patterns that the team can learn from or improve upon
- Avoid generic advice - make insights specific to this team's actual behavior and data
- Generate the most impactful and actionable insights based on significant patterns in the data
- When supported by the data, include at least 10 items in "wentWell", 10 in "didntGoWell", and 3 in "actionItems". If the data does not support that many high-quality items, include as many as are well-supported without fabrication.
- Prioritize insights that will drive meaningful team discussions and concrete improvements
- Each insight should be substantial enough to warrant discussion in a retrospective meeting
- No artificial limits on number of insights, but emphasize relevance, specificity, and actionability over volume`;

    if (isGPT5 || isGemini) {
      // GPT-5/Gemini optimized prompt with comprehensive output format
      const comprehensiveOutputFormat = `
Output Format:
Provide your analysis as a JSON object with the following structure:
{
  "wentWell": [
    {
      "title": "Clear, plain-language summary (4-8 words, active voice)",
      "details": "1-2 short sentences with specific examples and metrics. Include what happened and why it was positive.",
      "source": "ai",
      "confidence": 0.85,
      "category": "technical|process|team-dynamics|communication",
      "reasoning": "Brief explanation of analysis approach and evidence."
    }
  ],
  "didntGoWell": [
    {
      "title": "Clear, plain-language issue summary (4-8 words, active voice)",
      "details": "1-2 short sentences with examples and context. Include what went wrong and likely root cause.",
      "source": "ai", 
      "confidence": 0.75,
      "category": "technical|process|team-dynamics|communication",
      "reasoning": "Brief explanation of identification and significance."
    }
  ],
  "actionItems": [
    {
      "title": "Clear, actionable recommendation (4-8 words)",
      "details": "1-2 short sentences with what to do, owners, and expected outcome.",
      "source": "ai",
      "priority": "high|medium|low", 
      "category": "technical|process|team-dynamics|communication",
      "reasoning": "Brief explanation of why this helps."
    }
  ]
}`;

      const comprehensiveRules = `\n\nOutput Requirements:\n- Return ONLY valid JSON. No markdown, no prose, no code fences.\n- Focus on the most impactful insights that will drive meaningful team discussions and improvements\n- Prioritize insights with strong evidence and clear actionability over volume\n- Each insight must be backed by specific data points from the provided team data\n- Include concrete examples (commit messages, issue titles, Slack discussions, etc.)\n- Provide quantitative context where possible (numbers, timeframes, frequencies)\n- Focus on actionable patterns that reveal team dynamics and productivity insights\n- Make insights specific to this team's actual behavior and data patterns\n- Use a Paul Graham–like essay style: clear, direct, conversational; short sentences; simple words; concrete examples; minimal jargon.\n- When supported by the data, include at least 10 items in \"wentWell\" and 10 in \"didntGoWell\".\n- Provide exactly 4 high-quality \"actionItems\".\n- Prioritize quality and depth over quantity, but don't artificially limit the number of insights`;

      return `${basePrompt}

Reasoning Approach:
Before generating insights, think through:
1. What patterns emerge across different data sources?
2. How do technical metrics correlate with team communication?
3. What underlying factors might explain observed trends?
4. Which insights would be most valuable for the team's growth?
5. What specific evidence supports each insight?
6. How can recommendations be made actionable and measurable?

${comprehensiveOutputFormat}${comprehensiveRules}`;
    } else {
      return `${basePrompt}${outputFormat}`;
    }
  }

  /**
   * Builds the user prompt with optimized data
   * @private
   */
  _buildUserPrompt(teamData, model, context = {}) {
    const dataString = JSON.stringify(teamData, null, 2);

    // Build context-specific instructions
    let analysisInstructions = "";

    if (context.temporalChunk) {
      analysisInstructions = `
Temporal Chunk Analysis Instructions:
1. **Focus on chronological sequence** - analyze how events unfold over time within this specific period
2. **Identify temporal patterns** - look for timing relationships, working hours patterns, and activity clusters
3. **Cross-platform correlations** - how do activities on different platforms relate temporally?
4. **Generate focused, high-impact insights** - identify the most significant patterns specific to this time period that warrant team attention
5. **Consider context** - this is one segment of a larger temporal analysis`;
    } else if (context.analysisType === "temporal_aggregation") {
      analysisInstructions = `
Temporal Aggregation Analysis Instructions:
1. **Synthesize temporal insights** - combine patterns from multiple time periods into overarching insights
2. **Identify trends and evolution** - how did team patterns change over the analysis period?
3. **Find recurring patterns** - what behaviors and rhythms are consistent across time periods?
4. **Generate the most impactful insights** - focus on the most significant temporal patterns that drive actionable improvements
5. **Focus on actionable trends** - recommendations should address systemic patterns over time`;
    } else {
      analysisInstructions = `
Analysis Instructions:
1. **Thoroughly examine all provided data** - don't miss important patterns in any section
2. **Generate the most valuable insights** covering significant patterns - focus on quality and actionability
3. **Use specific examples** from the data to support each insight
4. **Look for cross-platform correlations** - how do GitHub commits relate to Linear issues and Slack discussions?
5. **Provide comprehensive details** - each insight should be substantial and informative
6. **Focus on team-level patterns** that reveal systemic strengths or improvement opportunities
7. **Quality over quantity** - prioritize insights that will generate meaningful retrospective discussions and lead to concrete team improvements`;
    }

    // Clamp user prompt to the current max data tokens to avoid overflow due to JSON structure noise
    const approxTokens = this.estimateTokens(dataString);
    if (approxTokens > this.maxDataTokens) {
      // Heuristic: trim end of the string to fit within budget
      const ratio = this.maxDataTokens / approxTokens;
      const targetChars = Math.floor(dataString.length * ratio);
      const safe = dataString.slice(0, Math.max(0, targetChars - 3)) + "...";
      return `Team Data for Analysis:\n\n${safe}\n\n${analysisInstructions}\n\nPlease analyze this data according to the instructions and provide comprehensive insights in the specified JSON format.`;
    }

    return `Team Data for Analysis:

${dataString}

${analysisInstructions}

Please analyze this data according to the instructions and provide comprehensive insights in the specified JSON format.`;
  }

  /**
   * Optimizes team data to fit within current model's token limits
   * @param {Object} teamData - Team data to optimize
   * @param {Object} context - Context for optimization
   * @returns {Object} Optimized team data
   */
  optimizeDataForTokens(teamData, context) {
    const dataString = JSON.stringify(teamData);
    const estimatedTokens = this.estimateTokens(dataString);

    if (estimatedTokens <= this.maxDataTokens) {
      console.log(
        `Data fits comfortably: ${estimatedTokens.toLocaleString()} tokens ≤ ${this.maxDataTokens.toLocaleString()} limit`
      );
      return teamData;
    }

    console.log(
      `Optimizing data for ${this.currentLimits.provider}/${
        this.currentLimits.model
      }: ${estimatedTokens.toLocaleString()} tokens > ${this.maxDataTokens.toLocaleString()} limit`
    );

    // Create deep copy to avoid mutating original data
    const optimized = JSON.parse(JSON.stringify(teamData));
    // Aim to stay under target utilization of the data budget (e.g., 95%)
    const targetUtil = Math.max(
      0.8,
      Math.min(0.98, this.config.targetUtilization ?? 0.95)
    );
    const targetDataBudget = Math.floor(this.maxDataTokens * targetUtil);
    const reductionRatio = targetDataBudget / estimatedTokens;

    console.log(
      `Applying ${(reductionRatio * 100).toFixed(1)}% reduction ratio`
    );

    // Optimize each data source
    if (optimized.github) {
      optimized.github = this._optimizeGitHubData(
        optimized.github,
        reductionRatio
      );
    }

    if (optimized.linear) {
      optimized.linear = this._optimizeLinearData(
        optimized.linear,
        reductionRatio
      );
    }

    if (optimized.slack) {
      optimized.slack = this._optimizeSlackData(
        optimized.slack,
        reductionRatio
      );
    }

    const optimizedSize = this.estimateTokens(JSON.stringify(optimized));
    console.log(
      `Optimization complete: ${optimizedSize.toLocaleString()} tokens (${(
        (optimizedSize / this.maxDataTokens) *
        100
      ).toFixed(1)}% utilization; target ${(targetUtil * 100).toFixed(0)}%)`
    );

    return optimized;
  }

  /**
   * Optimizes GitHub data for token limits
   * @private
   */
  _optimizeGitHubData(githubData, reductionRatio) {
    const optimized = { ...githubData };

    // Sort by recency but don't impose hard limits - let token budget determine inclusion
    if (optimized.commits) {
      const targetLength = Math.floor(
        optimized.commits.length * reductionRatio
      );
      optimized.commits = optimized.commits
        .sort((a, b) => new Date(b.date) - new Date(a.date))
        .slice(0, targetLength);
    }

    if (optimized.pullRequests) {
      const targetLength = Math.floor(
        optimized.pullRequests.length * reductionRatio
      );
      optimized.pullRequests = optimized.pullRequests
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, targetLength);
    }

    // Truncate long commit messages and PR descriptions
    if (optimized.commits) {
      optimized.commits = optimized.commits.map((commit) => ({
        ...commit,
        message: this._truncateText(commit.message, 100),
      }));
    }

    return optimized;
  }

  /**
   * Optimizes Linear data for token limits
   * @private
   */
  _optimizeLinearData(linearData, reductionRatio) {
    const optimized = { ...linearData };

    if (optimized.issues) {
      const targetLength = Math.floor(optimized.issues.length * reductionRatio);
      optimized.issues = optimized.issues
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, targetLength)
        .map((issue) => ({
          ...issue,
          title: this._truncateText(issue.title, 80),
          description: this._truncateText(issue.description, 150),
        }));
    }

    return optimized;
  }

  /**
   * Optimizes Slack data for token limits
   * @private
   */
  _optimizeSlackData(slackData, reductionRatio) {
    const optimized = { ...slackData };

    if (optimized.messages) {
      const targetLength = Math.floor(
        optimized.messages.length * reductionRatio
      );
      optimized.messages = optimized.messages
        .sort((a, b) => new Date(b.ts) - new Date(a.ts))
        .slice(0, targetLength)
        .map((message) => ({
          ...message,
          text: this._truncateText(message.text, 200),
        }));
    }

    return optimized;
  }

  /**
   * Truncates text to specified length with ellipsis
   * @private
   */
  _truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + "...";
  }

  /**
   * Estimates token count for text
   * @param {string} text - Text to estimate tokens for
   * @returns {number} Estimated token count
   */
  estimateTokens(text) {
    if (!text) return 0;
    // Rough estimation: ~4 characters per token for English text
    // Add some buffer for JSON structure and formatting
    return Math.ceil(text.length / 3.5);
  }

  /**
   * Estimates total tokens for a complete prompt
   * @private
   */
  _estimatePromptTokens(teamData, context) {
    const systemTokens = this.config.systemPromptTokens;
    const dataTokens = this.estimateTokens(JSON.stringify(teamData));
    const contextTokens = this.estimateTokens(JSON.stringify(context));

    return systemTokens + dataTokens + contextTokens;
  }

  /**
   * Validates that prompt fits within current model's token limits
   * @param {Object} prompt - Generated prompt object
   * @returns {boolean} True if prompt is within limits
   */
  validatePromptSize(prompt) {
    const systemTokens = this.estimateTokens(prompt.system);
    const userTokens = this.estimateTokens(prompt.user);
    const totalTokens = systemTokens + userTokens;
    // Require headroom beyond model ceiling (configurable)
    const totalHeadroom = this.config.totalHeadroom ?? 0.85; // 85% of total by default
    // Reserve explicit output buffer before headroom
    const availableTotal = Math.max(
      0,
      Math.floor((this.maxTokens - (this.outputBuffer || 0)) * totalHeadroom)
    );
    const hardCap = availableTotal;
    return totalTokens <= hardCap;
  }

  /**
   * Gets token usage statistics for a prompt with current model limits
   * @param {Object} prompt - Generated prompt object
   * @returns {Object} Token usage breakdown
   */
  getTokenUsage(prompt) {
    const systemTokens = this.estimateTokens(prompt.system);
    const userTokens = this.estimateTokens(prompt.user);
    const totalTokens = systemTokens + userTokens;

    return {
      system: systemTokens,
      user: userTokens,
      total: totalTokens,
      limit: this.maxTokens,
      utilization: totalTokens / this.maxTokens,
      withinLimit: totalTokens <= this.maxTokens,
      model: {
        provider: this.currentLimits.provider,
        model: this.currentLimits.model,
        totalCapacity: this.currentLimits.total,
        inputCapacity: this.currentLimits.input,
        outputCapacity: this.currentLimits.output,
      },
      efficiency: {
        dataUtilization: userTokens / this.maxDataTokens,
        overallUtilization: totalTokens / this.maxTokens,
        availableTokens: this.maxTokens - totalTokens,
      },
    };
  }

  /**
   * Clamp the prompt so total estimated tokens stay within the hard cap.
   * Returns a new prompt object if clamping occurs; otherwise the original.
   */
  clampPromptToBudget(prompt) {
    const systemTokens = this.estimateTokens(prompt.system);
    const userTokens = this.estimateTokens(prompt.user);
    const totalTokens = systemTokens + userTokens;
    const totalHeadroom = this.config.totalHeadroom ?? 0.92;
    const hardCap = Math.floor(this.maxTokens * totalHeadroom);

    if (totalTokens <= hardCap) return prompt;

    const maxUserTokens = Math.max(0, hardCap - systemTokens);
    if (maxUserTokens <= 0) {
      return {
        ...prompt,
        user: "",
      };
    }

    // Compute ratio of allowed user tokens vs current
    const ratio = maxUserTokens / Math.max(1, userTokens);
    const userText = prompt.user || "";
    const targetChars = Math.max(0, Math.floor(userText.length * ratio) - 3);
    const trimmed = userText.slice(0, targetChars) + "...";
    return {
      ...prompt,
      user: trimmed,
      metadata: {
        ...prompt.metadata,
        clamped: true,
        clamp: {
          hardCap,
          systemTokens,
          userTokensBefore: userTokens,
          userTokensAfter: this.estimateTokens(trimmed),
        },
      },
    };
  }

  /**
   * Gets current model configuration and limits
   * @returns {Object} Current model information
   */
  getCurrentModelInfo() {
    return {
      provider: this.currentLimits.provider,
      model: this.currentLimits.model,
      limits: this.currentLimits,
      maxTokens: this.maxTokens,
      maxDataTokens: this.maxDataTokens,
      outputBuffer: this.outputBuffer,
    };
  }

  /**
   * Gets optimization recommendation for given data size and model
   * @param {Object} teamData - Team data to analyze
   * @param {string} provider - LLM provider
   * @param {string} model - Model name
   * @returns {Object} Optimization recommendation
   */
  getOptimizationRecommendation(teamData, provider, model) {
    const dataSize = this.estimateTokens(JSON.stringify(teamData));
    return this.tokenLimits.getOptimizationRecommendation(
      dataSize,
      provider || this.defaultProvider,
      model || this.defaultModel,
      this.config.systemPromptTokens
    );
  }

  /**
   * Gets the best model recommendation for given data size
   * @param {Object} teamData - Team data to analyze
   * @param {string} preferredProvider - Preferred provider (optional)
   * @returns {Object} Model recommendation
   */
  getModelRecommendation(teamData, preferredProvider = null) {
    const dataSize = this.estimateTokens(JSON.stringify(teamData));
    return this.tokenLimits.getRecommendedModel(dataSize, preferredProvider);
  }

  /**
   * Creates a prompt builder with custom configuration
   * @param {Object} config - Custom configuration options
   * @returns {PromptBuilder} New PromptBuilder instance
   */
  static withConfig(config) {
    return new PromptBuilder(config);
  }

  /**
   * Creates a prompt builder configured for a specific model
   * @param {string} provider - LLM provider
   * @param {string} model - Model name
   * @param {Object} config - Additional configuration options
   * @returns {PromptBuilder} New PromptBuilder instance
   */
  static forModel(provider, model, config = {}) {
    return new PromptBuilder({
      ...config,
      provider,
      model,
    });
  }
}
