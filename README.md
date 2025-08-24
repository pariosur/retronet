# Retro Assistant

AI-powered retro meeting assistant that analyzes your team's Linear tickets, Slack messages, and GitHub activity to generate meaningful insights for sprint retrospectives.

## Features

- **Automated Data Collection**: Integrates with Linear, Slack, and GitHub
- **AI-Powered Analysis**: Uses OpenAI to generate insights from team data
- **Three Key Categories**: What went well, what didn't go well, and action items
- **Interactive UI**: Expandable details, copy/export functionality
- **Team-Focused**: Configurable date ranges and team member filtering

## Quick Start

1. **Install dependencies**:
   ```bash
   npm run install-all
   ```

2. **Set up environment variables**:
   ```bash
   cp server/.env.example server/.env
   # Edit server/.env with your API keys
   ```

3. **Start the development servers**:
   ```bash
   npm run dev
   ```

4. **Open your browser**:
   - Frontend: http://localhost:5173
   - Backend: http://localhost:3001

## Environment Variables

Create `server/.env` with:

```env
PORT=3001
OPENAI_API_KEY=your_openai_key_here
LINEAR_API_KEY=your_linear_key_here
SLACK_BOT_TOKEN=your_slack_token_here
GITHUB_TOKEN=your_github_token_here
```

## API Endpoints

- `GET /api/health` - Health check
- `POST /api/generate-retro` - Generate retro insights

## Tech Stack

- **Backend**: Node.js, Express, OpenAI API
- **Frontend**: React, Vite, Tailwind CSS
- **Integrations**: Linear API, Slack API, GitHub API

## Development

The project uses a monorepo structure:
- `/server` - Express.js backend
- `/client` - React frontend
- Root package.json manages both with concurrently

## Next Steps

1. Implement Linear API integration
2. Add Slack API integration  
3. Add GitHub API integration
4. Implement OpenAI analysis
5. Add OAuth flows for API authentication
6. Add data persistence
7. Implement export functionality

## Contributing

This is a hackathon project - feel free to contribute improvements!