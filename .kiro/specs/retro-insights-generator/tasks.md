# Implementation Plan

- [x] 1. Set up LLM service infrastructure and base interfaces

  - Create base LLM provider interface with common methods for all providers
  - Implement LLM service factory for provider instantiation and management
  - Add environment configuration for LLM settings (API keys, models, timeouts)
  - Write unit tests for factory and base interface functionality
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 2. Implement data sanitization system

  - Create DataSanitizer class with methods for each data source (GitHub, Linear, Slack)
  - Implement email, token, and personal identifier removal/masking logic
  - Add configurable privacy levels (strict, moderate, minimal)
  - Write comprehensive tests for sanitization edge cases and privacy compliance
  - _Requirements: 6.1, 6.2, 6.3_

- [x] 3. Create OpenAI provider implementation

  - Implement OpenAI-specific LLM provider class extending base interface
  - Add GPT-4 and GPT-3.5-turbo model support with token optimization
  - Implement rate limiting, retry logic, and error handling for OpenAI API
  - Write integration tests with mocked OpenAI responses
  - _Requirements: 2.1, 5.1, 5.3_

- [x] 4. Develop prompt engineering system

  - Create PromptBuilder class for generating optimized LLM prompts from team data
  - Implement context-aware prompt templates for different data combinations
  - Add token counting and prompt optimization to stay within model limits
  - Write tests for prompt generation with various data scenarios
  - _Requirements: 4.1, 4.2, 4.3, 5.1_

- [x] 5. Implement LLM response parsing and validation

  - Create ResponseParser class to convert LLM text responses to structured insights
  - Implement JSON parsing with fallback to text extraction for malformed responses
  - Add validation for required insight fields (title, details, source attribution)
  - Write tests for parsing various LLM response formats and error cases
  - _Requirements: 1.2, 3.1, 3.2_

- [x] 6. Create main LLM analyzer service

  - Implement LLMAnalyzer class that orchestrates the complete analysis workflow
  - Add methods for data preparation, prompt generation, LLM calling, and response processing
  - Implement timeout handling and graceful fallback to rule-based analysis
  - Write integration tests for complete LLM analysis pipeline
  - _Requirements: 1.1, 1.4, 5.2, 5.4_

- [x] 7. Implement insight merger and deduplication

  - Create InsightMerger class to combine rule-based and LLM insights
  - Implement similarity detection to identify and merge duplicate insights from different sources
  - Add source attribution and confidence scoring for merged insights
  - Write tests for various merging scenarios and edge cases
  - _Requirements: 1.3, 3.1, 3.2, 3.3_

- [x] 8. Integrate LLM analysis into existing retro endpoint

  - Modify `/api/generate-retro` endpoint to include LLM analysis alongside rule-based analysis
  - Add parallel processing of rule-based and LLM analysis for performance
  - Implement configuration checks to enable/disable LLM features based on setup
  - Write integration tests for the enhanced retro generation endpoint
  - _Requirements: 1.1, 1.4, 2.3_

- [x] 9. Add LLM configuration validation and testing endpoints

  - Create `/api/test-llm` endpoint for validating LLM provider configuration
  - Implement configuration validation logic for different providers
  - Add health check functionality to verify LLM connectivity before analysis
  - Write tests for configuration validation and error handling scenarios
  - _Requirements: 2.2, 2.3_

- [x] 10. Implement Anthropic provider support

  - Create Anthropic-specific LLM provider class with Claude model support
  - Implement Anthropic API integration with proper prompt formatting
  - Add Anthropic-specific error handling and rate limiting
  - Write integration tests for Anthropic provider functionality
  - _Requirements: 2.1_

- [x] 11. Add enhanced insight display with source attribution

  - Modify ResultsPage component to display AI vs rule-based insight sources
  - Add visual indicators (badges) to distinguish between insight types
  - Implement expandable sections showing AI reasoning and confidence scores
  - Write component tests for new insight display features
  - _Requirements: 3.1, 3.2, 3.4_

- [x] 12. Create LLM configuration management system

  - Add LLM configuration section to SetupPage component
  - Implement provider selection, API key input, and model configuration UI
  - Add configuration testing and validation feedback in the UI
  - Write component tests for configuration management interface
  - _Requirements: 2.1, 2.2, 2.3_

- [x] 13. Implement local model provider support

  - Create LocalModelProvider class for Ollama and other local LLM integration
  - Add local model discovery and availability checking
  - Implement local inference with appropriate timeout and error handling
  - Write tests for local model provider functionality and edge cases
  - _Requirements: 2.1, 6.4_

- [x] 14. Add performance monitoring and optimization

  - Implement token usage tracking and cost estimation for external providers
  - Add response time monitoring and performance metrics collection
  - Create optimization logic for prompt size and model selection based on data volume
  - Write tests for performance monitoring and optimization features
  - _Requirements: 5.1, 5.2_

- [x] 15. Enhance error handling and user feedback

  - Implement comprehensive error handling for all LLM-related failures
  - Add user-friendly error messages and fallback notifications
  - Create progress indicators for LLM analysis with estimated completion times
  - Write tests for error scenarios and user feedback mechanisms
  - _Requirements: 1.4, 5.2, 5.4_

- [x] 16. Add advanced insight categorization and filtering

  - Implement insight categorization system (technical, process, team dynamics)
  - Add filtering and sorting options for insights based on source and category
  - Create insight priority scoring based on confidence and impact
  - Write tests for categorization and filtering functionality
  - _Requirements: 4.4_

- [x] 17. Implement insight export with source attribution

  - Modify export functionality to include LLM vs rule-based source information
  - Add detailed insight metadata in exported formats (confidence, reasoning)
  - Create multiple export formats (markdown, JSON, CSV) with full attribution
  - Write tests for enhanced export functionality with source tracking
  - _Requirements: 3.4_

- [x] 18. Create comprehensive integration tests
  - Write end-to-end tests for complete LLM-enhanced retro generation workflow
  - Add tests for various provider configurations and fallback scenarios
  - Implement performance tests to ensure LLM integration doesn't degrade system performance
  - Create tests for data privacy and sanitization compliance
  - _Requirements: 1.1, 1.4, 6.1, 6.2, 6.3_

- [ ] 19. Fix critical data processing and GPT-5 integration issues
  - Fix DataSanitizer to properly remove sensitive data instead of just detecting it
  - Update PerformanceOptimizer to respect configured GPT-5 model instead of overriding
  - Fix token limit handling for GPT-5's higher capacity (32k+ tokens)
  - Resolve empty LLM response parsing for GPT-5 Responses API format
  - Add proper GPT-5 model characteristics to performance optimizer
  - _Requirements: 2.1, 5.1, 6.1, 6.2_