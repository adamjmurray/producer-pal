// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, vi } from "vitest";
import { type UIMessage } from "#webui/types/messages";
import {
  filterOverrides,
  handleMessageStream,
  validateMcpConnection,
} from "#webui/hooks/chat/helpers/streaming-helpers";

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

  describe("filterOverrides", () => {
    const defaults = {
      thinking: "Default",
    };

    it("returns undefined when no overrides provided", () => {
      expect(filterOverrides(undefined, defaults)).toBeUndefined();
    });

    it("returns undefined when all overrides match defaults", () => {
      const result = filterOverrides({ thinking: "Default" }, defaults);

      expect(result).toBeUndefined();
    });

    it("returns thinking when it differs from defaults", () => {
      const result = filterOverrides({ thinking: "Max" }, defaults);

      expect(result).toStrictEqual({
        thinking: "Max",
      });
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
