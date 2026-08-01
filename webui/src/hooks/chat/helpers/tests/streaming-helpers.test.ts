// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, vi } from "vitest";
import { type UIMessage } from "#webui/types/messages";
import {
  filterOverrides,
  handleMessageStream,
  resolveInitConnection,
  resolveLockedNotation,
  resolveLockedSmallModelMode,
  showMissingApiKeyError,
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

  describe("showMissingApiKeyError", () => {
    it("sets error message and stashes user message for retry/edit", () => {
      const setMessages = vi.fn();
      const adapter = {
        createUserMessage: (text: string) => ({ role: "user", content: text }),
        createErrorMessage: (error: unknown, history: unknown[]) => [
          ...history,
          { role: "model", error },
        ],
      };
      const pendingHistoryRef: { current: unknown[] | null } = {
        current: null,
      };

      showMissingApiKeyError(
        adapter as never,
        "Hello",
        setMessages,
        pendingHistoryRef as never,
      );

      expect(setMessages).toHaveBeenCalledOnce();
      const args = setMessages.mock.calls[0]?.[0];

      expect(args).toHaveLength(2);
      expect(args[0].content).toBe("Hello");
      expect(pendingHistoryRef.current).toHaveLength(1);
      const stashed = pendingHistoryRef.current as { content: string }[];

      expect(stashed[0]?.content).toBe("Hello");
    });
  });

  describe("resolveLockedNotation", () => {
    it("prefers the conversation's locked notation over the current setting", () => {
      // The whole point of locking: a chat whose notes were written in stark
      // keeps being parsed as stark after the user switches the dropdown.
      expect(
        resolveLockedNotation({
          lockedNotation: "stark",
          notation: "barbeat",
        }),
      ).toBe("stark");
    });

    it("falls back to the current setting for a brand-new conversation", () => {
      expect(
        resolveLockedNotation({ lockedNotation: null, notation: "midi-json" }),
      ).toBe("midi-json");
    });

    it("returns null when the caller has no notation of its own", () => {
      // No header, so the request falls through to the device global — the same
      // contract an external MCP client gets.
      expect(resolveLockedNotation({})).toBeNull();
    });

    it("ignores an unknown notation from a hand-edited record", () => {
      expect(
        resolveLockedNotation({ lockedNotation: "tablature", notation: 42 }),
      ).toBeNull();
    });
  });

  describe("resolveLockedSmallModelMode", () => {
    it("prefers the conversation's locked mode over the current setting", () => {
      // A restored conversation keeps the tool schemas and skills variant it
      // started with, whatever the Settings toggle says now.
      expect(
        resolveLockedSmallModelMode({
          lockedSmallModelMode: true,
          smallModelMode: false,
        }),
      ).toBe(true);
    });

    it("falls back to the current setting for a brand-new conversation", () => {
      expect(
        resolveLockedSmallModelMode({
          lockedSmallModelMode: null,
          smallModelMode: true,
        }),
      ).toBe(true);
    });

    it("defaults to off when neither is present", () => {
      expect(resolveLockedSmallModelMode({})).toBe(false);
    });
  });

  describe("resolveInitConnection", () => {
    const locked = {
      activeProvider: null,
      activeModel: null,
      activeSystemInstruction: null,
      activeNotation: null,
      activeSmallModelMode: null,
    };
    const fallback = { provider: "openai" as const, model: "gpt-4o" };
    const resolveConnection = () => ({ apiKey: "sk-test" });

    it("passes the locked notation through to the adapter and back out", () => {
      const init = resolveInitConnection(
        { ...locked, activeNotation: "stark" },
        fallback,
        resolveConnection,
        { notation: "barbeat" },
      );

      expect(init.extraParams.lockedNotation).toBe("stark");
      expect(init.notation).toBe("stark");
    });

    it("locks the current notation for a conversation that has none yet", () => {
      const init = resolveInitConnection(locked, fallback, resolveConnection, {
        notation: "barbeat",
      });

      expect(init.extraParams.lockedNotation).toBeNull();
      expect(init.notation).toBe("barbeat");
    });

    it("passes the locked small-model mode through to the adapter and back out", () => {
      const init = resolveInitConnection(
        { ...locked, activeSmallModelMode: true },
        fallback,
        resolveConnection,
        { smallModelMode: false },
      );

      expect(init.extraParams.lockedSmallModelMode).toBe(true);
      expect(init.smallModelMode).toBe(true);
    });

    it("locks the current small-model mode for a conversation that has none yet", () => {
      const init = resolveInitConnection(locked, fallback, resolveConnection, {
        smallModelMode: true,
      });

      expect(init.extraParams.lockedSmallModelMode).toBeNull();
      expect(init.smallModelMode).toBe(true);
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
