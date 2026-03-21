// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type LanguageModel } from "ai";
import { describe, expect, it, vi } from "vitest";
import { type ChatMessage } from "#webui/chat/sdk/types";

// Mock provider-factories to avoid real OpenAI client creation
const mockModel = { modelId: "test-model" } as unknown as LanguageModel;

vi.mock(import("#webui/chat/sdk/provider-factories"), () => ({
  createProviderModel: vi.fn(() => mockModel),
}));

import { chatAdapter } from "#webui/hooks/chat/adapter";

describe("chatAdapter", () => {
  describe("createClient", () => {
    it("creates a ChatSdkClient instance", () => {
      const config = {
        model: {
          modelId: "test",
          provider: "openai",
          specificationVersion: "v3",
        } as never,
        showThoughts: false,
      };
      const client = chatAdapter.createClient("test-key", config);

      expect(client).toBeDefined();
      expect(client.chatHistory).toStrictEqual([]);
    });

    it("passes chat history from config", () => {
      const chatHistory: ChatMessage[] = [{ role: "user", content: "Hello" }];
      const config = {
        model: {
          modelId: "test",
          provider: "openai",
          specificationVersion: "v3",
        } as never,
        showThoughts: false,
        chatHistory,
      };
      const client = chatAdapter.createClient("test-key", config);

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
      const config = chatAdapter.buildConfig(
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
      const config = chatAdapter.buildConfig(
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
      const history: ChatMessage[] = [{ role: "user", content: "Hello" }];
      const config = chatAdapter.buildConfig(
        "gpt-4o",
        1.0,
        "default",
        {},
        history,
        extraParams,
      );

      expect(config.chatHistory).toStrictEqual(history);
    });

    it("sets reasoning effort for openai provider with Max thinking", () => {
      const config = chatAdapter.buildConfig(
        "o3-mini",
        1.0,
        "Max",
        {},
        undefined,
        { ...extraParams, provider: "openai" },
      );

      expect(config.providerOptions).toStrictEqual({
        openai: { reasoningEffort: "high" },
      });
    });

    it("includes reasoningSummary for openai reasoning model with showThoughts", () => {
      const config = chatAdapter.buildConfig(
        "gpt-5.2",
        1.0,
        "Max",
        {},
        undefined,
        { ...extraParams, provider: "openai", showThoughts: true },
      );

      expect(config.providerOptions).toStrictEqual({
        openai: { reasoningEffort: "xhigh", reasoningSummary: "auto" },
      });
    });

    it("sets reasoningEffort and reasoningSummary for openai reasoning model with Default thinking", () => {
      const config = chatAdapter.buildConfig(
        "gpt-5.2",
        1.0,
        "Default",
        {},
        undefined,
        { ...extraParams, provider: "openai", showThoughts: true },
      );

      expect(config.providerOptions).toStrictEqual({
        openai: { reasoningEffort: "medium", reasoningSummary: "auto" },
      });
    });

    it("sets reasoning for openrouter provider with Max thinking", () => {
      const config = chatAdapter.buildConfig(
        "some-model",
        1.0,
        "Max",
        {},
        undefined,
        { ...extraParams, provider: "openrouter", showThoughts: true },
      );

      expect(config.providerOptions).toStrictEqual({
        openrouter: {
          reasoning: {
            effort: "xhigh",
          },
        },
      });
    });

    it("excludes reasoning for openrouter with showThoughts=false", () => {
      const config = chatAdapter.buildConfig(
        "some-model",
        1.0,
        "Max",
        {},
        undefined,
        { ...extraParams, provider: "openrouter", showThoughts: false },
      );

      expect(config.providerOptions).toStrictEqual({
        openrouter: {
          reasoning: {
            effort: "xhigh",
            exclude: true,
          },
        },
      });
    });

    it("sets Gemini thinkingConfig for Max thinking", () => {
      const config = chatAdapter.buildConfig(
        "gemini-2.5-flash",
        1.0,
        "Max",
        {},
        undefined,
        { ...extraParams, provider: "gemini" },
      );

      expect(config.providerOptions).toStrictEqual({
        google: {
          thinkingConfig: {
            thinkingBudget: 16384,
            includeThoughts: false,
          },
        },
      });
    });

    it("sets Gemini thinkingConfig with includeThoughts when showThoughts is true", () => {
      const config = chatAdapter.buildConfig(
        "gemini-2.5-flash",
        1.0,
        "Max",
        {},
        undefined,
        { ...extraParams, provider: "gemini", showThoughts: true },
      );

      expect(config.providerOptions).toStrictEqual({
        google: {
          thinkingConfig: {
            thinkingBudget: 16384,
            includeThoughts: true,
          },
        },
      });
    });

    it("sets Gemini thinkingConfig with -1 budget for Default thinking", () => {
      const config = chatAdapter.buildConfig(
        "gemini-2.0-flash",
        1.0,
        "Default",
        {},
        undefined,
        { ...extraParams, provider: "gemini" },
      );

      expect(config.providerOptions).toStrictEqual({
        google: {
          thinkingConfig: {
            thinkingBudget: -1,
            includeThoughts: false,
          },
        },
      });
    });

    it("returns undefined providerOptions for Gemini with Off thinking", () => {
      const config = chatAdapter.buildConfig(
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
      const config = chatAdapter.buildConfig(
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
      const config = chatAdapter.buildConfig("qwq", 1.0, "Max", {}, undefined, {
        ...extraParams,
        provider: "ollama",
      });

      expect(config.providerOptions).toStrictEqual({
        openai: { think: true },
      });
    });

    it("sets ollama think:false for Off thinking", () => {
      const config = chatAdapter.buildConfig("qwq", 1.0, "Off", {}, undefined, {
        ...extraParams,
        provider: "ollama",
      });

      expect(config.providerOptions).toStrictEqual({
        openai: { think: false },
      });
    });

    it("returns undefined providerOptions for ollama with Default thinking", () => {
      const config = chatAdapter.buildConfig(
        "llama3",
        1.0,
        "Default",
        {},
        undefined,
        { ...extraParams, provider: "ollama" },
      );

      expect(config.providerOptions).toBeUndefined();
    });

    it("sets medium reasoning effort for openrouter with Default thinking", () => {
      const config = chatAdapter.buildConfig(
        "some-model",
        1.0,
        "Default",
        {},
        undefined,
        { ...extraParams, provider: "openrouter" },
      );

      expect(config.providerOptions).toStrictEqual({
        openrouter: {
          reasoning: {
            effort: "medium",
            exclude: true,
          },
        },
      });
    });

    it("returns undefined providerOptions for openrouter with Off thinking", () => {
      const config = chatAdapter.buildConfig(
        "some-model",
        1.0,
        "Off",
        {},
        undefined,
        { ...extraParams, provider: "openrouter", showThoughts: true },
      );

      expect(config.providerOptions).toBeUndefined();
    });

    it("sets anthropic thinking options for Max thinking", () => {
      const config = chatAdapter.buildConfig(
        "claude-sonnet-4-6-20250514",
        1.0,
        "Max",
        {},
        undefined,
        { ...extraParams, provider: "anthropic" },
      );

      expect(config.providerOptions).toStrictEqual({
        anthropic: {
          thinking: { type: "enabled", budgetTokens: 16384 },
        },
      });
    });

    it("suppresses temperature for anthropic when thinking is enabled", () => {
      const config = chatAdapter.buildConfig(
        "claude-sonnet-4-6-20250514",
        0.7,
        "Max",
        {},
        undefined,
        { ...extraParams, provider: "anthropic" },
      );

      expect(config.temperature).toBeUndefined();
    });

    it("suppresses temperature for anthropic with Default thinking", () => {
      const config = chatAdapter.buildConfig(
        "claude-sonnet-4-6-20250514",
        0.7,
        "Default",
        {},
        undefined,
        { ...extraParams, provider: "anthropic" },
      );

      // Default maps to budget 10240, which enables thinking and suppresses temperature
      expect(config.temperature).toBeUndefined();
    });

    it("sets anthropic default thinking budget for Default thinking", () => {
      const config = chatAdapter.buildConfig(
        "claude-sonnet-4-6-20250514",
        1.0,
        "Default",
        {},
        undefined,
        { ...extraParams, provider: "anthropic" },
      );

      expect(config.providerOptions).toStrictEqual({
        anthropic: {
          thinking: { type: "enabled", budgetTokens: 10240 },
        },
      });
    });

    it("returns undefined provider options for anthropic with Off thinking", () => {
      const config = chatAdapter.buildConfig(
        "claude-sonnet-4-6-20250514",
        1.0,
        "Off",
        {},
        undefined,
        { ...extraParams, provider: "anthropic" },
      );

      expect(config.providerOptions).toBeUndefined();
    });

    it("preserves temperature for anthropic with Off thinking", () => {
      const config = chatAdapter.buildConfig(
        "claude-sonnet-4-6-20250514",
        0.7,
        "Off",
        {},
        undefined,
        { ...extraParams, provider: "anthropic" },
      );

      expect(config.temperature).toBe(0.7);
    });

    it("returns undefined provider options for mistral provider", () => {
      const config = chatAdapter.buildConfig(
        "mistral-large",
        1.0,
        "Max",
        {},
        undefined,
        { ...extraParams, provider: "mistral" },
      );

      expect(config.providerOptions).toBeUndefined();
    });

    it("buildProviderOptions callback rebuilds options with overridden thinking", () => {
      const config = chatAdapter.buildConfig(
        "claude-sonnet-4-6-20250514",
        1.0,
        "Max",
        {},
        undefined,
        { ...extraParams, provider: "anthropic" },
      );

      // Original config has Max thinking (budgetTokens: 16384)
      expect(config.providerOptions).toStrictEqual({
        anthropic: { thinking: { type: "enabled", budgetTokens: 16384 } },
      });

      // Callback rebuilds with overridden thinking level
      const overridden = config.buildProviderOptions!("Off");

      expect(overridden).toBeUndefined();
    });
  });

  describe("createErrorMessage", () => {
    it("creates formatted error message from chat history", () => {
      const history: ChatMessage[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi" },
      ];
      const result = chatAdapter.createErrorMessage(
        new Error("API error"),
        history,
      );

      expect(result).toHaveLength(3);
      expect(result[2]!.role).toBe("model");
    });
  });

  describe("extractUserMessage", () => {
    it("returns trimmed content for user messages", () => {
      const msg: ChatMessage = { role: "user", content: "  Hello  " };

      expect(chatAdapter.extractUserMessage(msg)).toBe("Hello");
    });

    it("returns undefined for assistant messages", () => {
      const msg: ChatMessage = { role: "assistant", content: "Hi" };

      expect(chatAdapter.extractUserMessage(msg)).toBeUndefined();
    });
  });

  describe("createUserMessage", () => {
    it("creates a user message with the given text", () => {
      const msg = chatAdapter.createUserMessage("Hello");

      expect(msg).toStrictEqual({ role: "user", content: "Hello" });
    });
  });

  describe("formatMessages", () => {
    it("delegates to formatChatMessages", () => {
      const history: ChatMessage[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi" },
      ];
      const result = chatAdapter.formatMessages(history);

      expect(result).toHaveLength(2);
      expect(result[0]!.role).toBe("user");
      expect(result[1]!.role).toBe("model");
    });
  });
});
