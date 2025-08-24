import axios from 'axios';

class GitHubService {
  constructor(token) {
    this.token = token;
    this.baseURL = 'https://api.github.com';
  }

  async makeRequest(endpoint, params = {}) {
    try {
      const response = await axios.get(`${this.baseURL}${endpoint}`, {
        headers: {
          'Authorization': `token ${this.token}`,
          'Accept': 'application/vnd.github.v3+json'
        },
        params
      });

      return response.data;
    } catch (error) {
      console.error('GitHub API request failed:', error.message);
      if (error.response?.data) {
        console.error('GitHub API error details:', error.response.data);
      }
      throw error;
    }
  }

  async getUserRepos() {
    const data = await this.makeRequest('/user/repos', {
      sort: 'updated',
      per_page: 20,
      affiliation: 'owner,collaborator,organization_member'
    });
    return data;
  }

  async getRepoActivity(owner, repo, startDate, endDate) {
    const since = new Date(startDate).toISOString();
    const until = new Date(endDate).toISOString();

    // Get commits
    const commits = await this.makeRequest(`/repos/${owner}/${repo}/commits`, {
      since,
      until,
      per_page: 50
    });

    // Get pull requests - GitHub API doesn't support date filtering for PRs
    // So we get recent ones and filter, but we should get more to ensure coverage
    const pullRequests = await this.makeRequest(`/repos/${owner}/${repo}/pulls`, {
      state: 'all',
      sort: 'updated', 
      direction: 'desc',
      per_page: 50 // Reduced for high-activity teams
    });

    // Filter PRs by date range
    const filteredPRs = pullRequests.filter(pr => {
      const updatedAt = new Date(pr.updated_at);
      return updatedAt >= new Date(startDate) && updatedAt <= new Date(endDate);
    });

    console.log(`GitHub ${owner}/${repo}: ${commits.length} commits, ${filteredPRs.length}/${pullRequests.length} PRs in date range`);

    return { commits, pullRequests: filteredPRs };
  }

  async getTeamActivity(startDate, endDate, teamRepos = []) {
    let allCommits = [];
    let allPullRequests = [];

    // If no specific repos provided, use both Metal repos
    let repos = teamRepos;
    if (repos.length === 0) {
      repos = [
        { owner: 'getmetal', name: 'metal-backend' },
        { owner: 'getmetal', name: 'wizard-web' }
      ];
    }

    console.log(`Fetching GitHub activity from ${repos.length} repositories`);

    for (const repo of repos) {
      try {
        const { commits, pullRequests } = await this.getRepoActivity(repo.owner, repo.name, startDate, endDate);
        
        allCommits.push(...commits.map(commit => ({
          ...commit,
          repo: `${repo.owner}/${repo.name}`
        })));
        
        allPullRequests.push(...pullRequests.map(pr => ({
          ...pr,
          repo: `${repo.owner}/${repo.name}`
        })));
      } catch (error) {
        console.warn(`Failed to fetch activity from ${repo.owner}/${repo.name}:`, error.message);
      }
    }

    return { commits: allCommits, pullRequests: allPullRequests };
  }

  analyzeActivityForRetro(commits, pullRequests) {
    const wentWell = [];
    const didntGoWell = [];
    const actionItems = [];

    console.log(`GitHub analysis: ${commits.length} commits, ${pullRequests.length} PRs`);

    // Analyze commits
    const uniqueAuthors = new Set(commits.map(c => c.author?.login).filter(Boolean)).size;
    const avgCommitsPerAuthor = commits.length / (uniqueAuthors || 1);

    // Analyze commit patterns
    const commitsByDay = {};
    commits.forEach(commit => {
      const day = new Date(commit.commit.author.date).toDateString();
      commitsByDay[day] = (commitsByDay[day] || 0) + 1;
    });

    const activeDays = Object.keys(commitsByDay).length;
    const avgCommitsPerDay = commits.length / (activeDays || 1);

    // Analyze pull requests
    const mergedPRs = pullRequests.filter(pr => pr.merged_at);
    const openPRs = pullRequests.filter(pr => pr.state === 'open');
    const closedPRs = pullRequests.filter(pr => pr.state === 'closed' && !pr.merged_at);

    // PR review analysis
    const prsWithReviews = pullRequests.filter(pr => pr.comments > 0 || pr.review_comments > 0);
    const largePRs = pullRequests.filter(pr => pr.additions + pr.deletions > 500);

    // Positive insights
    if (commits.length > 0) {
      wentWell.push({
        title: `${commits.length} commits from ${uniqueAuthors} contributors`,
        details: `Active development with ${avgCommitsPerDay.toFixed(1)} commits per day`,
        source: 'github',
        data: { commits: commits.length, authors: uniqueAuthors, activeDays }
      });
    }

    if (mergedPRs.length > 0) {
      wentWell.push({
        title: `${mergedPRs.length} pull requests merged successfully`,
        details: `Good code collaboration and review process`,
        source: 'github',
        data: { mergedPRs: mergedPRs.length, totalPRs: pullRequests.length }
      });
    }

    // Check for good review practices
    const reviewRate = (prsWithReviews.length / pullRequests.length) * 100;
    if (reviewRate > 70 && pullRequests.length > 0) {
      wentWell.push({
        title: `Strong code review culture`,
        details: `${reviewRate.toFixed(1)}% of PRs had reviews or discussions`,
        source: 'github',
        data: { reviewRate, reviewedPRs: prsWithReviews.length }
      });
    }

    // Negative insights
    if (openPRs.length > mergedPRs.length && openPRs.length > 3) {
      didntGoWell.push({
        title: `${openPRs.length} pull requests still open`,
        details: `More open PRs than merged - potential review bottleneck`,
        source: 'github',
        data: { openPRs: openPRs.length, mergedPRs: mergedPRs.length }
      });

      actionItems.push({
        title: 'Review and merge pending pull requests',
        priority: 'medium',
        assignee: 'team',
        details: 'High number of open PRs may indicate review bottleneck'
      });
    }

    if (largePRs.length > 0) {
      didntGoWell.push({
        title: `${largePRs.length} large pull requests (>500 lines)`,
        details: 'Large PRs are harder to review and more error-prone',
        source: 'github',
        data: { largePRs: largePRs.map(pr => ({ title: pr.title, changes: pr.additions + pr.deletions })) }
      });

      actionItems.push({
        title: 'Break down large changes into smaller PRs',
        priority: 'medium',
        assignee: 'team',
        details: 'Smaller PRs are easier to review and less risky'
      });
    }

    if (reviewRate < 50 && pullRequests.length > 2) {
      didntGoWell.push({
        title: `Low code review engagement`,
        details: `Only ${reviewRate.toFixed(1)}% of PRs had reviews`,
        source: 'github',
        data: { reviewRate, totalPRs: pullRequests.length }
      });

      actionItems.push({
        title: 'Improve code review process',
        priority: 'high',
        assignee: 'team',
        details: 'Consider review assignments or pair programming'
      });
    }

    // Velocity insights
    if (commits.length === 0 && pullRequests.length === 0) {
      didntGoWell.push({
        title: 'No GitHub activity detected',
        details: 'No commits or PRs found in the selected timeframe',
        source: 'github',
        data: { commits: 0, pullRequests: 0 }
      });
    } else if (commits.length < 10 && pullRequests.length < 3) {
      didntGoWell.push({
        title: 'Low development activity',
        details: `Only ${commits.length} commits and ${pullRequests.length} PRs`,
        source: 'github',
        data: { commits: commits.length, pullRequests: pullRequests.length }
      });
    }

    return { wentWell, didntGoWell, actionItems };
  }
}

export default GitHubService;