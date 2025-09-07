/**
 * TemporalDataProcessor - Organizes team data chronologically for better LLM analysis
 *
 * This processor combines data from all sources (GitHub, Linear, Slack) and organizes
 * it by date/time to create coherent temporal chunks that preserve context and
 * relationships between activities across different platforms.
 */

export class TemporalDataProcessor {
  constructor(config = {}) {
    this.config = {
      chunkSizeHours: config.chunkSizeHours || 24, // Default: 1 day chunks
      minChunkSizeHours: config.minChunkSizeHours || 4, // Minimum chunk size
      maxChunkSizeHours: config.maxChunkSizeHours || 72, // Maximum chunk size (3 days)
      overlapHours: config.overlapHours || 2, // Overlap between chunks for context
      ...config,
    };
  }

  /**
   * Process and organize team data chronologically
   * @param {Object} teamData - Raw team data from all sources
   * @param {Object} dateRange - Analysis date range
   * @returns {Object} Processed temporal data structure
   */
  processTeamData(teamData, dateRange) {
    console.log(
      "TemporalDataProcessor: Starting chronological data processing..."
    );

    // Step 1: Extract and normalize all events with timestamps
    const allEvents = this._extractAllEvents(teamData);
    console.log(`Extracted ${allEvents.length} total events from all sources`);

    // Step 2: Sort events chronologically
    const sortedEvents = this._sortEventsByTime(allEvents);

    // Step 3: Filter events within date range
    const filteredEvents = this._filterEventsByDateRange(
      sortedEvents,
      dateRange
    );
    console.log(
      `Filtered to ${filteredEvents.length} events within date range`
    );

    // Step 4: Create temporal chunks
    const temporalChunks = this._createTemporalChunks(
      filteredEvents,
      dateRange
    );
    console.log(`Created ${temporalChunks.length} temporal chunks`);

    // Step 5: Enrich chunks with context and metadata
    const enrichedChunks = this._enrichChunks(temporalChunks);

    return {
      totalEvents: allEvents.length,
      filteredEvents: filteredEvents.length,
      chunks: enrichedChunks,
      dateRange,
      processingMetadata: {
        chunkSizeHours: this.config.chunkSizeHours,
        overlapHours: this.config.overlapHours,
        processedAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Extract all events from team data with normalized timestamps
   * @private
   */
  _extractAllEvents(teamData) {
    const events = [];

    // Extract GitHub events
    if (teamData.github) {
      // Process commits
      if (teamData.github.commits) {
        teamData.github.commits.forEach((commit) => {
          events.push({
            type: "github_commit",
            source: "github",
            timestamp: this._parseTimestamp(
              commit.commit?.author?.date || commit.date
            ),
            data: {
              sha: commit.sha,
              message: commit.commit?.message || commit.message,
              author: commit.commit?.author?.name || commit.author?.login,
              url: commit.html_url,
              repo: commit.repo,
              additions: commit.stats?.additions,
              deletions: commit.stats?.deletions,
              files: commit.files?.length,
            },
            rawData: commit,
          });
        });
      }

      // Process pull requests
      if (teamData.github.pullRequests) {
        teamData.github.pullRequests.forEach((pr) => {
          // PR creation event
          events.push({
            type: "github_pr_created",
            source: "github",
            timestamp: this._parseTimestamp(pr.created_at),
            data: {
              number: pr.number,
              title: pr.title,
              author: pr.user?.login,
              state: pr.state,
              url: pr.html_url,
              repo: pr.repo,
              additions: pr.additions,
              deletions: pr.deletions,
              commits: pr.commits,
              comments: pr.comments,
              reviewComments: pr.review_comments,
            },
            rawData: pr,
          });

          // PR merge/close event if applicable
          if (pr.merged_at) {
            events.push({
              type: "github_pr_merged",
              source: "github",
              timestamp: this._parseTimestamp(pr.merged_at),
              data: {
                number: pr.number,
                title: pr.title,
                author: pr.user?.login,
                mergedBy: pr.merged_by?.login,
                url: pr.html_url,
                repo: pr.repo,
              },
              rawData: pr,
            });
          } else if (pr.closed_at && pr.state === "closed") {
            events.push({
              type: "github_pr_closed",
              source: "github",
              timestamp: this._parseTimestamp(pr.closed_at),
              data: {
                number: pr.number,
                title: pr.title,
                author: pr.user?.login,
                url: pr.html_url,
                repo: pr.repo,
              },
              rawData: pr,
            });
          }
        });
      }
    }

    // Extract Linear events
    if (teamData.linear?.issues) {
      teamData.linear.issues.forEach((issue) => {
        // Issue creation
        events.push({
          type: "linear_issue_created",
          source: "linear",
          timestamp: this._parseTimestamp(issue.createdAt),
          data: {
            id: issue.id,
            title: issue.title,
            description: issue.description,
            assignee: issue.assignee?.name,
            state: issue.state?.name,
            priority: issue.priority,
            estimate: issue.estimate,
            team: issue.team?.name,
            project: issue.project?.name,
            labels: issue.labels?.nodes?.map((l) => l.name) || [],
          },
          rawData: issue,
        });

        // Issue completion if applicable
        if (issue.completedAt) {
          events.push({
            type: "linear_issue_completed",
            source: "linear",
            timestamp: this._parseTimestamp(issue.completedAt),
            data: {
              id: issue.id,
              title: issue.title,
              assignee: issue.assignee?.name,
              state: issue.state?.name,
              team: issue.team?.name,
              project: issue.project?.name,
            },
            rawData: issue,
          });
        }

        // Issue updates (using updatedAt if different from createdAt)
        const created = this._parseTimestamp(issue.createdAt);
        const updated = this._parseTimestamp(issue.updatedAt);
        if (updated && updated.getTime() !== created.getTime()) {
          events.push({
            type: "linear_issue_updated",
            source: "linear",
            timestamp: updated,
            data: {
              id: issue.id,
              title: issue.title,
              assignee: issue.assignee?.name,
              state: issue.state?.name,
              team: issue.team?.name,
              project: issue.project?.name,
            },
            rawData: issue,
          });
        }
      });
    }

    // Extract Slack events
    if (teamData.slack?.messages) {
      teamData.slack.messages.forEach((message) => {
        events.push({
          type: "slack_message",
          source: "slack",
          timestamp: this._parseTimestamp(
            message.ts
              ? new Date(parseFloat(message.ts) * 1000)
              : message.timestamp
          ),
          data: {
            text: message.text,
            user: message.user,
            channel: message.channel,
            channelId: message.channelId,
            reactions:
              message.reactions?.map((r) => ({
                name: r.name,
                count: r.count,
              })) || [],
            threadTs: message.thread_ts,
            replyCount: message.reply_count,
          },
          rawData: message,
        });
      });
    }

    return events.filter((event) => event.timestamp); // Remove events without valid timestamps
  }

  /**
   * Parse various timestamp formats into Date objects
   * @private
   */
  _parseTimestamp(timestamp) {
    if (!timestamp) return null;

    if (timestamp instanceof Date) return timestamp;

    if (typeof timestamp === "string") {
      const parsed = new Date(timestamp);
      return isNaN(parsed.getTime()) ? null : parsed;
    }

    if (typeof timestamp === "number") {
      // Handle Unix timestamps (seconds or milliseconds)
      const date =
        timestamp > 1e10 ? new Date(timestamp) : new Date(timestamp * 1000);
      return isNaN(date.getTime()) ? null : date;
    }

    return null;
  }

  /**
   * Sort events chronologically
   * @private
   */
  _sortEventsByTime(events) {
    return events.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }

  /**
   * Filter events by date range
   * @private
   */
  _filterEventsByDateRange(events, dateRange) {
    if (!dateRange?.start || !dateRange?.end) return events;

    const startDate = new Date(dateRange.start);
    const endDate = new Date(dateRange.end);

    return events.filter((event) => {
      const eventTime = event.timestamp.getTime();
      return eventTime >= startDate.getTime() && eventTime <= endDate.getTime();
    });
  }

  /**
   * Create temporal chunks from sorted events
   * @private
   */
  _createTemporalChunks(events, dateRange) {
    if (events.length === 0) return [];

    const chunks = [];
    const chunkSizeMs = this.config.chunkSizeHours * 60 * 60 * 1000;
    const overlapMs = this.config.overlapHours * 60 * 60 * 1000;

    // Start from the first event or date range start, whichever is later
    const startTime = Math.max(
      events[0].timestamp.getTime(),
      new Date(dateRange.start).getTime()
    );

    const endTime = Math.min(
      events[events.length - 1].timestamp.getTime(),
      new Date(dateRange.end).getTime()
    );

    let currentChunkStart = startTime;
    let chunkIndex = 0;

    while (currentChunkStart < endTime) {
      const currentChunkEnd = Math.min(
        currentChunkStart + chunkSizeMs,
        endTime
      );

      // Find events in this time window (including overlap from previous chunk)
      const chunkStartWithOverlap =
        chunkIndex > 0 ? currentChunkStart - overlapMs : currentChunkStart;
      const chunkEvents = events.filter((event) => {
        const eventTime = event.timestamp.getTime();
        return (
          eventTime >= chunkStartWithOverlap && eventTime < currentChunkEnd
        );
      });

      // Only create chunk if it has events or if it's a significant time gap
      if (
        chunkEvents.length > 0 ||
        currentChunkEnd - currentChunkStart >=
          this.config.minChunkSizeHours * 60 * 60 * 1000
      ) {
        chunks.push({
          id: `chunk_${chunkIndex}`,
          startTime: new Date(currentChunkStart),
          endTime: new Date(currentChunkEnd),
          events: chunkEvents,
          eventCount: chunkEvents.length,
          hasOverlap: chunkIndex > 0,
          overlapEvents:
            chunkIndex > 0
              ? chunkEvents.filter(
                  (event) => event.timestamp.getTime() < currentChunkStart
                ).length
              : 0,
        });
        chunkIndex++;
      }

      // Move to next chunk
      currentChunkStart = currentChunkEnd;
    }

    return chunks;
  }

  /**
   * Enrich chunks with context and metadata
   * @private
   */
  _enrichChunks(chunks) {
    return chunks.map((chunk, index) => {
      // Analyze event distribution
      const eventsBySource = this._groupEventsBySource(chunk.events);
      const eventsByType = this._groupEventsByType(chunk.events);

      // Calculate activity metrics
      const activityMetrics = this._calculateActivityMetrics(chunk.events);

      // Identify key patterns
      const patterns = this._identifyPatterns(chunk.events);

      return {
        ...chunk,
        index,
        duration: chunk.endTime.getTime() - chunk.startTime.getTime(),
        eventsBySource,
        eventsByType,
        activityMetrics,
        patterns,
        summary: this._generateChunkSummary(
          chunk,
          eventsBySource,
          activityMetrics
        ),
        context: {
          isFirstChunk: index === 0,
          isLastChunk: index === chunks.length - 1,
          previousChunk: index > 0 ? chunks[index - 1].id : null,
          nextChunk: index < chunks.length - 1 ? chunks[index + 1].id : null,
        },
      };
    });
  }

  /**
   * Group events by source
   * @private
   */
  _groupEventsBySource(events) {
    const grouped = {};
    events.forEach((event) => {
      if (!grouped[event.source]) grouped[event.source] = [];
      grouped[event.source].push(event);
    });
    return grouped;
  }

  /**
   * Group events by type
   * @private
   */
  _groupEventsByType(events) {
    const grouped = {};
    events.forEach((event) => {
      if (!grouped[event.type]) grouped[event.type] = [];
      grouped[event.type].push(event);
    });
    return grouped;
  }

  /**
   * Calculate activity metrics for a chunk
   * @private
   */
  _calculateActivityMetrics(events) {
    const metrics = {
      totalEvents: events.length,
      uniqueUsers: new Set(),
      codeActivity: 0,
      projectActivity: 0,
      communicationActivity: 0,
      timeSpread: 0,
    };

    if (events.length === 0) return metrics;

    // Calculate time spread
    const timestamps = events
      .map((e) => e.timestamp.getTime())
      .sort((a, b) => a - b);
    metrics.timeSpread = timestamps[timestamps.length - 1] - timestamps[0];

    events.forEach((event) => {
      // Track unique users
      const user = event.data.author || event.data.assignee || event.data.user;
      if (user) metrics.uniqueUsers.add(user);

      // Categorize activity
      if (event.source === "github") {
        metrics.codeActivity++;
      } else if (event.source === "linear") {
        metrics.projectActivity++;
      } else if (event.source === "slack") {
        metrics.communicationActivity++;
      }
    });

    metrics.uniqueUsers = metrics.uniqueUsers.size;
    return metrics;
  }

  /**
   * Identify patterns in chunk events
   * @private
   */
  _identifyPatterns(events) {
    const patterns = {
      hasCodeReview: false,
      hasIssueResolution: false,
      hasTeamDiscussion: false,
      hasDeploymentActivity: false,
      workingHours: { morning: 0, afternoon: 0, evening: 0, night: 0 },
      correlations: [],
    };

    events.forEach((event) => {
      const hour = event.timestamp.getHours();

      // Categorize by time of day
      if (hour >= 6 && hour < 12) patterns.workingHours.morning++;
      else if (hour >= 12 && hour < 18) patterns.workingHours.afternoon++;
      else if (hour >= 18 && hour < 22) patterns.workingHours.evening++;
      else patterns.workingHours.night++;

      // Identify activity patterns
      if (event.type.includes("pr_")) patterns.hasCodeReview = true;
      if (event.type.includes("issue_completed"))
        patterns.hasIssueResolution = true;
      if (event.source === "slack" && event.data.replyCount > 0)
        patterns.hasTeamDiscussion = true;
      if (
        event.type.includes("commit") &&
        event.data.message?.toLowerCase().includes("deploy")
      ) {
        patterns.hasDeploymentActivity = true;
      }
    });

    // Look for correlations (simplified)
    patterns.correlations = this._findEventCorrelations(events);

    return patterns;
  }

  /**
   * Find correlations between events
   * @private
   */
  _findEventCorrelations(events) {
    const correlations = [];
    const timeWindow = 60 * 60 * 1000; // 1 hour window

    for (let i = 0; i < events.length - 1; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const event1 = events[i];
        const event2 = events[j];
        const timeDiff = Math.abs(
          event2.timestamp.getTime() - event1.timestamp.getTime()
        );

        if (timeDiff <= timeWindow) {
          // Look for meaningful correlations
          if (event1.source !== event2.source) {
            correlations.push({
              type: "cross_platform",
              event1: { type: event1.type, source: event1.source },
              event2: { type: event2.type, source: event2.source },
              timeDiff: timeDiff,
              description: `${event1.type} followed by ${
                event2.type
              } within ${Math.round(timeDiff / 60000)} minutes`,
            });
          }
        }
      }
    }

    return correlations.slice(0, 5); // Limit to top 5 correlations
  }

  /**
   * Generate a summary for the chunk
   * @private
   */
  _generateChunkSummary(chunk, eventsBySource, activityMetrics) {
    const timeRange = `${chunk.startTime.toISOString().split("T")[0]} ${
      chunk.startTime.toTimeString().split(" ")[0]
    } - ${chunk.endTime.toTimeString().split(" ")[0]}`;

    const sourceCounts = Object.entries(eventsBySource)
      .map(([source, events]) => `${events.length} ${source}`)
      .join(", ");

    return {
      timeRange,
      totalEvents: chunk.eventCount,
      sourceCounts,
      uniqueUsers: activityMetrics.uniqueUsers,
      description: `${chunk.eventCount} events from ${activityMetrics.uniqueUsers} users: ${sourceCounts}`,
    };
  }

  /**
   * Get optimal chunk configuration based on data characteristics
   * @param {Array} events - All events
   * @param {Object} dateRange - Date range
   * @returns {Object} Optimal configuration
   */
  getOptimalChunkConfig(events, dateRange) {
    if (events.length === 0) {
      return { chunkSizeHours: 24, reason: "No events to analyze" };
    }

    const totalTimeMs =
      new Date(dateRange.end).getTime() - new Date(dateRange.start).getTime();
    const totalHours = totalTimeMs / (60 * 60 * 1000);
    const eventsPerHour = events.length / totalHours;

    let optimalChunkSize;
    let reason;

    if (eventsPerHour > 10) {
      // High activity - smaller chunks
      optimalChunkSize = 12;
      reason =
        "High activity detected, using 12-hour chunks for detailed analysis";
    } else if (eventsPerHour > 2) {
      // Medium activity - standard chunks
      optimalChunkSize = 24;
      reason = "Medium activity detected, using 24-hour chunks";
    } else {
      // Low activity - larger chunks
      optimalChunkSize = 48;
      reason =
        "Low activity detected, using 48-hour chunks to ensure sufficient context";
    }

    return {
      chunkSizeHours: optimalChunkSize,
      eventsPerHour: Math.round(eventsPerHour * 100) / 100,
      totalEvents: events.length,
      totalHours: Math.round(totalHours),
      reason,
    };
  }
}

export default TemporalDataProcessor;
