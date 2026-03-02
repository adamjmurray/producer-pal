// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, vi } from "vitest";
import { type UIMessage } from "#webui/types/messages";
import {
  handleMessageStream,
  createFormattedErrorMessage,
  validateMcpConnection,
} from "./streaming-helpers";

interface MockMessage {
  role: string;
  content: string;
}

function createMockFormatter() {
  return vi.fn((): UIMessage[] => [
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
): AsyncGenerator<MockMessage[], void, unknown> {
  yield [];
  throw error;
}

describe("streaming-helpers", () => {
  describe("handleMessageStream", () => {
    it("should handle successful stream", async () => {
      const mockHistory: MockMessage[][] = [[{ role: "user", content: "hi" }]];
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

  describe("createFormattedErrorMessage", () => {
    it("should create error message from history", () => {
      const history: MockMessage[] = [];
      const formatter = vi.fn((): UIMessage[] => []);

      const result = createFormattedErrorMessage(
        history,
        formatter,
        "Test error",
      );

      expect(result).toHaveLength(1);
      expect(result[0]?.role).toBe("model");
      const firstPart = result[0]?.parts[0];

      expect(firstPart?.type).toBe("error");
      expect(firstPart && "content" in firstPart ? firstPart.content : "").toBe(
        "Error: Test error",
      );
    });

    it("should preserve existing history in formatted output", () => {
      const history: MockMessage[] = [{ role: "user", content: "Hello" }];
      const formatter = vi.fn((): UIMessage[] => [
        {
          role: "user",
          parts: [{ type: "text", content: "Hello" }],
          rawHistoryIndex: 0,
          timestamp: Date.now(),
        },
      ]);

      const result = createFormattedErrorMessage(
        history,
        formatter,
        "Test error",
      );

      expect(result).toHaveLength(2);
      expect(result[0]?.role).toBe("user");
      expect(result[1]?.role).toBe("model");
    });

    it("should handle Error objects", () => {
      const formatter = vi.fn((): UIMessage[] => []);

      const result = createFormattedErrorMessage(
        [],
        formatter,
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
