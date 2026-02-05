// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import type { OpenAIMessage } from "#webui/types/messages";
import { openaiChatAdapter } from "./openai-chat-adapter";

describe("openaiChatAdapter", () => {
  describe("extractUserMessage", () => {
    it("returns string content from user message", () => {
      const message: OpenAIMessage = {
        role: "user",
        content: "Hello world",
      };

      expect(openaiChatAdapter.extractUserMessage(message)).toBe("Hello world");
    });

    it("trims whitespace from content", () => {
      const message: OpenAIMessage = {
        role: "user",
        content: "  Hello  ",
      };

      expect(openaiChatAdapter.extractUserMessage(message)).toBe("Hello");
    });

    it("returns undefined for non-user messages", () => {
      const message: OpenAIMessage = {
        role: "assistant",
        content: "Response",
      };

      expect(openaiChatAdapter.extractUserMessage(message)).toBeUndefined();
    });

    it("returns undefined for non-string content", () => {
      const message: OpenAIMessage = {
        role: "user",
        content: null as unknown as string,
      };

      expect(openaiChatAdapter.extractUserMessage(message)).toBeUndefined();
    });
  });

  describe("createUserMessage", () => {
    it("creates a user message", () => {
      const result = openaiChatAdapter.createUserMessage("Hello");

      expect(result).toStrictEqual({
        role: "user",
        content: "Hello",
      });
    });
  });

  describe("buildConfig", () => {
    it("returns a valid config without baseUrl", () => {
      const config = openaiChatAdapter.buildConfig(
        "gpt-4",
        0.7,
        "Medium",
        { tool1: true },
        undefined,
        { showThoughts: true },
      );

      expect(config.model).toBe("gpt-4");
      expect(config.temperature).toBe(0.7);
      expect(config.enabledTools).toStrictEqual({ tool1: true });
    });

    it("includes baseUrl from extraParams", () => {
      const config = openaiChatAdapter.buildConfig(
        "gpt-4",
        0.7,
        "Off",
        {},
        undefined,
        { baseUrl: "https://openrouter.ai/api/v1", showThoughts: false },
      );

      expect(config.baseUrl).toBe("https://openrouter.ai/api/v1");
    });

    it("includes chat history when provided", () => {
      const history: OpenAIMessage[] = [{ role: "user", content: "Hi" }];
      const config = openaiChatAdapter.buildConfig(
        "gpt-4",
        0.7,
        "Off",
        {},
        history,
        {},
      );

      expect(config.chatHistory).toStrictEqual(history);
    });
  });

  describe("createClient", () => {
    it("creates an OpenAIClient instance", () => {
      const config = openaiChatAdapter.buildConfig(
        "gpt-4",
        0.7,
        "Off",
        {},
        undefined,
        {},
      );
      const client = openaiChatAdapter.createClient("test-api-key", config);

      expect(client).toBeDefined();
      expect(client.config.model).toBe("gpt-4");
    });
  });

  describe("formatMessages", () => {
    it("formats OpenAI messages", () => {
      const messages: OpenAIMessage[] = [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi there!" },
      ];

      const result = openaiChatAdapter.formatMessages(messages);

      expect(result).toHaveLength(2);
      expect(result[0]!.role).toBe("user");
      expect(result[1]!.role).toBe("model");
    });
  });

  describe("createErrorMessage", () => {
    it("creates an error message", () => {
      const history: OpenAIMessage[] = [];
      const result = openaiChatAdapter.createErrorMessage(
        "Something failed",
        history,
      );

      expect(result).toHaveLength(1);
      expect(result[0]!.role).toBe("model");
      expect(result[0]!.parts[0]!.type).toBe("error");
    });
  });
});
