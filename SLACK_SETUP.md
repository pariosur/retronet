# Slack Bot Setup

To integrate with Slack, you'll need to create a Slack app and get a bot token.

## Creating a Slack App

1. **Go to Slack API**:

   - Visit https://api.slack.com/apps
   - Click "Create New App"
   - Choose "From scratch"

2. **Configure Your App**:

   - App Name: "Retro Assistant"
   - Workspace: Select your team's workspace
   - Click "Create App"

3. **Set Bot Permissions**:

   - Go to "OAuth & Permissions" in the sidebar
   - Scroll to "Scopes" → "Bot Token Scopes"
   - Add these scopes:
     - `channels:history` - Read messages from public channels
     - `channels:read` - View basic info about public channels
     - `groups:history` - Read messages from private channels (if needed)
     - `groups:read` - View basic info about private channels (if needed)

4. **Install to Workspace**:

   - Click "Install to Workspace" at the top
   - Review permissions and click "Allow"
   - Copy the "Bot User OAuth Token" (starts with `xoxb-`)

5. **Add to Environment**:
   - Add to `server/.env`: `SLACK_BOT_TOKEN=xoxb-your-token-here`

## Testing the Connection

1. Start the server: `npm run server`
2. Visit: http://localhost:3001/api/test-slack
3. You should see a success message with your team info

## What Data We Collect

The bot will analyze:

- **Message sentiment** - Positive vs negative language
- **Team communication patterns** - Activity levels, participation
- **Process mentions** - Standups, deployments, releases
- **Celebration indicators** - Success reactions and messages

## Privacy & Access Control

**Important**: The bot can ONLY access channels it's explicitly invited to:

- ✅ **Public channels** - Only after `/invite @retro-assistant`
- ✅ **Private channels** - Only if someone invites the bot
- ❌ **Direct messages** - Bot cannot access DMs between users
- ❌ **Other private channels** - No access unless explicitly invited

**Recommended channels to add the bot to**:

- `#general` or `#team`
- `#engineering` or `#dev`
- `#standups` or `#daily`
- Any team-specific channels you want analyzed

**Data handling**:

- Bot only reads messages, never writes
- No message content is stored permanently
- Only sentiment patterns and keywords are analyzed
- All analysis happens locally on your server

## Troubleshooting

- **403 Forbidden**: Bot needs to be added to channels you want to analyze
- **Missing scope**: Add required permissions in OAuth & Permissions
- **Invalid token**: Make sure you copied the Bot User OAuth Token, not User OAuth Token
