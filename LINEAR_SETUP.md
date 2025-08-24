# Linear API Setup

To integrate with Linear, you'll need to get an API key from your Linear workspace.

## Getting Your Linear API Key

1. **Go to Linear Settings**:

   - Open Linear in your browser
   - Click on your profile picture (top right)
   - Select "Settings" from the dropdown

2. **Navigate to API Keys**:

   - In the left sidebar, look for "Account" section
   - Click "API" or "API Keys"
   - Or try going directly to: https://linear.app/settings/api

3. **Create New Key**:

   - Click "Create API key" or "New API key"
   - Give it a name like "Retro Assistant"
   - Select appropriate scopes (read access)
   - Copy the generated key

4. **Add to Environment**:
   - Copy `server/.env.example` to `server/.env`
   - Add your key: `LINEAR_API_KEY=lin_api_your_key_here`

## Testing the Connection

1. Start the server: `npm run server`
2. Visit: http://localhost:3001/api/test-linear
3. You should see a success message with your user info

## Permissions

The API key will have access to:

- Read issues and their states
- Read team members and assignments
- Read comments and activity

No write permissions are needed for the retro assistant.

## Troubleshooting

- **401 Unauthorized**: Check that your API key is correct
- **403 Forbidden**: Make sure the key has read access to your workspace
- **Network errors**: Verify you can access api.linear.app from your network
