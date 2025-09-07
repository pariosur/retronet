/**
 * Unit tests for LLM configuration validation logic
 */

import { describe, it, expect, beforeEach } from "vitest";
import { LLMServiceFactory } from "../services/llm/LLMServiceFactory.js";
import { OpenAIProvider } from "../services/llm/OpenAIProvider.js";

// Register the OpenAI provider for testing
LLMServiceFactory.registerProvider("openai", OpenAIProvider);

describe("LLM Configuration Validation", () => {
  describe("validateConfig", () => {
    it("should validate valid OpenAI configuration", () => {
      const config = {
        provider: "openai",
        apiKey: "sk-test-key",
        model: "gpt-3.5-turbo",
        timeout: 30000,
        maxTokens: 4000,
        temperature: 0.7,
      };

      const result = LLMServiceFactory.validateConfig(config);

      expect(result).toMatchObject({
        provider: "openai",
        apiKey: "sk-test-key",
        model: "gpt-3.5-turbo",
        enabled: true,
        privacyMode: false,
        timeout: 30000,
        maxTokens: 4000,
        temperature: 0.7,
      });
    });

    it("should require configuration object", () => {
      expect(() => {
        LLMServiceFactory.validateConfig(null);
      }).toThrow("LLM configuration must be an object");

      expect(() => {
        LLMServiceFactory.validateConfig(undefined);
      }).toThrow("LLM configuration must be an object");

      expect(() => {
        LLMServiceFactory.validateConfig("invalid");
      }).toThrow("LLM configuration must be an object");
    });

    it("should require provider name", () => {
      expect(() => {
        LLMServiceFactory.validateConfig({});
      }).toThrow("Provider name is required and must be a string");

      expect(() => {
        LLMServiceFactory.validateConfig({ provider: null });
      }).toThrow("Provider name is required and must be a string");

      expect(() => {
        LLMServiceFactory.validateConfig({ provider: 123 });
      }).toThrow("Provider name is required and must be a string");
    });

    it("should reject unknown providers", () => {
      expect(() => {
        LLMServiceFactory.validateConfig({
          provider: "unknown-provider",
          apiKey: "test-key",
        });
      }).toThrow("Unknown provider: unknown-provider");
    });

    it("should require API key for external providers", () => {
      expect(() => {
        LLMServiceFactory.validateConfig({
          provider: "openai",
        });
      }).toThrow("API key is required for openai provider");

      expect(() => {
        LLMServiceFactory.validateConfig({
          provider: "openai",
          apiKey: null,
        });
      }).toThrow("API key is required for openai provider");

      expect(() => {
        LLMServiceFactory.validateConfig({
          provider: "openai",
          apiKey: 123,
        });
      }).toThrow("API key is required for openai provider");
    });

    it("should validate timeout parameter", () => {
      expect(() => {
        LLMServiceFactory.validateConfig({
          provider: "openai",
          apiKey: "sk-test",
          timeout: -1,
        });
      }).toThrow("Timeout must be a positive number");

      expect(() => {
        LLMServiceFactory.validateConfig({
          provider: "openai",
          apiKey: "sk-test",
          timeout: 0,
        });
      }).toThrow("Timeout must be a positive number");

      expect(() => {
        LLMServiceFactory.validateConfig({
          provider: "openai",
          apiKey: "sk-test",
          timeout: "invalid",
        });
      }).toThrow("Timeout must be a positive number");
    });

    it("should validate maxTokens parameter", () => {
      expect(() => {
        LLMServiceFactory.validateConfig({
          provider: "openai",
          apiKey: "sk-test",
          maxTokens: -1,
        });
      }).toThrow("Max tokens must be a positive number");

      expect(() => {
        LLMServiceFactory.validateConfig({
          provider: "openai",
          apiKey: "sk-test",
          maxTokens: 0,
        });
      }).toThrow("Max tokens must be a positive number");

      expect(() => {
        LLMServiceFactory.validateConfig({
          provider: "openai",
          apiKey: "sk-test",
          maxTokens: "invalid",
        });
      }).toThrow("Max tokens must be a positive number");
    });

    it("should validate temperature parameter", () => {
      expect(() => {
        LLMServiceFactory.validateConfig({
          provider: "openai",
          apiKey: "sk-test",
          temperature: -0.1,
        });
      }).toThrow("Temperature must be a number between 0 and 2");

      expect(() => {
        LLMServiceFactory.validateConfig({
          provider: "openai",
          apiKey: "sk-test",
          temperature: 2.1,
        });
      }).toThrow("Temperature must be a number between 0 and 2");

      expect(() => {
        LLMServiceFactory.validateConfig({
          provider: "openai",
          apiKey: "sk-test",
          temperature: "invalid",
        });
      }).toThrow("Temperature must be a number between 0 and 2");
    });

    it("should use default values for optional parameters", () => {
      const config = {
        provider: "openai",
        apiKey: "sk-test-key",
      };

      const result = LLMServiceFactory.validateConfig(config);

      expect(result).toMatchObject({
        provider: "openai",
        apiKey: "sk-test-key",
        model: "gpt-3.5-turbo", // Default model
        enabled: true,
        privacyMode: false,
      });

      // Optional numeric fields should not be included if not provided
      expect(result).not.toHaveProperty("timeout");
      expect(result).not.toHaveProperty("maxTokens");
      expect(result).not.toHaveProperty("temperature");
    });

    it("should normalize provider name to lowercase", () => {
      const config = {
        provider: "OPENAI",
        apiKey: "sk-test-key",
      };

      const result = LLMServiceFactory.validateConfig(config);
      expect(result.provider).toBe("openai");
    });

    it("should handle enabled and privacyMode flags", () => {
      const config1 = {
        provider: "openai",
        apiKey: "sk-test-key",
        enabled: false,
        privacyMode: true,
      };

      const result1 = LLMServiceFactory.validateConfig(config1);
      expect(result1.enabled).toBe(false);
      expect(result1.privacyMode).toBe(true);

      const config2 = {
        provider: "openai",
        apiKey: "sk-test-key",
        // enabled and privacyMode not specified
      };

      const result2 = LLMServiceFactory.validateConfig(config2);
      expect(result2.enabled).toBe(true); // Default to true
      expect(result2.privacyMode).toBe(false); // Default to false
    });
  });

  describe("createConfigFromEnv", () => {
    it("should return null when no LLM provider is configured", () => {
      const env = {};
      const result = LLMServiceFactory.createConfigFromEnv(env);
      expect(result).toBeNull();
    });

    it("should create OpenAI configuration from environment", () => {
      const env = {
        LLM_PROVIDER: "openai",
        OPENAI_API_KEY: "sk-test-key",
        OPENAI_MODEL: "gpt-4",
        LLM_TIMEOUT: "60000",
        LLM_MAX_TOKENS: "8000",
        LLM_TEMPERATURE: "0.5",
        LLM_ENABLED: "true",
        LLM_PRIVACY_MODE: "false",
      };

      const result = LLMServiceFactory.createConfigFromEnv(env);

      expect(result).toMatchObject({
        provider: "openai",
        apiKey: "sk-test-key",
        model: "gpt-4",
        timeout: 60000,
        maxTokens: 8000,
        temperature: 0.5,
        enabled: true,
        privacyMode: false,
      });
    });

    it("should use default values when optional env vars are not set", () => {
      const env = {
        LLM_PROVIDER: "openai",
        OPENAI_API_KEY: "sk-test-key",
      };

      const result = LLMServiceFactory.createConfigFromEnv(env);

      expect(result).toMatchObject({
        provider: "openai",
        apiKey: "sk-test-key",
        model: "gpt-3.5-turbo", // Default model
        enabled: true, // Default enabled
      });

      expect(result).not.toHaveProperty("timeout");
      expect(result).not.toHaveProperty("maxTokens");
      expect(result).not.toHaveProperty("temperature");
    });

    it("should handle LLM_ENABLED=false", () => {
      const env = {
        LLM_PROVIDER: "openai",
        OPENAI_API_KEY: "sk-test-key",
        LLM_ENABLED: "false",
      };

      const result = LLMServiceFactory.createConfigFromEnv(env);
      expect(result.enabled).toBe(false);
    });

    it("should handle LLM_PRIVACY_MODE=true", () => {
      const env = {
        LLM_PROVIDER: "openai",
        OPENAI_API_KEY: "sk-test-key",
        LLM_PRIVACY_MODE: "true",
      };

      const result = LLMServiceFactory.createConfigFromEnv(env);
      expect(result.privacyMode).toBe(true);
    });

    it("should handle invalid numeric environment variables gracefully", () => {
      const env = {
        LLM_PROVIDER: "openai",
        OPENAI_API_KEY: "sk-test-key",
        LLM_TIMEOUT: "invalid",
        LLM_MAX_TOKENS: "not-a-number",
        LLM_TEMPERATURE: "bad-value",
      };

      const result = LLMServiceFactory.createConfigFromEnv(env);

      // Should still create config but with NaN values that will be caught by validation
      expect(result.provider).toBe("openai");
      expect(result.apiKey).toBe("sk-test-key");
      expect(isNaN(result.timeout)).toBe(true);
      expect(isNaN(result.maxTokens)).toBe(true);
      expect(isNaN(result.temperature)).toBe(true);
    });
  });

  describe("getAvailableProviders", () => {
    it("should return list of available providers", () => {
      const providers = LLMServiceFactory.getAvailableProviders();
      expect(Array.isArray(providers)).toBe(true);
      expect(providers).toContain("openai");
    });
  });

  describe("hasProvider", () => {
    it("should check if provider is registered", () => {
      expect(LLMServiceFactory.hasProvider("openai")).toBe(true);
      expect(LLMServiceFactory.hasProvider("OPENAI")).toBe(true); // Case insensitive
      expect(LLMServiceFactory.hasProvider("unknown")).toBe(false);
    });
  });

  describe("testProvider", () => {
    it("should handle configuration validation errors", async () => {
      const config = {
        provider: "openai",
        // Missing API key
      };

      const result = await LLMServiceFactory.testProvider(config);

      expect(result).toMatchObject({
        success: false,
        provider: "openai",
        error: expect.stringContaining("API key is required"),
        message: expect.stringContaining("Configuration error"),
      });
    });

    it("should handle unknown providers", async () => {
      const config = {
        provider: "unknown-provider",
        apiKey: "test-key",
      };

      const result = await LLMServiceFactory.testProvider(config);

      expect(result).toMatchObject({
        success: false,
        provider: "unknown-provider",
        error: expect.stringContaining("Unknown provider"),
        message: expect.stringContaining("Configuration error"),
      });
    });

    it("should test valid configuration", async () => {
      const config = {
        provider: "openai",
        apiKey: "sk-test-key",
        model: "gpt-3.5-turbo",
      };

      const result = await LLMServiceFactory.testProvider(config);

      // Should either succeed or fail with connection error (not config error)
      expect(result).toHaveProperty("success");
      expect(result).toHaveProperty("provider", "openai");
      expect(result).toHaveProperty("message");

      if (!result.success) {
        // If it fails, should be due to connection, not configuration
        expect(result.message).not.toContain("Configuration error");
      }
    });
  });
});
