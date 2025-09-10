# Sample Data for Hackathon Demos

This folder contains realistic synthetic datasets that match the exact shapes the server consumes when collecting data from GitHub, Linear, and Slack. These can be used to demo the experience without real API keys.

Files:
- `github.activity.sample.json`: { commits: Commit[], pullRequests: PullRequest[] } as returned by our GitHub ingestion.
- `linear.issues.sample.json`: { issues: IssueNode[] } matching the GraphQL `issues.nodes` selection in `LinearService`.
- `slack.messages.sample.json`: { messages: Message[] } matching `conversations.history`, augmented with `channel` and `channelId` like `SlackService.getTeamChannelMessages` does.
- `demo.insights.json`: Pre-generated retro insights shown when in demo mode, containing wentWell[], didntGoWell[], and actionItems[] arrays.

How to use:
1. Start the server normally.
2. POST to `/api/generate-retro` but temporarily wire a small shim (or add a feature flag) to load these JSONs instead of calling APIs. For a quick local hack, you can replace calls to:
   - `githubService.getTeamActivity(...)` with reading `server/sample-data/github.activity.sample.json`
   - `linearService.getIssuesInDateRange(...)` with reading `server/sample-data/linear.issues.sample.json` and returning `.issues`
   - `slackService.getTeamChannelMessages(...)` with reading `server/sample-data/slack.messages.sample.json` and returning `.messages`

Shapes expected downstream (see `server/services/llm/TemporalDataProcessor.js`):
- GitHub commits use `commit.author.date`, `commit.message`, `author.login`, `html_url`, and optional `stats`, `files`.
- GitHub PRs use `number`, `title`, `user.login`, `state`, `html_url`, `repo`, and optional `additions`, `deletions`, `commits`, `comments`, `review_comments`, `created_at`, `updated_at`, `merged_at`, `closed_at`, `merged_by.login`.
- Linear issues use `id`, `title`, `description`, `assignee.name`, `state.name|type`, `createdAt`, `updatedAt`, `completedAt`, `estimate`, `priority`, `labels.nodes[{name,color}]`, `project{name}`, `team{name}`, `comments.nodes[{body,createdAt,user{name}}]`.
- Slack messages use `text`, `user`, `ts` (or `timestamp`), `channel`, `channelId`, and optional `reactions[{name,count}]`, `thread_ts`, `reply_count`.

Note: Data is fictional and free of secrets. You can further anonymize by running it through `DataSanitizer` if needed.
