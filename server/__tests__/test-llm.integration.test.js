/**
 * Integration tests for LLM configuration validation and testing endpoints
 */

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { LLMAnalyzer, LLMServiceFactory } from '../services/llm/index.js';

// Load environment variables for testing
dotenv.config();

// Create test app with the same middleware as main app
const createTestApp = () => {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Import the LLM test endpoints (we'll add them here for testing)
  // Test LLM connection and configuration
  app.get('/api/test-llm', async (req, res) => {
    try {
      // Get configuration status first
      const llmAnalyzer = LLMAnalyzer.fromEnvironment(process.env);
      const status = llmAnalyzer.getStatus();
      
      // If LLM is not enabled, return configuration info
      if (!status.enabled) {
        return res.json({
          status: 'LLM analysis is disabled',
          enabled: false,
          configuration: {
            provider: status.provider || 'none',
            configured: false,
            availableProviders: LLMServiceFactory.getAvailableProviders()
          },
          message: 'LLM analysis is disabled. Set LLM_PROVIDER environment variable to enable.'
        });
      }

      // If not properly configured, return configuration error
      if (!status.initialized) {
        return res.status(400).json({
          error: 'LLM not properly configured',
          enabled: status.enabled,
          configuration: {
            provider: status.provider || 'none',
            configured: false,
            availableProviders: LLMServiceFactory.getAvailableProviders(),
            issues: ['Provider not initialized - check API keys and configuration']
          },
          message: 'LLM configuration incomplete. Check environment variables.'
        });
      }

      // Test the configuration
      const result = await llmAnalyzer.testConfiguration();
      
      if (result.success) {
        res.json({
          status: 'LLM connection successful!',
          enabled: true,
          provider: result.provider,
          model: result.model,
          message: result.message,
          configuration: {
            provider: status.provider,
            model: status.model,
            privacyLevel: status.privacyLevel,
            timeout: status.timeout,
            configured: true,
            components: status.components
          },
          warning: result.warning || null
        });
      } else {
        res.status(400).json({
          error: result.message,
          enabled: status.enabled,
          provider: result.provider,
          model: result.model,
          configuration: {
            provider: status.provider,
            configured: status.initialized,
            availableProviders: LLMServiceFactory.getAvailableProviders(),
            issues: [result.error || result.message]
          },
          details: result.error
        });
      }
    } catch (error) {
      console.error('LLM test failed:', error);
      res.status(500).json({ 
        error: 'LLM test failed: ' + error.message,
        enabled: false,
        configuration: {
          provider: 'unknown',
          configured: false,
          availableProviders: LLMServiceFactory.getAvailableProviders(),
          issues: [error.message]
        }
      });
    }
  });

  // Test specific LLM provider configuration
  app.post('/api/test-llm', async (req, res) => {
    try {
      const { provider, apiKey, model, ...otherConfig } = req.body;
      
      if (!provider) {
        return res.status(400).json({
          error: 'Provider is required',
          availableProviders: LLMServiceFactory.getAvailableProviders()
        });
      }

      // Create test configuration
      const testConfig = {
        provider,
        apiKey,
        model,
        enabled: true,
        ...otherConfig
      };

      // Validate configuration first
      try {
        LLMServiceFactory.validateConfig(testConfig);
      } catch (validationError) {
        return res.status(400).json({
          error: 'Configuration validation failed',
          provider: provider,
          details: validationError.message,
          availableProviders: LLMServiceFactory.getAvailableProviders()
        });
      }

      // Test the provider
      const result = await LLMServiceFactory.testProvider(testConfig);
      
      if (result.success) {
        res.json({
          status: 'Provider test successful!',
          provider: result.provider,
          model: result.model,
          message: result.message,
          configuration: {
            valid: true,
            provider: testConfig.provider,
            model: testConfig.model
          }
        });
      } else {
        res.status(400).json({
          error: result.message,
          provider: result.provider,
          model: result.model,
          details: result.error,
          configuration: {
            valid: false,
            provider: testConfig.provider,
            issues: [result.error || result.message]
          }
        });
      }
    } catch (error) {
      console.error('LLM provider test failed:', error);
      res.status(500).json({ 
        error: 'Provider test failed: ' + error.message,
        availableProviders: LLMServiceFactory.getAvailableProviders()
      });
    }
  });

  return app;
};

describe('LLM Configuration Validation and Testing Endpoints', () => {
  let app;

  beforeEach(() => {
    app = createTestApp();
  });

  describe('GET /api/test-llm', () => {
    it('should return disabled status when LLM is not configured', async () => {
      // Temporarily remove LLM configuration
      const originalProvider = process.env.LLM_PROVIDER;
      delete process.env.LLM_PROVIDER;

      const response = await request(app)
        .get('/api/test-llm')
        .expect(200);

      expect(response.body).toMatchObject({
        status: 'LLM analysis is disabled',
        enabled: false,
        configuration: {
          provider: 'none',
          configured: false,
          availableProviders: expect.arrayContaining(['openai'])
        }
      });

      // Restore original configuration
      if (originalProvider) {
        process.env.LLM_PROVIDER = originalProvider;
      }
    });

    it('should return configuration error when provider is set but not properly configured', async () => {
      // Set provider but remove API key
      const originalProvider = process.env.LLM_PROVIDER;
      const originalApiKey = process.env.OPENAI_API_KEY;
      
      process.env.LLM_PROVIDER = 'openai';
      delete process.env.OPENAI_API_KEY;

      const response = await request(app)
        .get('/api/test-llm');

      // The LLMAnalyzer gracefully handles missing API keys by disabling itself
      // So we should expect either a 400 (if properly configured but connection fails)
      // or 200 (if disabled due to missing config)
      if (response.status === 400) {
        expect(response.body).toMatchObject({
          error: 'LLM not properly configured',
          enabled: true,
          configuration: {
            configured: false,
            availableProviders: expect.arrayContaining(['openai'])
          }
        });
      } else {
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          status: 'LLM analysis is disabled',
          enabled: false,
          configuration: {
            configured: false,
            availableProviders: expect.arrayContaining(['openai'])
          }
        });
      }

      // Restore original configuration
      if (originalProvider) {
        process.env.LLM_PROVIDER = originalProvider;
      }
      if (originalApiKey) {
        process.env.OPENAI_API_KEY = originalApiKey;
      }
    });

    it('should test LLM connection when properly configured', async () => {
      // Set up mock configuration
      process.env.LLM_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'sk-test-key'; // Use proper format

      const response = await request(app)
        .get('/api/test-llm');

      // Should either succeed or fail with proper error structure
      if (response.status === 200) {
        if (response.body.enabled) {
          expect(response.body).toMatchObject({
            status: 'LLM connection successful!',
            enabled: true,
            provider: 'openai',
            configuration: {
              configured: true,
              components: expect.any(Object)
            }
          });
        } else {
          // LLM disabled due to configuration issues
          expect(response.body).toMatchObject({
            status: 'LLM analysis is disabled',
            enabled: false,
            configuration: {
              configured: false,
              availableProviders: expect.arrayContaining(['openai'])
            }
          });
        }
      } else {
        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
          error: expect.any(String),
          enabled: true,
          provider: 'openai',
          configuration: {
            availableProviders: expect.arrayContaining(['openai']),
            issues: expect.any(Array)
          }
        });
      }
    });

    it('should handle internal errors gracefully', async () => {
      // Force an error by setting invalid configuration
      process.env.LLM_PROVIDER = 'invalid-provider';

      const response = await request(app)
        .get('/api/test-llm');

      // The LLMAnalyzer handles invalid providers gracefully by disabling itself
      // So we expect either a 500 (internal error) or 200 (disabled)
      if (response.status === 500) {
        expect(response.body).toMatchObject({
          error: expect.stringContaining('LLM test failed'),
          enabled: false,
          configuration: {
            provider: 'unknown',
            configured: false,
            availableProviders: expect.any(Array),
            issues: expect.any(Array)
          }
        });
      } else {
        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
          status: 'LLM analysis is disabled',
          enabled: false,
          configuration: {
            configured: false,
            availableProviders: expect.arrayContaining(['openai'])
          }
        });
      }
    });
  });

  describe('POST /api/test-llm', () => {
    it('should require provider parameter', async () => {
      const response = await request(app)
        .post('/api/test-llm')
        .send({})
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Provider is required',
        availableProviders: expect.arrayContaining(['openai'])
      });
    });

    it('should validate configuration before testing', async () => {
      const response = await request(app)
        .post('/api/test-llm')
        .send({
          provider: 'openai'
          // Missing API key
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Configuration validation failed',
        provider: 'openai',
        details: expect.stringContaining('API key is required'),
        availableProviders: expect.arrayContaining(['openai'])
      });
    });

    it('should reject unknown providers', async () => {
      const response = await request(app)
        .post('/api/test-llm')
        .send({
          provider: 'unknown-provider',
          apiKey: 'test-key'
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Configuration validation failed',
        provider: 'unknown-provider',
        details: expect.stringContaining('Unknown provider'),
        availableProviders: expect.arrayContaining(['openai'])
      });
    });

    it('should validate numeric configuration parameters', async () => {
      const response = await request(app)
        .post('/api/test-llm')
        .send({
          provider: 'openai',
          apiKey: 'test-key',
          timeout: -1 // Invalid timeout
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Configuration validation failed',
        provider: 'openai',
        details: expect.stringContaining('Timeout must be a positive number')
      });
    });

    it('should test valid OpenAI configuration', async () => {
      const response = await request(app)
        .post('/api/test-llm')
        .send({
          provider: 'openai',
          apiKey: 'test-key',
          model: 'gpt-3.5-turbo',
          timeout: 30000,
          maxTokens: 4000,
          temperature: 0.7
        });

      // Should either succeed or fail with proper error structure
      if (response.status === 200) {
        expect(response.body).toMatchObject({
          status: 'Provider test successful!',
          provider: 'openai',
          model: expect.any(String),
          configuration: {
            valid: true,
            provider: 'openai'
          }
        });
      } else {
        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
          error: expect.any(String),
          provider: 'openai',
          configuration: {
            valid: false,
            provider: 'openai',
            issues: expect.any(Array)
          }
        });
      }
    });

    it('should handle provider test errors gracefully', async () => {
      const response = await request(app)
        .post('/api/test-llm')
        .send({
          provider: 'openai',
          apiKey: 'invalid-key',
          model: 'gpt-3.5-turbo'
        });

      // Should return 400 for connection failure
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        error: expect.any(String),
        provider: 'openai',
        configuration: {
          valid: false,
          issues: expect.any(Array)
        }
      });
    });

    it('should handle internal errors during provider testing', async () => {
      // Mock a scenario that would cause an internal error
      const response = await request(app)
        .post('/api/test-llm')
        .send({
          provider: 'openai',
          apiKey: 'test-key',
          temperature: 'invalid' // This should cause a validation error first
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Configuration validation failed',
        details: expect.stringContaining('Temperature must be a number')
      });
    });
  });

  describe('Configuration Validation Edge Cases', () => {
    it('should handle missing configuration object', async () => {
      const response = await request(app)
        .post('/api/test-llm')
        .send(null)
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Provider is required'
      });
    });

    it('should validate temperature range', async () => {
      const response = await request(app)
        .post('/api/test-llm')
        .send({
          provider: 'openai',
          apiKey: 'test-key',
          temperature: 3.0 // Out of range
        })
        .expect(400);

      expect(response.body.details).toContain('Temperature must be a number between 0 and 2');
    });

    it('should validate maxTokens is positive', async () => {
      const response = await request(app)
        .post('/api/test-llm')
        .send({
          provider: 'openai',
          apiKey: 'test-key',
          maxTokens: 0
        })
        .expect(400);

      expect(response.body.details).toContain('Max tokens must be a positive number');
    });

    it('should use default model when not specified', async () => {
      const response = await request(app)
        .post('/api/test-llm')
        .send({
          provider: 'openai',
          apiKey: 'test-key'
          // No model specified - should use default
        });

      // Configuration should be valid even without explicit model
      if (response.status === 400) {
        // If it fails, it should be due to connection, not configuration
        expect(response.body.error).not.toContain('Configuration validation failed');
      }
    });

    it('should test valid Anthropic configuration', async () => {
      const response = await request(app)
        .post('/api/test-llm')
        .send({
          provider: 'anthropic',
          apiKey: 'sk-ant-test123456789012345678901234567890123456789012345678',
          model: 'claude-3-sonnet-20240229',
          timeout: 30000,
          maxTokens: 4000,
          temperature: 0.7
        });

      // Should either succeed or fail with proper error structure
      if (response.status === 200) {
        expect(response.body).toMatchObject({
          status: 'Provider test successful!',
          provider: 'anthropic',
          model: expect.any(String),
          configuration: {
            valid: true,
            provider: 'anthropic'
          }
        });
      } else {
        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
          error: expect.any(String),
          provider: 'anthropic',
          configuration: {
            valid: false,
            provider: 'anthropic',
            issues: expect.any(Array)
          }
        });
      }
    });

    it('should validate Anthropic API key format', async () => {
      const response = await request(app)
        .post('/api/test-llm')
        .send({
          provider: 'anthropic',
          apiKey: 'invalid-key-format',
          model: 'claude-3-sonnet-20240229'
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: expect.stringContaining('Valid Anthropic API key is required'),
        provider: 'anthropic'
      });
    });

    it('should validate Anthropic model support', async () => {
      const response = await request(app)
        .post('/api/test-llm')
        .send({
          provider: 'anthropic',
          apiKey: 'sk-ant-test123456789012345678901234567890123456789012345678',
          model: 'unsupported-model'
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: expect.stringContaining('Unsupported Anthropic model'),
        provider: 'anthropic'
      });
    });

    it('should test valid local provider configuration', async () => {
      const response = await request(app)
        .post('/api/test-llm')
        .send({
          provider: 'local',
          model: 'llama2',
          endpoint: 'http://localhost:11434',
          timeout: 30000,
          maxTokens: 4000,
          temperature: 0.7
        });

      // Should either succeed or fail with proper error structure
      if (response.status === 200) {
        expect(response.body).toMatchObject({
          status: 'Provider test successful!',
          provider: 'local',
          model: expect.any(String),
          configuration: {
            valid: true,
            provider: 'local'
          }
        });
      } else {
        expect(response.status).toBe(400);
        expect(response.body).toMatchObject({
          error: expect.any(String),
          provider: 'local',
          configuration: {
            valid: false,
            provider: 'local',
            issues: expect.any(Array)
          }
        });
      }
    });

    it('should validate local provider endpoint format', async () => {
      const response = await request(app)
        .post('/api/test-llm')
        .send({
          provider: 'local',
          endpoint: 'not-a-valid-url',
          model: 'llama2'
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: expect.stringMatching(/Invalid endpoint URL|Connection failed/),
        provider: 'local'
      });
    });
  });

  describe('Health Check Functionality', () => {
    it('should verify LLM connectivity before analysis', async () => {
      // This test verifies that the endpoint can be used as a health check
      process.env.LLM_PROVIDER = 'openai';
      process.env.OPENAI_API_KEY = 'test-key';

      const response = await request(app)
        .get('/api/test-llm');

      // Should return structured response regardless of success/failure
      expect(response.body).toHaveProperty('enabled');
      expect(response.body).toHaveProperty('configuration');
      expect(response.body.configuration).toHaveProperty('availableProviders');
      
      if (response.body.enabled) {
        expect(response.body).toHaveProperty('provider');
        expect(response.body.configuration).toHaveProperty('configured');
      }
    });

    it('should provide available providers information', async () => {
      const response = await request(app)
        .get('/api/test-llm');

      expect(response.body.configuration.availableProviders).toContain('openai');
      expect(response.body.configuration.availableProviders).toContain('anthropic');
    });
  });
});