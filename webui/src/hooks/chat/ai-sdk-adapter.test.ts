// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type LanguageModel } from "ai";
import { describe, expect, it, vi } from "vitest";
import { type AiSdkMessage } from "#webui/chat/ai-sdk/ai-sdk-types";

// Mock provider-factories to avoid real OpenAI client creation
const mockModel = { modelId: "test-model" } as unknown as LanguageModel;

vi.mock(import("#webui/chat/ai-sdk/provider-factories"), () => ({
  createProviderModel: vi.fn(() => mockModel),
}));

import { aiSdkAdapter } from "./ai-sdk-adapter";

describe("aiSdkAdapter", () => {
  describe("createClient", () => {
    it("creates an AiSdkClient instance", () => {
      const config = {
        model: {
          modelId: "test",
          provider: "openai",
          specificationVersion: "v3",
        } as never,
        showThoughts: false,
      };
      const client = aiSdkAdapter.createClient("test-key", config);

      expect(client).toBeDefined();
      expect(client.chatHistory).toStrictEqual([]);
    });

    it("passes chat history from config", () => {
      const chatHistory: AiSdkMessage[] = [{ role: "user", content: "Hello" }];
      const config = {
        model: {
          modelId: "test",
          provider: "openai",
          specificationVersion: "v3",
        } as never,
        showThoughts: false,
        chatHistory,
      };
      const client = aiSdkAdapter.createClient("test-key", config);

      expect(client.chatHistory).toStrictEqual(chatHistory);
    });
  });

  describe("buildConfig", () => {
    const extraParams = {
      provider: "openai",
      apiKey: "test-key",
      baseUrl: undefined,
      showThoughts: false,
    };

    it("returns config with model and temperature", () => {
      const config = aiSdkAdapter.buildConfig(
        "gpt-4o",
        0.7,
        "default",
        {},
        undefined,
        extraParams,
      );

      expect(config.temperature).toBe(0.7);
      expect(config.showThoughts).toBe(false);
      expect(config.enabledTools).toStrictEqual({});
    });

    it("passes enabled tools to config", () => {
      const enabledTools = { "ppal-connect": true, "ppal-read": false };
      const config = aiSdkAdapter.buildConfig(
        "gpt-4o",
        1.0,
        "default",
        enabledTools,
        undefined,
        extraParams,
      );

      expect(config.enabledTools).toStrictEqual(enabledTools);
    });

    it("passes chat history to config", () => {
      const history: AiSdkMessage[] = [{ role: "user", content: "Hello" }];
      const config = aiSdkAdapter.buildConfig(
        "gpt-4o",
        1.0,
        "default",
        {},
        history,
        extraParams,
      );

      expect(config.chatHistory).toStrictEqual(history);
    });

    it("sets reasoning effort for openai provider with High thinking", () => {
      const config = aiSdkAdapter.buildConfig(
        "o3-mini",
        1.0,
        "High",
        {},
        undefined,
        { ...extraParams, provider: "openai" },
      );

      expect(config.providerOptions).toStrictEqual({
        openai: { reasoningEffort: "high" },
      });
    });

    it("includes reasoningSummary for openai reasoning model with showThoughts", () => {
      const config = aiSdkAdapter.buildConfig(
        "gpt-5.2",
        1.0,
        "High",
        {},
        undefined,
        { ...extraParams, provider: "openai", showThoughts: true },
      );

      expect(config.providerOptions).toStrictEqual({
        openai: { reasoningEffort: "high", reasoningSummary: "auto" },
      });
    });

    it("sets only reasoningSummary for openai reasoning model with Default thinking", () => {
      const config = aiSdkAdapter.buildConfig(
        "gpt-5.2",
        1.0,
        "Default",
        {},
        undefined,
        { ...extraParams, provider: "openai", showThoughts: true },
      );

      expect(config.providerOptions).toStrictEqual({
        openai: { reasoningSummary: "auto" },
      });
    });

    it("sets reasoning for openrouter provider", () => {
      const config = aiSdkAdapter.buildConfig(
        "some-model",
        1.0,
        "High",
        {},
        undefined,
        { ...extraParams, provider: "openrouter", showThoughts: true },
      );

      expect(config.providerOptions).toStrictEqual({
        openrouter: {
          reasoning: {
            effort: "high",
          },
        },
      });
    });

    it("excludes reasoning for openrouter with showThoughts=false", () => {
      const config = aiSdkAdapter.buildConfig(
        "some-model",
        1.0,
        "High",
        {},
        undefined,
        { ...extraParams, provider: "openrouter", showThoughts: false },
      );

      expect(config.providerOptions).toStrictEqual({
        openrouter: {
          reasoning: {
            effort: "high",
            exclude: true,
          },
        },
      });
    });

    it("sets Gemini thinkingConfig for High thinking", () => {
      const config = aiSdkAdapter.buildConfig(
        "gemini-2.5-flash",
        1.0,
        "High",
        {},
        undefined,
        { ...extraParams, provider: "gemini" },
      );

      expect(config.providerOptions).toStrictEqual({
        google: {
          thinkingConfig: {
            thinkingBudget: 8192,
            includeThoughts: false,
          },
        },
      });
    });

    it("sets Gemini thinkingConfig with includeThoughts when showThoughts is true", () => {
      const config = aiSdkAdapter.buildConfig(
        "gemini-2.5-flash",
        1.0,
        "Medium",
        {},
        undefined,
        { ...extraParams, provider: "gemini", showThoughts: true },
      );

      expect(config.providerOptions).toStrictEqual({
        google: {
          thinkingConfig: {
            thinkingBudget: 4096,
            includeThoughts: true,
          },
        },
      });
    });

    it("returns undefined providerOptions for gemini with Off thinking", () => {
      const config = aiSdkAdapter.buildConfig(
        "gemini-2.0-flash",
        1.0,
        "Off",
        {},
        undefined,
        { ...extraParams, provider: "gemini" },
      );

      expect(config.providerOptions).toBeUndefined();
    });

    it("returns undefined providerOptions for default thinking", () => {
      const config = aiSdkAdapter.buildConfig(
        "gpt-4o",
        1.0,
        "default",
        {},
        undefined,
        extraParams,
      );

      expect(config.providerOptions).toBeUndefined();
    });

    it("sets ollama think option for supported model", () => {
      const config = aiSdkAdapter.buildConfig(
        "qwq",
        1.0,
        "High",
        {},
        undefined,
        { ...extraParams, provider: "ollama" },
      );

      expect(config.providerOptions).toStrictEqual({
        openai: { think: true },
      });
    });

    it("returns undefined providerOptions for ollama with default thinking", () => {
      const config = aiSdkAdapter.buildConfig(
        "llama3",
        1.0,
        "default",
        {},
        undefined,
        { ...extraParams, provider: "ollama" },
      );

      expect(config.providerOptions).toBeUndefined();
    });

    it("returns undefined providerOptions for openrouter with default thinking", () => {
      const config = aiSdkAdapter.buildConfig(
        "some-model",
        1.0,
        "default",
        {},
        undefined,
        { ...extraParams, provider: "openrouter" },
      );

      expect(config.providerOptions).toBeUndefined();
    });

    it("sets openrouter reasoning none with exclude", () => {
      const config = aiSdkAdapter.buildConfig(
        "some-model",
        1.0,
        "Off",
        {},
        undefined,
        { ...extraParams, provider: "openrouter", showThoughts: true },
      );

      expect(config.providerOptions).toStrictEqual({
        openrouter: {
          reasoning: {
            effort: "none",
            exclude: true,
          },
        },
      });
    });

    it("returns undefined provider options for anthropic provider", () => {
      const config = aiSdkAdapter.buildConfig(
        "claude-sonnet-4-20250514",
        1.0,
        "High",
        {},
        undefined,
        { ...extraParams, provider: "anthropic" },
      );

      expect(config.providerOptions).toBeUndefined();
    });
  });

  describe("createErrorMessage", () => {
    it("creates formatted error message from chat history", () => {
      const history: AiSdkMessage[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi" },
      ];
      const result = aiSdkAdapter.createErrorMessage(
        new Error("API error"),
        history,
      );

      expect(result).toHaveLength(3);
      expect(result[2]!.role).toBe("model");
    });
  });

  describe("extractUserMessage", () => {
    it("returns trimmed content for user messages", () => {
      const msg: AiSdkMessage = { role: "user", content: "  Hello  " };

      expect(aiSdkAdapter.extractUserMessage(msg)).toBe("Hello");
    });

    it("returns undefined for assistant messages", () => {
      const msg: AiSdkMessage = { role: "assistant", content: "Hi" };

      expect(aiSdkAdapter.extractUserMessage(msg)).toBeUndefined();
    });
  });

  describe("createUserMessage", () => {
    it("creates a user message with the given text", () => {
      const msg = aiSdkAdapter.createUserMessage("Hello");

      expect(msg).toStrictEqual({ role: "user", content: "Hello" });
    });
  });

  describe("formatMessages", () => {
    it("delegates to formatAiSdkMessages", () => {
      const history: AiSdkMessage[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi" },
      ];
      const result = aiSdkAdapter.formatMessages(history);

      expect(result).toHaveLength(2);
      expect(result[0]!.role).toBe("user");
      expect(result[1]!.role).toBe("model");
    });
  });
});
