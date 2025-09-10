/* eslint-disable */
import fs from 'fs';
import path from 'path';

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

function randomHex(len = 7) {
  const chars = 'abcdef0123456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[randomInt(0, chars.length - 1)];
  return out;
}

function randomDateWithin(daysBack = 10) {
  const now = Date.now();
  const past = now - daysBack * 24 * 60 * 60 * 1000;
  const ts = randomInt(past, now);
  return new Date(ts);
}

function toIso(d) {
  return d.toISOString();
}

function toSlackTs(d) {
  // seconds.millis string
  const seconds = Math.floor(d.getTime() / 1000);
  const millis = (d.getTime() % 1000).toString().padStart(6, '0');
  return `${seconds}.${millis}`;
}

const people = [
  { login: 'alice', name: 'Alice Johnson', email: 'alice@example.com', id: 1001 },
  { login: 'bob', name: 'Bob Smith', email: 'bob@example.com', id: 1002 },
  { login: 'charlie', name: 'Charlie Kim', email: 'charlie@example.com', id: 1003 },
  { login: 'dana', name: 'Dana Lee', email: 'dana@example.com', id: 1004 },
  { login: 'eric', name: 'Eric Wu', email: 'eric@example.com', id: 1005 }
];

const repos = [
  { owner: 'acme', name: 'app' },
  { owner: 'acme', name: 'api' },
  { owner: 'acme', name: 'mobile' }
];

const channels = [
  { id: 'CDEV001', name: 'dev' },
  { id: 'CENG001', name: 'engineering' },
  { id: 'CGEN001', name: 'general' },
  { id: 'CSTAND', name: 'standup' }
];

const commitMessages = [
  'feat: add login form validation',
  'fix: resolve race condition in broker',
  'chore: update dependencies',
  'refactor: extract auth middleware',
  'docs: improve README',
  'perf: cache computed results',
  'ci: speed up build by caching node_modules',
  'chore: deploy v1.2.x to production'
];

const prTitles = [
  'Add user authentication with session management',
  'Refactor build pipeline and caching',
  'Fix flaky tests in CI',
  'Implement feature flags for rollout',
  'Improve performance of search endpoint'
];

const slackTexts = [
  'Standup: finished auth flow, starting cache improvements 🚀',
  'Blocked on flaky CI. Seeing error on node 18 builds.',
  'We shipped v1.2.x to prod today 🎉 great job team!',
  'Can someone review PR #124?',
  'Thanks everyone for the quick turnaround 👏',
  'The deploy went smoothly ✅',
  'Planning: let’s review priorities in the afternoon',
  'Bug appears in staging only, investigating now'
];

const linearLabels = [
  { name: 'feature', color: '#0f62fe' },
  { name: 'bug', color: '#da1e28' },
  { name: 'enhancement', color: '#24a148' }
];

function generateGithubData(count = 50) {
  const commits = [];
  const pullRequests = [];

  for (let i = 0; i < count; i++) {
    const person = randomChoice(people);
    const repo = randomChoice(repos);
    const d = randomDateWithin(14);
    const additions = randomInt(1, 900);
    const deletions = randomInt(0, Math.min(300, additions));
    const sha = randomHex(7);
    commits.push({
      sha,
      commit: {
        author: { name: person.name, email: person.email, date: toIso(d) },
        committer: { name: person.name, email: person.email, date: toIso(d) },
        message: randomChoice(commitMessages)
      },
      author: {
        login: person.login,
        id: person.id,
        avatar_url: `https://avatars.githubusercontent.com/u/${person.id}?v=4`,
        html_url: `https://github.com/${person.login}`
      },
      html_url: `https://github.com/${repo.owner}/${repo.name}/commit/${sha}`,
      url: `https://api.github.com/repos/${repo.owner}/${repo.name}/commits/${sha}`,
      repo: `${repo.owner}/${repo.name}`,
      stats: { additions, deletions, total: additions + deletions },
      files: [
        { filename: `client/src/components/Comp${randomInt(1,20)}.jsx`, additions: randomInt(1, additions), deletions: randomInt(0, deletions), changes: additions + deletions }
      ]
    });
  }

  for (let i = 0; i < count; i++) {
    const repo = randomChoice(repos);
    const author = randomChoice(people);
    const reviewer = randomChoice(people);
    const created = randomDateWithin(14);
    const updated = new Date(created.getTime() + randomInt(1, 3) * 60 * 60 * 1000);
    const closed = Math.random() > 0.5 ? new Date(updated.getTime() + randomInt(1, 3) * 60 * 60 * 1000) : null;
    const merged = closed && Math.random() > 0.5 ? closed : null;
    const additions = randomInt(10, 1200);
    const deletions = randomInt(0, 600);

    pullRequests.push({
      number: 100 + i,
      title: randomChoice(prTitles),
      state: merged ? 'closed' : (closed ? 'closed' : 'open'),
      created_at: toIso(created),
      updated_at: toIso(updated),
      closed_at: closed ? toIso(closed) : null,
      merged_at: merged ? toIso(merged) : null,
      user: { login: author.login },
      merged_by: merged ? { login: reviewer.login } : null,
      html_url: `https://github.com/${repo.owner}/${repo.name}/pull/${100 + i}`,
      repo: `${repo.owner}/${repo.name}`,
      additions,
      deletions,
      commits: randomInt(1, 10),
      comments: randomInt(0, 12),
      review_comments: randomInt(0, 18)
    });
  }

  return { commits, pullRequests };
}

function generateLinearIssues(count = 50) {
  const issues = [];
  for (let i = 0; i < count; i++) {
    const person = Math.random() > 0.2 ? randomChoice(people) : null;
    const created = randomDateWithin(14);
    const updated = new Date(created.getTime() + randomInt(1, 6) * 60 * 60 * 1000);
    const isCompleted = Math.random() > 0.5;
    const completed = isCompleted ? new Date(updated.getTime() + randomInt(1, 24) * 60 * 60 * 1000) : null;
    const label = randomChoice(linearLabels);
    const priority = randomInt(0, 4);

    issues.push({
      id: `lin_${randomHex(8)}`,
      title: randomChoice([
        'Implement OAuth login flow',
        'Fix race condition in message broker',
        'Improve CI cache to speed up builds',
        'Add export functionality',
        'Enhance error handling and retries'
      ]),
      description: randomChoice([
        'As a user I can log in with OAuth.',
        'Occasional duplicate deliveries observed.',
        'Cache node_modules and Docker layers.',
        'Allow users to export retros to CSV.',
        'Improve resilience to transient failures.'
      ]),
      state: isCompleted ? { name: 'Done', type: 'completed' } : randomChoice([
        { name: 'In Progress', type: 'started' },
        { name: 'Backlog', type: 'triage' }
      ]),
      assignee: person ? { name: person.name, email: person.email } : null,
      createdAt: toIso(created),
      updatedAt: toIso(updated),
      completedAt: completed ? toIso(completed) : null,
      estimate: randomInt(1, 8),
      priority,
      priorityLabel: ['None','Low','Medium','High','Urgent'][priority],
      labels: { nodes: [ label ] },
      project: { id: `proj_${randomHex(4)}`, name: randomChoice(['User Platform','Messaging','DX','Observability']), targetDate: Math.random() > 0.5 ? toIso(randomDateWithin(30)).slice(0,10) : null },
      projectMilestone: Math.random() > 0.6 ? { id: `mile_${randomHex(4)}`, name: randomChoice(['MVP','Beta','GA']), targetDate: toIso(randomDateWithin(45)).slice(0,10) } : null,
      team: { id: `team_${randomHex(4)}`, name: randomChoice(['Core','Platform','Product']) },
      comments: { nodes: Array.from({ length: randomInt(0, 5) }).map(() => ({
        body: randomChoice(['Reviewed and approved','Investigating logs','Please add tests','Looks good','Need to rebase']),
        createdAt: toIso(randomDateWithin(10)),
        user: { name: randomChoice(people).name }
      })) }
    });
  }
  return { issues };
}

function generateSlackMessages(count = 50) {
  const messages = [];
  for (let i = 0; i < count; i++) {
    const d = randomDateWithin(14);
    const ch = randomChoice(channels);
    const replies = Math.random() > 0.7 ? randomInt(1, 6) : 0;
    const reactionsMaybe = Math.random() > 0.5 ? [ { name: randomChoice(['rocket','tada','thumbsup','fire','warning']), count: randomInt(1, 6), users: [] } ] : undefined;

    messages.push({
      type: 'message',
      user: `U${randomInt(10000, 99999)}`,
      text: randomChoice(slackTexts),
      ts: toSlackTs(d),
      thread_ts: replies > 0 ? toSlackTs(new Date(d.getTime() + 30000)) : null,
      reply_count: replies,
      reactions: reactionsMaybe,
      channel: ch.name,
      channelId: ch.id
    });
  }
  return { messages };
}

function writeJSON(filename, data) {
  const outPath = path.resolve(process.cwd(), 'server/sample-data', filename);
  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), 'utf-8');
  console.log('Wrote', filename);
}

function main() {
  const github = generateGithubData(50);
  const linear = generateLinearIssues(50);
  const slack = generateSlackMessages(50);

  writeJSON('github.activity.sample.large.json', github);
  writeJSON('linear.issues.sample.large.json', linear);
  writeJSON('slack.messages.sample.large.json', slack);
}

main();
