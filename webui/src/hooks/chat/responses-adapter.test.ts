// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import type { ResponsesConversationItem } from "#webui/types/responses-api";
import { responsesAdapter } from "./responses-adapter";

describe("responsesAdapter", () => {
  describe("extractUserMessage", () => {
    it("returns string content from user message", () => {
      const item: ResponsesConversationItem = {
        type: "message",
        role: "user",
        content: "Hello world",
      };

      expect(responsesAdapter.extractUserMessage(item)).toBe("Hello world");
    });

    it("trims whitespace from string content", () => {
      const item: ResponsesConversationItem = {
        type: "message",
        role: "user",
        content: "  Hello  ",
      };

      expect(responsesAdapter.extractUserMessage(item)).toBe("Hello");
    });

    it("extracts text from array content", () => {
      const item: ResponsesConversationItem = {
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: "Hello " },
          { type: "input_text", text: "world" },
        ],
      };

      expect(responsesAdapter.extractUserMessage(item)).toBe("Hello world");
    });

    it("returns undefined for non-user messages", () => {
      const item: ResponsesConversationItem = {
        type: "message",
        role: "assistant",
        content: "Response",
      };

      expect(responsesAdapter.extractUserMessage(item)).toBeUndefined();
    });

    it("returns undefined for non-message items", () => {
      const item: ResponsesConversationItem = {
        type: "function_call",
        id: "fc_1",
        call_id: "call_1",
        name: "test",
        arguments: "{}",
      };

      expect(responsesAdapter.extractUserMessage(item)).toBeUndefined();
    });
  });

  describe("createUserMessage", () => {
    it("creates a user message item", () => {
      const result = responsesAdapter.createUserMessage("Hello");

      expect(result).toStrictEqual({
        type: "message",
        role: "user",
        content: "Hello",
      });
    });
  });

  describe("buildConfig", () => {
    it("returns a valid config", () => {
      const config = responsesAdapter.buildConfig(
        "gpt-5.2",
        0.7,
        "Medium",
        { tool1: true },
        undefined,
        {},
      );

      expect(config.model).toBe("gpt-5.2");
      expect(config.temperature).toBe(0.7);
      expect(config.reasoningEffort).toBe("medium");
      expect(config.enabledTools).toStrictEqual({ tool1: true });
    });

    it("includes conversation when provided", () => {
      const conversation: ResponsesConversationItem[] = [
        { type: "message", role: "user", content: "Hi" },
      ];
      const config = responsesAdapter.buildConfig(
        "gpt-5.2",
        0.7,
        "Off",
        {},
        conversation,
        {},
      );

      expect(config.conversation).toStrictEqual(conversation);
    });
  });

  describe("createClient", () => {
    it("creates a ResponsesClient instance", () => {
      const config = responsesAdapter.buildConfig(
        "gpt-5.2",
        0.7,
        "Off",
        {},
        undefined,
        {},
      );
      const client = responsesAdapter.createClient("test-api-key", config);

      expect(client).toBeDefined();
      expect(client.config.model).toBe("gpt-5.2");
    });
  });

  describe("formatMessages", () => {
    it("formats conversation items", () => {
      const conversation: ResponsesConversationItem[] = [
        { type: "message", role: "user", content: "Hello" },
      ];

      const result = responsesAdapter.formatMessages(conversation);

      expect(result).toHaveLength(1);
      expect(result[0]!.role).toBe("user");
    });
  });

  describe("createErrorMessage", () => {
    it("creates an error message", () => {
      const conversation: ResponsesConversationItem[] = [];
      const result = responsesAdapter.createErrorMessage(
        "Something failed",
        conversation,
      );

      expect(result).toHaveLength(1);
      expect(result[0]!.role).toBe("model");
      expect(result[0]!.parts[0]!.type).toBe("error");
    });
  });
});
