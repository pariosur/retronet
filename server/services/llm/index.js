/**
 * LLM Service Module
 * Exports the main LLM service components for use throughout the application
 */

import { LLMServiceFactory } from './LLMServiceFactory.js';
import { OpenAIProvider } from './OpenAIProvider.js';
import { AnthropicProvider } from './AnthropicProvider.js';
import { LocalModelProvider } from './LocalModelProvider.js';
import { GeminiProvider } from './providers/GeminiProvider.js';

// Register providers with the factory
LLMServiceFactory.registerProvider('openai', OpenAIProvider);
LLMServiceFactory.registerProvider('anthropic', AnthropicProvider);
LLMServiceFactory.registerProvider('local', LocalModelProvider);
LLMServiceFactory.registerProvider('gemini', GeminiProvider);

export { BaseLLMProvider } from './BaseLLMProvider.js';
export { LLMServiceFactory } from './LLMServiceFactory.js';
export { LLMConfig } from './config.js';
export { OpenAIProvider } from './OpenAIProvider.js';
export { AnthropicProvider } from './AnthropicProvider.js';
export { LocalModelProvider } from './LocalModelProvider.js';
export { GeminiProvider } from './providers/GeminiProvider.js';
export { PromptBuilder } from './PromptBuilder.js';
export { default as ResponseParser } from './ResponseParser.js';
export { LLMAnalyzer } from './LLMAnalyzer.js';