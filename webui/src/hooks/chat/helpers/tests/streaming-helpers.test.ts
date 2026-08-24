// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect, vi } from "vitest";
import { DEFAULT_MAX_TOOL_STEPS } from "#webui/chat/sdk/step-budget";
import { type UIMessage } from "#webui/types/messages";
import { type ChatClient } from "#webui/hooks/chat/use-chat-types";
import {
  connectClient,
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
    const keyErrorAdapter = {
      createUserMessage: (text: string) => ({ role: "user", content: text }),
      // Mirrors the real adapter, which pushes the error onto the array it gets.
      createErrorMessage: (error: unknown, history: unknown[]) => {
        history.push({ role: "model", error });

        return history;
      },
    };

    /**
     * Run the no-API-key path over a given client and restored history.
     * @param client - The live client, or null when none has been built
     * @param pending - Restored-but-not-yet-sent history, or null
     * @returns What was rendered and what was left in the stash
     */
    function showKeyError(
      client: { chatHistory: unknown[] } | null,
      pending: unknown[] | null,
    ) {
      const setMessages = vi.fn();
      const pendingHistoryRef = { current: pending };

      showMissingApiKeyError(
        keyErrorAdapter as never,
        "Hello",
        setMessages,
        { current: client } as never,
        pendingHistoryRef as never,
      );

      expect(setMessages).toHaveBeenCalledOnce();

      return {
        rendered: setMessages.mock.calls[0]?.[0] as { content?: string }[],
        stashed: pendingHistoryRef.current as { content?: string }[] | null,
      };
    }

    it("sets error message and stashes user message for retry/edit", () => {
      const { rendered, stashed } = showKeyError(null, null);

      expect(rendered).toHaveLength(2);
      expect(rendered[0]?.content).toBe("Hello");
      expect(stashed).toHaveLength(2);
      expect(stashed?.[0]?.content).toBe("Hello");
    });

    it("keeps the restored conversation the message was sent from", () => {
      // Regression: stashing the message alone truncated a restored
      // conversation to it, and the next send bootstrapped a client from that
      // truncation and saved it over the record.
      const restored = [{ role: "user", content: "earlier" }];
      const { rendered, stashed } = showKeyError(null, restored);

      expect(rendered.map((m) => m.content)).toStrictEqual([
        "earlier",
        "Hello",
        undefined,
      ]);
      expect(stashed?.map((m) => m.content)).toStrictEqual([
        "earlier",
        "Hello",
        undefined,
      ]);
      // The copy is what keeps the error off the restored array.
      expect(restored).toHaveLength(1);
    });

    it("renders against a live client's history without touching it", () => {
      // Switching to a keyless provider mid-conversation. The client owns the
      // history, so the stash stays empty and nothing was sent to grow it.
      const client = { chatHistory: [{ role: "user", content: "earlier" }] };
      const { rendered, stashed } = showKeyError(client, null);

      expect(rendered).toHaveLength(3);
      expect(rendered[0]?.content).toBe("earlier");
      expect(client.chatHistory).toHaveLength(1);
      expect(stashed).toBeNull();
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
      activeEnabledTools: null,
    };
    const fallback = {
      provider: "openai" as const,
      model: "gpt-4o",
      enabledTools: { "ppal-library": false },
    };
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

    it("reconnects a restored conversation on the toolset it ran with", () => {
      const init = resolveInitConnection(
        { ...locked, activeEnabledTools: { "ppal-duplicate": false } },
        fallback,
        resolveConnection,
      );

      expect(init.enabledTools).toStrictEqual({ "ppal-duplicate": false });
    });

    it("locks the current toolset for a conversation that has none yet", () => {
      const init = resolveInitConnection(locked, fallback, resolveConnection);

      expect(init.enabledTools).toStrictEqual({ "ppal-library": false });
    });

    it("locks the step budget in force when the client is built", () => {
      const init = resolveInitConnection(locked, fallback, resolveConnection, {
        maxToolSteps: 60,
      });

      expect(init.maxToolSteps).toBe(60);
    });

    it("falls back to the default budget when the caller sets none", () => {
      const init = resolveInitConnection(locked, fallback, resolveConnection);

      expect(init.maxToolSteps).toBe(DEFAULT_MAX_TOOL_STEPS);
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

  describe("connectClient", () => {
    /** A connect that lands only when the returned `land` is called */
    function pendingClient() {
      let land = () => {};
      let fail = (_error: Error) => {};
      const client = {
        initialize: () =>
          new Promise<void>((resolve, reject) => {
            land = resolve;
            fail = reject;
          }),
      } as ChatClient<MockMessage>;

      return { client, land: () => land(), fail: (e: Error) => fail(e) };
    }

    it("publishes the connect while it runs and clears it once it lands", async () => {
      const pendingInitRef: { current: Promise<void> | null } = {
        current: null,
      };
      const { client, land } = pendingClient();
      const connecting = connectClient(client, pendingInitRef);

      expect(pendingInitRef.current).not.toBeNull();

      land();
      await connecting;

      expect(pendingInitRef.current).toBeNull();
    });

    it("clears the published connect when the connection fails", async () => {
      // Left published, every later turn would await a promise that already
      // rejected instead of connecting a fresh client.
      const pendingInitRef: { current: Promise<void> | null } = {
        current: null,
      };
      const { client, fail } = pendingClient();
      const connecting = connectClient(client, pendingInitRef);

      fail(new Error("MCP down"));

      await expect(connecting).rejects.toThrow("MCP down");
      expect(pendingInitRef.current).toBeNull();
    });

    it("leaves a newer connect published when an older one settles", async () => {
      const pendingInitRef: { current: Promise<void> | null } = {
        current: null,
      };
      const first = pendingClient();
      const second = pendingClient();
      const firstConnect = connectClient(first.client, pendingInitRef);
      const secondConnect = connectClient(second.client, pendingInitRef);
      const published = pendingInitRef.current;

      first.land();
      await firstConnect;

      // The second init owns the ref now. Clearing it would let a turn stream
      // on a client whose MCP connection hasn't landed.
      expect(pendingInitRef.current).toBe(published);

      second.land();
      await secondConnect;

      expect(pendingInitRef.current).toBeNull();
    });
  });
});
