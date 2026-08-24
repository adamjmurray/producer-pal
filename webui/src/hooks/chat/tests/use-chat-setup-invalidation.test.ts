// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act } from "@testing-library/preact";
import { describe, expect, it, vi } from "vitest";
import { validateMcpConnection } from "#webui/hooks/chat/helpers/streaming-helpers";
import {
  firstPartContent,
  hasErrorPart,
  renderChat,
  restoreHistory,
  sendMessage,
  stopResponse,
  userMessageIndex,
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
import { openGate } from "#webui/test-utils/async-test-helpers";

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
 * An adapter whose Nth client hangs in its MCP connect until released.
 * @param nth - 1-based client whose initialize parks
 * @param recorded - Arrays the adapter records into, plus the stream gate
 * @returns The adapter and the handle that releases the connect
 */
function adapterParkedInConnect(
  nth: number,
  recorded: Parameters<typeof trackingAdapter>[0],
) {
  const [connecting, releaseInit] = openGate();
  const adapter = trackingAdapter(recorded, (client) => {
    if (recorded.clients.length === nth) {
      client.initialize = vi.fn(async () => await connecting);
    }
  });

  return { adapter, releaseInit };
}

/**
 * Park a first-ever send inside its MCP connect. Returns the handle to release
 * the connect, plus what the adapter recorded and the in-flight send promise.
 * @param gate - Held open by each stream after its first chunk
 * @returns The parked turn's controls and recordings
 */
function parkFirstSendInConnect(gate?: Promise<void>) {
  const clients: MockChatClient[] = [];
  const sent: string[] = [];
  const signals: AbortSignal[] = [];
  const { adapter, releaseInit } = adapterParkedInConnect(1, {
    clients,
    sent,
    signals,
    gate,
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

    it("doesn't stream a retry stopped mid-connect", async () => {
      // Retry and Edit fork through their own initializeChat, so they need the
      // same guard as the send path — and only the send path had a test.
      const clients: MockChatClient[] = [];
      const sent: string[] = [];
      // The second client is the fork's, not the one the first send built.
      const { adapter, releaseInit } = adapterParkedInConnect(2, {
        clients,
        sent,
      });
      const { result } = renderChat(propsWith(adapter));

      await sendMessage(result, "first");

      const retry = act(async () => {
        await result.current.handleRetry(userMessageIndex(result));
      });

      await tick();
      await stopResponse(result);

      releaseInit();
      await retry;
      await tick();

      // Only the original send. The fork never re-sent it.
      expect(sent).toStrictEqual(["first"]);
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

    it("keeps it intact when the parked setup fails rather than resolves", async () => {
      // The bail on a successful setup is only half of it: when the setup
      // itself rejects (MCP down, a connect torn up by the switch), the
      // rejection goes straight to the turn's error recovery, which renders and
      // stashes against whatever conversation is loaded now. B's transcript
      // grew a stray user bubble and an error from A, and the next autosave
      // wrote that stray message over B.
      const [checking, releaseCheck] = openGate();

      vi.mocked(validateMcpConnection).mockImplementationOnce(async () => {
        await checking;

        throw new Error("MCP connection failed");
      });

      const { result } = renderChat(defaultProps);
      const send = act(async () => {
        await result.current.handleSend("first");
      });

      await tick();
      await act(() => {
        result.current.clearConversation();
      });
      await restoreHistory(result, OTHER_CONVERSATION);

      releaseCheck();
      await send;
      await tick();

      expect(result.current.getChatHistory()).toStrictEqual(OTHER_CONVERSATION);
      expect(result.current.messages).toHaveLength(2);
      expect(hasErrorPart(result)).toBe(false);
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
      const [gate, releaseStreams] = openGate();
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

describe("setup failure on a restored conversation", () => {
  it("renders the restored conversation under the failed send", async () => {
    // MCP down: validateMcpConnection throws before a client exists, so the
    // recovery has only the restored history to render against. Nulling it up
    // front left an empty base, so the whole transcript was replaced by the one
    // message that failed to send — and the teardown autosave then wrote that
    // truncation over the saved record.
    const { result } = renderChat(defaultProps);

    await restoreHistory(result, OTHER_CONVERSATION);
    vi.mocked(validateMcpConnection).mockRejectedValueOnce(
      new Error("MCP connection failed"),
    );
    await sendMessage(result, "add a hi-hat");

    expect(result.current.getChatHistory()).toStrictEqual([
      ...OTHER_CONVERSATION,
      { role: "user", content: "add a hi-hat" },
      {
        role: "assistant",
        content: expect.stringContaining("MCP connection failed"),
        isError: true,
      },
    ]);
    expect(firstPartContent(result, "user")).toBe("hello");
  });

  it("bootstraps the next send from the whole conversation", async () => {
    // The send after the failure builds the client from the pending history. If
    // the failure left only its own message there, the conversation the user
    // reopened is gone for good once that client's stream autosaves.
    const { result } = renderChat(defaultProps);

    await restoreHistory(result, OTHER_CONVERSATION);
    vi.mocked(validateMcpConnection).mockRejectedValueOnce(
      new Error("MCP connection failed"),
    );
    await sendMessage(result, "add a hi-hat");
    await sendMessage(result, "add a hi-hat");

    expect(vi.mocked(mockAdapter.buildConfig).mock.lastCall?.[3]).toStrictEqual(
      [
        ...OTHER_CONVERSATION,
        { role: "user", content: "add a hi-hat" },
        expect.objectContaining({ isError: true }),
      ],
    );
  });
});
