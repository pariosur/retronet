/**
 * DataSanitizer - Removes or masks sensitive information from team data
 * before sending to external LLM providers
 */
class DataSanitizer {
  constructor(privacyLevel = 'moderate') {
    this.privacyLevel = privacyLevel; // 'strict', 'moderate', 'minimal'
    
    // Common patterns for sensitive data (order matters - more specific patterns first)
    this.patterns = {
      // Specific token patterns first
      githubToken: /\bgh[ps]_[A-Za-z0-9_]{36,}\b/g,
      linearToken: /\blin_api_[A-Za-z0-9_]{40,}\b/g,
      slackToken: /\bxox[bpoa]-[A-Za-z0-9-]+/g,
      // General patterns - more specific to avoid false positives
      email: /\b[A-Za-z0-9._%+-]+@(?!github\.com|noreply)[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      token: /\b(?:sk-|pk_)[A-Za-z0-9_-]{20,}\b/g,
      apiKey: /\b(?:api[_-]?key|secret|token)["\s]*[:=]["\s]*[A-Za-z0-9_-]{20,}\b/gi,
      // More specific phone number pattern to avoid matching commit hashes
      phoneNumber: /\b(?:\+?1[-.\s]?)?\(?[2-9][0-9]{2}\)?[-.\s]?[2-9][0-9]{2}[-.\s]?[0-9]{4}\b/g,
      socialSecurity: /\b[0-9]{3}-[0-9]{2}-[0-9]{4}\b/g,
      creditCard: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|3[0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
      // Don't sanitize GitHub/API URLs - they're not sensitive
      privateUrl: /https?:\/\/(?!api\.github\.com|github\.com)[^\s<>"{}|\\^`[\]]*(?:password|token|key|secret)[^\s<>"{}|\\^`[\]]*/gi,
    };
    
    // Replacement strategies by privacy level
    this.replacements = {
      strict: {
        email: '[EMAIL_REDACTED]',
        token: '[TOKEN_REDACTED]',
        apiKey: '[API_KEY_REDACTED]',
        ipAddress: '[IP_REDACTED]',
        phoneNumber: '[PHONE_REDACTED]',
        socialSecurity: '[SSN_REDACTED]',
        creditCard: '[CARD_REDACTED]',
        url: '[URL_REDACTED]',
        githubToken: '[GITHUB_TOKEN_REDACTED]',
        linearToken: '[LINEAR_TOKEN_REDACTED]',
        slackToken: '[SLACK_TOKEN_REDACTED]',
      },
      moderate: {
        email: (match) => `[USER_${Math.abs(match.split('').reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) & 0xffffffff, 0)).toString(16).substring(0, 6)}]@[DOMAIN]`,
        token: '[TOKEN_REDACTED]',
        apiKey: '[API_KEY_REDACTED]',
        ipAddress: (match) => match.replace(/\d+$/, 'XXX'),
        phoneNumber: '[PHONE_REDACTED]',
        socialSecurity: '[SSN_REDACTED]',
        creditCard: '[CARD_REDACTED]',
        url: (match) => {
          try {
            const url = new URL(match);
            return `${url.protocol}//${url.hostname}/[PATH_REDACTED]`;
          } catch {
            return '[URL_REDACTED]';
          }
        },
        githubToken: '[GITHUB_TOKEN_REDACTED]',
        linearToken: '[LINEAR_TOKEN_REDACTED]',
        slackToken: '[SLACK_TOKEN_REDACTED]',
      },
      minimal: {
        email: (match) => `user_${Math.abs(match.split('').reduce((a, b) => ((a << 5) - a + b.charCodeAt(0)) & 0xffffffff, 0)).toString(16).substring(0, 4)}@company.com`,
        token: '[TOKEN]',
        apiKey: '[API_KEY]',
        ipAddress: (match) => match.replace(/(\d+)\.(\d+)$/, 'XXX.XXX'),
        phoneNumber: (match) => match.replace(/\d{4}$/, 'XXXX'),
        socialSecurity: '[SSN]',
        creditCard: '[CARD]',
        url: (match) => {
          try {
            const url = new URL(match);
            return `${url.protocol}//${url.hostname}/...`;
          } catch {
            return '[URL]';
          }
        },
        githubToken: '[GITHUB_TOKEN]',
        linearToken: '[LINEAR_TOKEN]',
        slackToken: '[SLACK_TOKEN]',
      }
    };
  }

  /**
   * Simple hash function for consistent anonymization
   */
  hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Apply sanitization patterns to text
   */
  sanitizeText(text, additionalPatterns = {}) {
    if (!text || typeof text !== 'string') {
      return text;
    }

    let sanitized = text;
    const allPatterns = { ...this.patterns, ...additionalPatterns };
    const replacements = this.replacements[this.privacyLevel];

    // Apply each pattern
    Object.entries(allPatterns).forEach(([key, pattern]) => {
      const replacement = replacements[key];
      if (typeof replacement === 'function') {
        sanitized = sanitized.replace(pattern, replacement);
      } else if (replacement) {
        sanitized = sanitized.replace(pattern, replacement);
      }
    });

    return sanitized;
  }

  /**
   * Sanitize GitHub data
   */
  sanitizeGitHubData(data) {
    if (!data) return data;

    const sanitized = JSON.parse(JSON.stringify(data)); // Deep clone

    // Sanitize commits
    if (sanitized.commits) {
      sanitized.commits = sanitized.commits.map(commit => ({
        ...commit,
        commit: commit.commit ? {
          ...commit.commit,
          message: this.sanitizeText(commit.commit.message || ''),
          author: commit.commit.author ? {
            ...commit.commit.author,
            email: this.privacyLevel === 'strict' ? '[EMAIL_REDACTED]' : 
                   this.sanitizeText(commit.commit.author.email || ''),
            name: this.privacyLevel === 'strict' ? '[USER_REDACTED]' : 
                  commit.commit.author.name
          } : null,
          committer: commit.commit.committer ? {
            ...commit.commit.committer,
            email: this.privacyLevel === 'strict' ? '[EMAIL_REDACTED]' : 
                   this.sanitizeText(commit.commit.committer.email || ''),
            name: this.privacyLevel === 'strict' ? '[USER_REDACTED]' : 
                  commit.commit.committer.name
          } : null
        } : null,
        author: commit.author ? {
          ...commit.author,
          login: this.privacyLevel === 'strict' ? '[USER_REDACTED]' : commit.author.login,
          email: this.sanitizeText(commit.author.email || ''),
          avatar_url: this.privacyLevel !== 'minimal' ? '[AVATAR_REDACTED]' : commit.author.avatar_url,
          url: this.sanitizeText(commit.author.url || ''),
          html_url: this.sanitizeText(commit.author.html_url || '')
        } : null,
        committer: commit.committer ? {
          ...commit.committer,
          login: this.privacyLevel === 'strict' ? '[USER_REDACTED]' : commit.committer.login,
          email: this.sanitizeText(commit.committer.email || ''),
          avatar_url: this.privacyLevel !== 'minimal' ? '[AVATAR_REDACTED]' : commit.committer.avatar_url,
          url: this.sanitizeText(commit.committer.url || ''),
          html_url: this.sanitizeText(commit.committer.html_url || '')
        } : null,
        html_url: this.sanitizeText(commit.html_url || ''),
        url: this.sanitizeText(commit.url || '')
      }));
    }

    // Sanitize pull requests
    if (sanitized.pullRequests) {
      sanitized.pullRequests = sanitized.pullRequests.map(pr => ({
        ...pr,
        title: this.sanitizeText(pr.title),
        body: this.sanitizeText(pr.body || ''),
        user: pr.user ? {
          ...pr.user,
          login: this.privacyLevel === 'strict' ? '[USER_REDACTED]' : pr.user.login,
          email: this.sanitizeText(pr.user.email || ''),
          avatar_url: this.privacyLevel !== 'minimal' ? '[AVATAR_REDACTED]' : pr.user.avatar_url,
          url: this.sanitizeText(pr.user.url || ''),
          html_url: this.sanitizeText(pr.user.html_url || '')
        } : null,
        html_url: this.sanitizeText(pr.html_url || ''),
        url: this.sanitizeText(pr.url || ''),
        diff_url: this.sanitizeText(pr.diff_url || ''),
        patch_url: this.sanitizeText(pr.patch_url || '')
      }));
    }

    return sanitized;
  }

  /**
   * Sanitize Linear data
   */
  sanitizeLinearData(data) {
    if (!data) return data;

    const sanitized = JSON.parse(JSON.stringify(data)); // Deep clone

    if (Array.isArray(sanitized)) {
      return sanitized.map(issue => this.sanitizeLinearIssue(issue));
    }

    return this.sanitizeLinearIssue(sanitized);
  }

  sanitizeLinearIssue(issue) {
    return {
      ...issue,
      title: this.sanitizeText(issue.title),
      description: this.sanitizeText(issue.description || ''),
      assignee: issue.assignee ? {
        ...issue.assignee,
        name: this.privacyLevel === 'strict' ? '[USER_REDACTED]' : issue.assignee.name,
        email: this.sanitizeText(issue.assignee.email || '')
      } : null,
      comments: issue.comments ? {
        ...issue.comments,
        nodes: issue.comments.nodes.map(comment => ({
          ...comment,
          body: this.sanitizeText(comment.body),
          user: comment.user ? {
            ...comment.user,
            name: this.privacyLevel === 'strict' ? '[USER_REDACTED]' : comment.user.name
          } : null
        }))
      } : null,
      // Keep project and team info but sanitize if needed
      project: issue.project ? {
        ...issue.project,
        name: this.privacyLevel === 'strict' ? '[PROJECT_REDACTED]' : issue.project.name
      } : null,
      team: issue.team ? {
        ...issue.team,
        name: this.privacyLevel === 'strict' ? '[TEAM_REDACTED]' : issue.team.name
      } : null
    };
  }

  /**
   * Sanitize Slack data
   */
  sanitizeSlackData(data) {
    if (!data) return data;

    const sanitized = JSON.parse(JSON.stringify(data)); // Deep clone

    if (Array.isArray(sanitized)) {
      return sanitized.map(message => this.sanitizeSlackMessage(message));
    }

    return this.sanitizeSlackMessage(sanitized);
  }

  sanitizeSlackMessage(message) {
    let sanitizedText = message.text || '';
    
    // First sanitize the text content
    sanitizedText = this.sanitizeText(sanitizedText);
    
    // Then handle Slack-specific patterns
    sanitizedText = sanitizedText.replace(/<@U[A-Z0-9]+>/g, '@[USER]');
    sanitizedText = sanitizedText.replace(/<#C[A-Z0-9]+\|([^>]+)>/g, '#[CHANNEL]');
    
    return {
      ...message,
      text: sanitizedText,
      user: this.privacyLevel === 'strict' ? '[USER_REDACTED]' : message.user,
      channel: this.privacyLevel === 'strict' ? '[CHANNEL_REDACTED]' : message.channel,
      thread_ts: this.privacyLevel !== 'minimal' ? '[THREAD_REDACTED]' : message.thread_ts,
      reactions: message.reactions ? message.reactions.map(reaction => ({
        name: reaction.name,
        count: reaction.count,
        users: [] // Remove user lists from reactions
      })) : undefined
    };
  }

  /**
   * Sanitize complete team data object
   */
  sanitizeTeamData(teamData) {
    if (!teamData) return teamData;

    const sanitized = {
      github: teamData.github ? this.sanitizeGitHubData(teamData.github) : null,
      linear: teamData.linear ? this.sanitizeLinearData(teamData.linear) : null,
      slack: teamData.slack ? this.sanitizeSlackData(teamData.slack) : null,
      // Keep metadata but sanitize sensitive parts
      dateRange: teamData.dateRange,
      teamSize: teamData.teamSize,
      repositories: teamData.repositories ? teamData.repositories.map(repo => 
        this.privacyLevel === 'strict' ? '[REPO_REDACTED]' : repo
      ) : [],
      channels: teamData.channels ? teamData.channels.map(channel => 
        this.privacyLevel === 'strict' ? '[CHANNEL_REDACTED]' : channel
      ) : []
    };

    return sanitized;
  }

  /**
   * Validate that data has been properly sanitized
   */
  validateSanitization(data) {
    const dataStr = JSON.stringify(data);
    const violations = [];

    // Check for common sensitive patterns
    Object.entries(this.patterns).forEach(([key, pattern]) => {
      const matches = dataStr.match(pattern);
      if (matches) {
        violations.push({
          type: key,
          count: matches.length,
          examples: matches.slice(0, 3) // Show first 3 examples
        });
      }
    });

    return {
      isClean: violations.length === 0,
      violations
    };
  }

  /**
   * Get sanitization summary for logging/monitoring
   */
  getSanitizationSummary(originalData, sanitizedData) {
    const originalStr = JSON.stringify(originalData);
    const sanitizedStr = JSON.stringify(sanitizedData);
    
    const summary = {
      privacyLevel: this.privacyLevel,
      originalSize: originalStr.length,
      sanitizedSize: sanitizedStr.length,
      reductionPercent: ((originalStr.length - sanitizedStr.length) / originalStr.length * 100).toFixed(2),
      patternsApplied: Object.keys(this.patterns).length
    };

    return summary;
  }
}

export default DataSanitizer;