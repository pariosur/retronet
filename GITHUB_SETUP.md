# GitHub Personal Access Token Setup

To integrate with GitHub, you'll need to create a Personal Access Token (PAT).

## Creating a GitHub Personal Access Token

1. **Go to GitHub Settings**:

   - Visit https://github.com/settings/tokens
   - Or: GitHub profile → Settings → Developer settings → Personal access tokens → Tokens (classic)

2. **Generate New Token**:

   - Click "Generate new token" → "Generate new token (classic)"
   - Note: "Retro Assistant"
   - Expiration: Choose appropriate timeframe (30-90 days recommended)

3. **Select Scopes**:

   - ✅ `repo` - Full control of private repositories (includes company repos)
   - ✅ `read:user` - Read user profile data
   - ✅ `read:org` - Read organization data (required for company repos)

4. **Generate and Copy**:

   - Click "Generate token"
   - Copy the token immediately (you won't see it again!)
   - Token format: `ghp_xxxxxxxxxxxxxxxxxxxx`

5. **Authorize for Organization** (if using company repos with SSO):

   - Go back to https://github.com/settings/tokens
   - Look for your newly created token in the list
   - If your organization uses SAML SSO, you'll see "Configure SSO" or "Authorize" next to organization names
   - Click "Authorize" for each organization you need access to
   - Note: This only appears if your company has SAML SSO enabled
   - If you don't see this option, your token should work with company repos automatically

6. **Add to Environment**:
   - Add to `server/.env`: `GITHUB_TOKEN=ghp_your_token_here`

## Testing the Connection

1. Start the server: `npm run server`
2. Visit: http://localhost:3001/api/test-github
3. You should see a success message with your GitHub username

## What Data We Analyze

The integration analyzes:

- **Commits** - Development activity and patterns
- **Pull Requests** - Code review process and collaboration
- **Repository Activity** - Which repos are most active
- **Review Patterns** - Code review engagement
- **PR Size Analysis** - Large vs small changes

## Insights Generated

### Positive Signals:

- Active commit activity
- Good PR merge rates
- Strong code review culture
- Consistent development patterns

### Areas for Improvement:

- PR review bottlenecks
- Large, hard-to-review PRs
- Low code review engagement
- Inactive development periods

## Privacy & Access

- Token only accesses repositories you have access to
- No write permissions - read-only analysis
- Respects GitHub's API rate limits
- All analysis happens locally on your server

## Repository Selection

By default, the tool analyzes your 5 most recently updated repositories. In the future, we can add configuration to specify which repos to include.

## Troubleshooting

- **401 Unauthorized**: Check that your token is correct and not expired
- **403 Forbidden**: Token may need additional scopes
- **404 Not Found**: Repository may be private and token lacks access
- **Rate limiting**: GitHub API has rate limits - tool will warn if hit
