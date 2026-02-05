// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi } from "vitest";
import type { GeminiMessage, OpenAIMessage } from "#webui/types/messages";
import type { ResponsesConversationItem } from "#webui/types/responses-api";
import {
  handleMessageStream,
  createGeminiErrorMessage,
  createOpenAIErrorMessage,
  createResponsesErrorMessage,
  validateMcpConnection,
} from "./streaming-helpers";

function createMockFormatter() {
  return vi.fn(() => [
    {
      role: "user" as const,
      parts: [],
      rawHistoryIndex: 0,
      timestamp: Date.now(),
    },
  ]);
}

async function* createThrowingStream(
  error: Error,
): AsyncGenerator<GeminiMessage[], void, unknown> {
  yield [];
  throw error;
}

describe("streaming-helpers", () => {
  describe("handleMessageStream", () => {
    it("should handle successful stream", async () => {
      const mockHistory: GeminiMessage[][] = [
        [{ role: "user" as const, parts: [{ text: "hi" }] }],
      ];
      const mockStream = (async function* () {
        for (const h of mockHistory) yield h;
      })();
      const onUpdate = vi.fn();

      const result = await handleMessageStream(
        mockStream,
        createMockFormatter(),
        onUpdate,
      );

      expect(result).toBe(true);
      expect(onUpdate).toHaveBeenCalled();
    });

    it("should handle AbortError", async () => {
      const result = await handleMessageStream(
        createThrowingStream(new DOMException("Aborted", "AbortError")),
        createMockFormatter(),
        vi.fn(),
      );

      expect(result).toBe(false);
    });

    it("should re-throw non-AbortError", async () => {
      await expect(
        handleMessageStream(
          createThrowingStream(new Error("Network failure")),
          createMockFormatter(),
          vi.fn(),
        ),
      ).rejects.toThrow("Network failure");
    });
  });

  describe("createGeminiErrorMessage", () => {
    it("should create error message with Error prefix", () => {
      const chatHistory: GeminiMessage[] = [];
      const result = createGeminiErrorMessage("Test error", chatHistory);

      expect(result).toHaveLength(1);
      expect(result[0]?.role).toBe("model");
      const firstPart = result[0]?.parts[0];

      expect(firstPart?.type).toBe("error");
      expect(firstPart && "content" in firstPart ? firstPart.content : "").toBe(
        "Error: Test error",
      );
    });

    it("should not duplicate Error prefix", () => {
      const chatHistory: GeminiMessage[] = [];
      const result = createGeminiErrorMessage("Error: Test", chatHistory);

      const firstPart = result[0]?.parts[0];

      expect(firstPart && "content" in firstPart ? firstPart.content : "").toBe(
        "Error: Test",
      );
    });
  });

  describe("createOpenAIErrorMessage", () => {
    it("should create error message", () => {
      const chatHistory: OpenAIMessage[] = [];
      const result = createOpenAIErrorMessage(chatHistory, "Test error");

      expect(result).toHaveLength(1);
      expect(result[0]?.role).toBe("model");
    });
  });

  describe("createResponsesErrorMessage", () => {
    it("should create error message", () => {
      const conversation: ResponsesConversationItem[] = [];
      const result = createResponsesErrorMessage(conversation, "Test error");

      expect(result).toHaveLength(1);
      expect(result[0]?.role).toBe("model");
      const firstPart = result[0]?.parts[0];

      expect(firstPart?.type).toBe("error");
      expect(firstPart && "content" in firstPart ? firstPart.content : "").toBe(
        "Error: Test error",
      );
    });

    it("should preserve existing conversation in formatted output", () => {
      const conversation: ResponsesConversationItem[] = [
        { type: "message", role: "user", content: "Hello" },
      ];
      const result = createResponsesErrorMessage(conversation, "Test error");

      expect(result).toHaveLength(2);
      expect(result[0]?.role).toBe("user");
      expect(result[1]?.role).toBe("model");
    });

    it("should handle Error objects", () => {
      const conversation: ResponsesConversationItem[] = [];
      const result = createResponsesErrorMessage(
        conversation,
        new Error("Something failed"),
      );

      const firstPart = result[0]?.parts[0];

      expect(firstPart && "content" in firstPart ? firstPart.content : "").toBe(
        "Error: Something failed",
      );
    });
  });

  describe("validateMcpConnection", () => {
    it("should pass for connected status", async () => {
      await expect(
        validateMcpConnection("connected", null, vi.fn()),
      ).resolves.toBeUndefined();
    });

    it("should throw for error status", async () => {
      const checkMcp = vi.fn().mockResolvedValue(undefined);

      await expect(
        validateMcpConnection("error", "Test error", checkMcp),
      ).rejects.toThrow("MCP connection failed");
      expect(checkMcp).toHaveBeenCalled();
    });
  });
});
