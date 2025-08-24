import axios from "axios";

class LinearService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = "https://api.linear.app/graphql";
  }

  async makeRequest(query, variables = {}) {
    try {
      const response = await axios.post(
        this.baseURL,
        {
          query,
          variables,
        },
        {
          headers: {
            Authorization: this.apiKey,
            "Content-Type": "application/json",
          },
        }
      );

      if (response.data.errors) {
        console.error("Linear API errors:", response.data.errors);
        throw new Error(`Linear API Error: ${response.data.errors[0].message}`);
      }

      return response.data.data;
    } catch (error) {
      if (error.response?.data?.errors) {
        console.error("Linear API errors:", error.response.data.errors);
        throw new Error(
          `Linear API Error: ${error.response.data.errors[0].message}`
        );
      }
      console.error("Linear API request failed:", error.message);
      throw error;
    }
  }

  async getIssuesInDateRange(startDate, endDate, teamMembers = []) {
    const query = `
      query GetIssues($filter: IssueFilter) {
        issues(filter: $filter, first: 25) {
          nodes {
            id
            title
            description
            state {
              name
              type
            }
            assignee {
              name
              email
            }
            createdAt
            updatedAt
            completedAt
            estimate
            priority
            priorityLabel
            labels {
              nodes {
                name
                color
              }
            }
            project {
              id
              name
              targetDate
            }
            projectMilestone {
              id
              name
              targetDate
            }
            team {
              id
              name
            }
            comments {
              nodes {
                body
                createdAt
                user {
                  name
                }
              }
            }
          }
        }
      }
    `;

    const filter = {
      updatedAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    // Add team member filter if specified
    if (teamMembers.length > 0) {
      filter.assignee = {
        email: { in: teamMembers },
      };
    }

    console.log(`Linear filter: ${JSON.stringify(filter)}`);
    const data = await this.makeRequest(query, { filter });
    console.log(`Linear: Retrieved ${data.issues.nodes.length} issues`);
    
    // Debug: Check date range of retrieved issues
    if (data.issues.nodes.length > 0) {
      const dates = data.issues.nodes.map(issue => issue.updatedAt).sort();
      console.log(`Linear date range: ${dates[0]} to ${dates[dates.length - 1]}`);
    }
    
    return data.issues.nodes;
  }

  analyzeIssuesForRetro(issues) {
    const wentWell = [];
    const didntGoWell = [];
    const actionItems = [];

    // Analyze completed issues
    const completedIssues = issues.filter(
      (issue) =>
        issue.state.type === "completed" ||
        issue.state.name.toLowerCase().includes("done")
    );

    // Analyze blocked/cancelled issues
    const blockedIssues = issues.filter(
      (issue) =>
        issue.state.name.toLowerCase().includes("blocked") ||
        issue.state.name.toLowerCase().includes("cancelled") ||
        issue.state.type === "canceled"
    );

    // Analyze high priority issues
    const highPriorityIssues = issues.filter(
      (issue) => issue.priority >= 3 // Linear priority: 0=No priority, 1=Low, 2=Medium, 3=High, 4=Urgent
    );

    // Analyze bug vs feature ratio
    const bugIssues = issues.filter(
      (issue) =>
        issue.labels.nodes.some(
          (label) =>
            label.name.toLowerCase().includes("bug") ||
            label.name.toLowerCase().includes("defect") ||
            label.name.toLowerCase().includes("fix")
        ) ||
        issue.title.toLowerCase().includes("bug") ||
        issue.title.toLowerCase().includes("fix")
    );

    const featureIssues = issues.filter(
      (issue) =>
        issue.labels.nodes.some(
          (label) =>
            label.name.toLowerCase().includes("feature") ||
            label.name.toLowerCase().includes("enhancement") ||
            label.name.toLowerCase().includes("improvement")
        ) ||
        issue.title.toLowerCase().includes("feature") ||
        issue.title.toLowerCase().includes("add")
    );

    // Analyze milestone progress
    const milestonedIssues = issues.filter((issue) => issue.projectMilestone);
    const milestoneGroups = {};

    milestonedIssues.forEach((issue) => {
      const milestone = issue.projectMilestone;
      if (!milestoneGroups[milestone.id]) {
        milestoneGroups[milestone.id] = {
          name: milestone.name,
          targetDate: milestone.targetDate,
          total: 0,
          completed: 0,
          issues: [],
        };
      }
      milestoneGroups[milestone.id].total++;
      milestoneGroups[milestone.id].issues.push(issue);
      if (issue.state.type === "completed") {
        milestoneGroups[milestone.id].completed++;
      }
    });

    // What went well - completed issues
    if (completedIssues.length > 0) {
      const avgEstimate =
        completedIssues
          .filter((i) => i.estimate)
          .reduce((sum, i) => sum + i.estimate, 0) /
        completedIssues.filter((i) => i.estimate).length;

      wentWell.push({
        title: `Completed ${completedIssues.length} issues this sprint`,
        details: `Issues: ${completedIssues
          .map((i) => i.title)
          .slice(0, 3)
          .join(", ")}${completedIssues.length > 3 ? "..." : ""}`,
        source: "linear",
        data: completedIssues,
      });

      // Check for early completions
      const earlyCompletions = completedIssues.filter((issue) => {
        if (!issue.completedAt || !issue.createdAt) return false;
        const timeToComplete =
          new Date(issue.completedAt) - new Date(issue.createdAt);
        const daysTaken = timeToComplete / (1000 * 60 * 60 * 24);
        return daysTaken < 3; // Completed within 3 days
      });

      if (earlyCompletions.length > 0) {
        wentWell.push({
          title: `${earlyCompletions.length} issues completed quickly`,
          details: `Fast completions: ${earlyCompletions
            .map((i) => i.title)
            .join(", ")}`,
          source: "linear",
          data: earlyCompletions,
        });
      }
    }

    // What didn't go well - blocked issues
    if (blockedIssues.length > 0) {
      didntGoWell.push({
        title: `${blockedIssues.length} issues were blocked or cancelled`,
        details: `Blocked: ${blockedIssues.map((i) => i.title).join(", ")}`,
        source: "linear",
        data: blockedIssues,
      });
    }

    // Check for overdue high priority issues
    const overdueHighPriority = highPriorityIssues.filter(
      (issue) =>
        issue.state.type !== "completed" &&
        new Date(issue.createdAt) <
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Older than 7 days
    );

    if (overdueHighPriority.length > 0) {
      didntGoWell.push({
        title: `${overdueHighPriority.length} high-priority issues still pending`,
        details: `Overdue: ${overdueHighPriority
          .map((i) => i.title)
          .join(", ")}`,
        source: "linear",
        data: overdueHighPriority,
      });
    }

    // Generate action items based on patterns
    if (blockedIssues.length > 2) {
      actionItems.push({
        title: "Review and address recurring blockers",
        priority: "high",
        assignee: "team",
        details: "Multiple issues were blocked - investigate common causes",
      });
    }

    if (overdueHighPriority.length > 0) {
      actionItems.push({
        title: "Prioritize high-priority backlog items",
        priority: "medium",
        assignee: "team",
        details: "Several high-priority items are overdue",
      });
    }

    // Check for issues with many comments (potential complexity indicators)
    const complexIssues = issues.filter(
      (issue) => issue.comments.nodes.length > 5
    );
    if (complexIssues.length > 0) {
      actionItems.push({
        title: "Break down complex issues into smaller tasks",
        priority: "medium",
        assignee: "team",
        details: `${complexIssues.length} issues had extensive discussions`,
      });
    }

    // Analyze bug vs feature ratio
    const totalWorkItems = bugIssues.length + featureIssues.length;
    if (totalWorkItems > 0) {
      const bugRatio = ((bugIssues.length / totalWorkItems) * 100).toFixed(1);

      if (bugRatio > 40) {
        didntGoWell.push({
          title: `High bug ratio: ${bugRatio}% of work was bug fixes`,
          details: `${bugIssues.length} bugs vs ${featureIssues.length} features - may indicate quality issues`,
          source: "linear",
          data: { bugIssues, featureIssues, ratio: bugRatio },
        });

        actionItems.push({
          title: "Review code quality practices",
          priority: "high",
          assignee: "team",
          details:
            "High bug ratio suggests need for better testing or code review",
        });
      } else if (bugRatio < 15) {
        wentWell.push({
          title: `Low bug ratio: Only ${bugRatio}% of work was bug fixes`,
          details: `${bugIssues.length} bugs vs ${featureIssues.length} features - good code quality`,
          source: "linear",
          data: { bugIssues, featureIssues, ratio: bugRatio },
        });
      }
    }

    // Analyze milestone progress
    Object.values(milestoneGroups).forEach((milestone) => {
      const completionRate = (
        (milestone.completed / milestone.total) *
        100
      ).toFixed(1);
      const isOverdue =
        milestone.targetDate && new Date(milestone.targetDate) < new Date();

      if (completionRate >= 80) {
        wentWell.push({
          title: `Milestone "${milestone.name}" is ${completionRate}% complete`,
          details: `${milestone.completed}/${milestone.total} issues completed${
            isOverdue ? " (past target date)" : ""
          }`,
          source: "linear",
          data: milestone,
        });
      } else if (completionRate < 50 && isOverdue) {
        didntGoWell.push({
          title: `Milestone "${milestone.name}" is behind schedule`,
          details: `Only ${completionRate}% complete (${milestone.completed}/${milestone.total}) and past target date`,
          source: "linear",
          data: milestone,
        });

        actionItems.push({
          title: `Review and re-scope milestone: ${milestone.name}`,
          priority: "high",
          assignee: "team",
          details: "Milestone is overdue with low completion rate",
        });
      }
    });

    return { wentWell, didntGoWell, actionItems };
  }
}

export default LinearService;
