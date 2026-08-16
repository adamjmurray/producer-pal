// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import {
  firstPartContent,
  renderChat,
  restoreHistory,
  stopResponse,
  type MockChatProps,
} from "./helpers/use-chat-render-test-helpers";
import {
  createDefaultProps,
  createMockAdapter,
  lockedSettings,
  type MockChatClient,
  tick,
  trackingAdapter,
  type TestMessage,
} from "./helpers/use-chat-test-helpers";

vi.mock(import("#webui/hooks/chat/helpers/streaming-helpers"), async () => {
  const { streamingHelpersMockBody } =
    await import("./helpers/use-chat-test-helpers");

  return await streamingHelpersMockBody();
});

const mockAdapter = createMockAdapter();
const defaultProps: MockChatProps = createDefaultProps(mockAdapter);

/** A saved conversation the user switches TO mid-connect. */
const OTHER_CONVERSATION: TestMessage[] = [
  { role: "user", content: "hello" },
  { role: "assistant", content: "hi" },
];

/**
 * Props with an adapter override.
 * @param adapter - Adapter override for the props
 * @returns Default props carrying the given adapter
 */
function propsWith(adapter: typeof mockAdapter): MockChatProps {
  return { ...defaultProps, adapter };
}

/**
 * Park a first-ever send inside its MCP connect. Returns the handle to release
 * the connect, plus what the adapter recorded and the in-flight send promise.
 * @param gate - Held open by each stream after its first chunk
 * @returns The parked turn's controls and recordings
 */
function parkFirstSendInConnect(gate?: Promise<void>) {
  let releaseInit!: () => void;
  const connecting = new Promise<void>((resolve) => {
    releaseInit = resolve;
  });
  const clients: MockChatClient[] = [];
  const sent: string[] = [];
  const signals: AbortSignal[] = [];
  const adapter = trackingAdapter({ clients, sent, signals, gate }, (c) => {
    if (clients.length === 1) {
      c.initialize = vi.fn(async () => await connecting);
    }
  });
  const { result } = renderChat(propsWith(adapter));
  const send = act(async () => {
    await result.current.handleSend("first");
  });

  return { result, releaseInit, clients, sent, signals, send };
}

describe("turn invalidation during setup", () => {
  describe("Stop while parked in the connect", () => {
    it("doesn't stream a turn stopped mid-connect", async () => {
      // Stop can't reach a parked turn through the abort ref unless the turn
      // installed its controller BEFORE the connect. Without that it wakes up,
      // builds a fresh un-aborted controller and streams: tokens spent and tool
      // calls run against the Live Set while the composer reads idle.
      const { result, releaseInit, sent, send } = parkFirstSendInConnect();

      await tick();
      await stopResponse(result);

      releaseInit();
      await send;
      await tick();

      expect(sent).toStrictEqual([]);
      expect(result.current.isAssistantResponding).toBe(false);
    });

    it("still lets a later send run on the client the stopped turn built", async () => {
      // Bailing must not wedge the conversation: the connected client is fine,
      // so the next send adopts it and streams normally.
      const { result, releaseInit, clients, sent, send } =
        parkFirstSendInConnect();

      await tick();
      await stopResponse(result);

      releaseInit();
      await send;
      await tick();
      await act(async () => {
        await result.current.handleSend("second");
      });

      expect(clients).toHaveLength(1);
      expect(sent).toStrictEqual(["second"]);
    });
  });

  describe("conversation switch while parked in the connect", () => {
    it("keeps the restored conversation's history intact", async () => {
      // The abandoned turn used to reach its "Failed to initialize chat client"
      // throw (clearConversation nulled the client under it), and the error
      // recovery then stashed ITS user message as the pending history — the
      // conversation the user had just switched to lost everything but that
      // stray message, and the next send autosaved the truncation over it.
      const { result, releaseInit, send } = parkFirstSendInConnect();

      await tick();
      await act(() => {
        result.current.clearConversation();
      });
      await restoreHistory(result, OTHER_CONVERSATION);

      releaseInit();
      await send;
      await tick();

      expect(result.current.getChatHistory()).toStrictEqual(OTHER_CONVERSATION);
      expect(firstPartContent(result, "user")).toBe("hello");
      expect(firstPartContent(result, "model")).toBe("hi");
    });

    it("doesn't lock the abandoned turn's settings over the restored ones", async () => {
      // The parked init resolved its own model/provider snapshot on the way out
      // and applied it with no currency check, overwriting the settings the
      // restored conversation had just been given.
      const { result, releaseInit, send } = parkFirstSendInConnect();

      await tick();
      await act(() => {
        result.current.clearConversation();
      });
      await restoreHistory(
        result,
        OTHER_CONVERSATION,
        lockedSettings({ model: "restored-model" }),
      );

      releaseInit();
      await send;
      await tick();

      expect(result.current.activeModel).toBe("restored-model");
    });
  });

  describe("locked settings follow the client, not the turn", () => {
    it("locks the adopting turn to the settings its client connected with", async () => {
      // The superseded init must not apply its own lock, but it is also the only
      // turn that resolved one: the newer turn adopted its client and never
      // inits. Dropping the lock outright leaves the conversation with nothing
      // locked, so the next init falls back to current settings — the "restored
      // conversation silently switches model" bug the locking exists to prevent.
      let releaseStreams!: () => void;
      const gate = new Promise<void>((resolve) => {
        releaseStreams = resolve;
      });
      const { result, releaseInit, sent, send } = parkFirstSendInConnect(gate);

      await tick();
      await stopResponse(result);
      void act(() => {
        void result.current.handleSend("second");
      });
      await tick();

      releaseInit();
      await tick();

      expect(sent).toStrictEqual(["second"]);
      expect(result.current.activeModel).toBe("test-model");
      expect(result.current.activeProvider).toBe("gemini");

      releaseStreams();
      await send;
    });
  });
});
