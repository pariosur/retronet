# LLM Service Infrastructure

This module provides the base infrastructure for integrating Large Language Models (LLMs) into the retro insights generator.

## Components

### BaseLLMProvider
Abstract base class that defines the interface all LLM providers must implement.

**Key Features:**
- Data sanitization to remove sensitive information
- Common interface for all providers
- Built-in error handling and validation

### LLMServiceFactory
Factory class for creating and managing LLM provider instances.

**Key Features:**
- Provider registration and instantiation
- Configuration validation
- Environment-based configuration
- Provider testing utilities

### LLMConfig
Configuration helper for managing LLM settings.

**Key Features:**
- Environment variable parsing
- Configuration validation
- Status checking utilities

## Usage

### Basic Setup

```javascript
import { LLMServiceFactory, LLMConfig } from './services/llm/index.js';

// Check if LLM is configured
if (LLMConfig.isEnabled()) {
  const config = LLMConfig.fromEnvironment();
  const provider = LLMServiceFactory.createProvider(config);
  
  // Use the provider
  const insights = await provider.generateInsights(teamData, context);
}
```

### Environment Configuration

Add these variables to your `.env` file:

```bash
# Basic LLM Configuration
LLM_PROVIDER=openai
LLM_ENABLED=true
LLM_PRIVACY_MODE=false

# OpenAI Configuration
OPENAI_API_KEY=your_openai_key_here
OPENAI_MODEL=gpt-3.5-turbo

# Optional Performance Settings
LLM_TIMEOUT=30000
LLM_MAX_TOKENS=4000
LLM_TEMPERATURE=0.7
```

### Creating Custom Providers

```javascript
import { BaseLLMProvider } from './services/llm/index.js';

class CustomProvider extends BaseLLMProvider {
  async generateInsights(teamData, context) {
    // Sanitize data before processing
    const sanitizedData = this.sanitizeData(teamData);
    
    // Your custom LLM logic here
    return {
      wentWell: ['Custom insight'],
      didntGoWell: ['Custom issue'],
      actionItems: ['Custom action']
    };
  }

  async validateConnection() {
    // Test your provider connection
    return true;
  }
}

// Register the provider
LLMServiceFactory.registerProvider('custom', CustomProvider);
```

## Testing

Run the test suite:

```bash
npm test
```

The tests cover:
- Base provider functionality
- Factory operations
- Configuration validation
- Data sanitization
- Error handling

## Security

The LLM service includes built-in data sanitization that removes:
- Email addresses
- API keys and tokens
- Personal identifiers

Always review the sanitization patterns in `BaseLLMProvider._sanitizeString()` to ensure they meet your security requirements.