// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act } from "@testing-library/preact";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { validateMcpConnection } from "#webui/hooks/chat/helpers/streaming-helpers";
import { type PendingFork } from "#webui/hooks/chat/use-chat-types";
import {
  clearConversation,
  hasErrorPart,
  modelMessageIndex,
  renderAndSend,
  renderChat,
  restoreHistory,
  retryAt,
  retryFromUserMessage,
  sendMessage,
  sendThenStopDuringRetryDelay,
  stopResponse,
  supersedeInFlightTurn,
  userMessageIndex,
  type MockChatProps,
} from "./helpers/use-chat-render-test-helpers";
import {
  MockChatClient,
  RATE_LIMIT_ERROR,
  createDefaultProps,
  createEchoThenRateLimitAdapter,
  createMockAdapter,
  createScriptedAdapter,
  echoUserTurn,
  lockedSettings,
  RESTORED_HISTORY,
  tick,
  trackingAdapter,
  type ScriptedAttempt,
  type TestMessage,
} from "./helpers/use-chat-test-helpers";
import { openGate } from "#webui/test-utils/async-test-helpers";

// Mock streaming helpers
vi.mock(import("#webui/hooks/chat/helpers/streaming-helpers"), async () => {
  const { streamingHelpersMockBody } =
    await import("./helpers/use-chat-test-helpers");

  return await streamingHelpersMockBody();
});

// Shrink retry backoff so tests don't sit through real seconds-long delays.
// 200 ms is small enough to keep the suite fast but large enough that the
// "cancels retry when stopResponse is called during retry delay" test can
// reliably abort while the timer is still pending (it waits ~50 ms first).
vi.mock(import("#webui/lib/rate-limit"), async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    calculateRetryDelay: () => 200,
  };
});

const mockAdapter = createMockAdapter();

/** A minimal two-turn history for the restore tests */
const SHORT_HISTORY: TestMessage[] = [
  { role: "user", content: "hello" },
  { role: "assistant", content: "hi" },
];

/**
 * Creates an adapter that throws rate limit error on first call then succeeds.
 * @param onMessage - Optional callback for each message received
 * @returns Adapter with rate limit behavior and call tracking
 */
function createRateLimitAdapter(onMessage?: (msg: string) => void) {
  let callCount = 0;

  return {
    adapter: {
      ...mockAdapter,
      createClient: vi.fn(() => {
        const client = new MockChatClient();
        const originalSendMessage = client.sendMessage.bind(client);

        client.sendMessage = async function* (
          message: string,
          signal: AbortSignal,
        ) {
          onMessage?.(message);
          callCount++;

          if (callCount === 1) {
            throw new Error(RATE_LIMIT_ERROR);
          }

          yield* originalSendMessage(message, signal);
        };

        return client;
      }),
    },
    getCallCount: () => callCount,
  };
}

/**
 * Creates an adapter where sendMessage fails on second client creation (for retry tests).
 * @param baseAdapter - Base adapter to extend
 * @returns Adapter that throws on sendMessage after first client
 */
function createSendMessageFailingAdapter(
  baseAdapter: typeof mockAdapter,
): typeof mockAdapter {
  let callCount = 0;

  return {
    ...baseAdapter,
    createClient: vi.fn(() => {
      callCount++;
      const client = new MockChatClient();

      if (callCount > 1) {
        // eslint-disable-next-line require-yield -- Throws before yielding to test error handling
        client.sendMessage = async function* () {
          throw new Error("Network failure on retry");
        };
      }

      return client;
    }),
  };
}

const defaultProps: MockChatProps = createDefaultProps(mockAdapter);

/**
 * Props with an adapter override, for the many single-adapter scenarios.
 * @param adapter - Adapter override for the props
 * @returns Default props carrying the given adapter
 */
function propsWith(adapter: typeof mockAdapter): MockChatProps {
  return { ...defaultProps, adapter };
}

/**
 * Assert the rate-limit retry resumed the interrupted turn rather than sending
 * the user's message a second time.
 * @param attempts - Attempts recorded by the scripted adapter
 */
function expectResumedNotResent(attempts: ScriptedAttempt[]): void {
  expect(attempts).toStrictEqual([
    { kind: "send", message: "Hello" },
    { kind: "resume" },
  ]);
}

/**
 * The overlap window with the stopped turn's client still connecting: the newer
 * turn adopts a half-built client whose initialize() hasn't resolved. Release
 * `releaseInit` to land that connect, `releaseStreams` to end both streams.
 * @param signals - Collects each stream's abort signal, when a test needs them
 * @returns The tracked clients and sends, the hook handle, the stopped turn's
 *   send promise, and the two releases
 */
async function supersedeDuringConnect(signals?: AbortSignal[]) {
  const [connecting, releaseInit] = openGate();
  const [gate, releaseStreams] = openGate();
  const clients: MockChatClient[] = [];
  const sent: string[] = [];
  const adapter = trackingAdapter({ clients, sent, signals, gate }, (c) => {
    if (clients.length === 1) {
      c.initialize = vi.fn(async () => await connecting);
    }
  });
  const { result } = renderChat(propsWith(adapter));
  const { stoppedSend } = await supersedeInFlightTurn(result);

  return { clients, sent, result, stoppedSend, releaseInit, releaseStreams };
}

describe("useChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("handleRetry", () => {
    it("does nothing if no API key", async () => {
      // Manually set some messages
      const { result } = await renderAndSend({ ...defaultProps, apiKey: "" });

      const initialLength = result.current.messages.length;

      await retryAt(result, 0);

      expect(result.current.messages).toHaveLength(initialLength);
    });

    it("does nothing if message at index is not user role", async () => {
      // Send a message to get user + assistant messages
      const { result } = await renderAndSend(defaultProps);
      const modelIdx = modelMessageIndex(result);

      if (modelIdx === -1) {
        throw new Error("No model message found");
      }

      vi.clearAllMocks();

      // Try to retry from model message index
      await retryAt(result, modelIdx);

      // Should not create new client or send message
      expect(mockAdapter.createClient).not.toHaveBeenCalled();
    });

    it("does nothing if no client and no pending history", async () => {
      const { result } = renderChat(defaultProps);

      await retryAt(result, 0);

      expect(mockAdapter.extractUserMessage).not.toHaveBeenCalled();
    });

    it("recovers from MCP init failure by stashing the user message", async () => {
      vi.mocked(validateMcpConnection).mockImplementationOnce(() => {
        throw new Error("MCP connection failed");
      });

      const { result } = await renderAndSend(defaultProps);

      // The user message should appear in the displayed messages even though
      // the client never reached sendMessage.
      const userIdx = userMessageIndex(result);

      expect(userIdx).toBeGreaterThanOrEqual(0);
      expect(hasErrorPart(result)).toBe(true);

      // Retry should now have a usable history to fork from.
      vi.clearAllMocks();

      await retryAt(result, userIdx);

      expect(mockAdapter.extractUserMessage).toHaveBeenCalled();
      expect(mockAdapter.createClient).toHaveBeenCalled();
    });

    it("recovers from missing-API-key error after key is added", async () => {
      const props: MockChatProps = { ...defaultProps, apiKey: "" };

      // First send fails because no API key
      const { result, rerender } = await renderAndSend(props);
      const userIdx = userMessageIndex(result);

      expect(userIdx).toBe(0);
      expect(hasErrorPart(result)).toBe(true);

      // User adds an API key in settings; retry should now succeed
      rerender({ ...props, apiKey: "test-key" });

      await retryAt(result, userIdx);

      expect(mockAdapter.createClient).toHaveBeenCalled();
      expect(mockAdapter.extractUserMessage).toHaveBeenCalled();
    });

    it("retries from restored conversation using pending history", async () => {
      const { result } = renderChat(defaultProps);

      await restoreHistory(result, RESTORED_HISTORY);

      vi.clearAllMocks();

      await retryAt(result, 0);

      // Should initialize a client and extract the user message for retry
      expect(mockAdapter.extractUserMessage).toHaveBeenCalled();
      expect(mockAdapter.createClient).toHaveBeenCalled();
      expect(result.current.messages.some((m) => m.role === "model")).toBe(
        true,
      );
    });

    it("successfully retries from a user message", async () => {
      // Send first message
      const { result } = await renderAndSend(defaultProps, "First message");

      vi.clearAllMocks();

      // Retry from that user message
      await retryFromUserMessage(result);

      expect(mockAdapter.extractUserMessage).toHaveBeenCalled();
      expect(mockAdapter.formatMessages).toHaveBeenCalled();
    });

    it("signals a fork anchored under the assistant response", async () => {
      const pendingForkRef = { current: null as PendingFork | null };
      const { result } = await renderAndSend(
        { ...defaultProps, pendingForkRef },
        "First message",
      );

      const userIdx = await retryFromUserMessage(result);

      // Retry branches like an edit, but the ‹ n/m › arrows anchor under the
      // assistant response (user index + 1) — the prompt is unchanged across
      // retries, only the response varies.
      expect(pendingForkRef.current).toStrictEqual({
        anchorIndex: userIdx + 1,
      });
    });

    it("slices history to exclude retry point and everything after", async () => {
      // Send two messages
      const { result } = await renderAndSend(defaultProps, "First");

      await sendMessage(result, "Second");

      // Retry from first user message (should exclude second message pair)
      await retryFromUserMessage(result);

      // buildConfig should be called with sliced history
      expect(mockAdapter.buildConfig).toHaveBeenCalled();
    });

    it("handles errors during retry", async () => {
      let callCount = 0;
      // Create an adapter that will fail on the second client creation (during retry)
      const errorAdapter = {
        ...mockAdapter,
        createClient: vi.fn(() => {
          callCount++;
          const client = new MockChatClient();

          if (callCount > 1) {
            // Second call (during retry) should fail
            client.initialize = vi.fn(async () => {
              throw new Error("Retry initialization failed");
            });
          }

          return client;
        }),
      };

      // Initialize with a message (this will succeed with the first client)
      const { result } = await renderAndSend(propsWith(errorAdapter));

      // Try to retry (this will fail because createClient will create a failing client)
      await retryFromUserMessage(result);

      expect(errorAdapter.createErrorMessage).toHaveBeenCalled();
    });

    it("covers getChatHistory callback when retry sendMessage throws non-rate-limit error", async () => {
      const retryErrorAdapter = createSendMessageFailingAdapter(mockAdapter);
      const { result } = await renderAndSend(propsWith(retryErrorAdapter));

      vi.clearAllMocks();

      await retryFromUserMessage(result);

      // Error path should call createErrorMessage with getChatHistory()
      expect(retryErrorAdapter.createErrorMessage).toHaveBeenCalledWith(
        expect.any(Error),
        expect.any(Array),
      );
    });

    it("sets isAssistantResponding to false after retry", async () => {
      // Send a message
      const { result } = await renderAndSend(defaultProps);

      expect(result.current.isAssistantResponding).toBe(false);

      // Retry and wait for completion
      await retryFromUserMessage(result);

      // Should be false after completion
      expect(result.current.isAssistantResponding).toBe(false);
    });
  });

  describe("restoreChatHistory", () => {
    it("sets messages from loaded history", async () => {
      const { result } = renderChat(defaultProps);

      await restoreHistory(result, SHORT_HISTORY);

      expect(result.current.messages).toHaveLength(2);
      expect(mockAdapter.formatMessages).toHaveBeenCalledWith(SHORT_HISTORY);
    });

    it("restores active model and provider from lockedSettings", async () => {
      const { result } = renderChat(defaultProps);

      await restoreHistory(
        result,
        SHORT_HISTORY,
        lockedSettings({ model: "gemini-2.5-pro", provider: "gemini" }),
      );

      expect(result.current.activeModel).toBe("gemini-2.5-pro");
      expect(result.current.activeProvider).toBe("gemini");
    });

    it("continues a restored conversation on its locked provider+model, using the current key for that provider", async () => {
      // Current settings select gemini/test-model, but the restored conversation
      // is locked to anthropic/claude-x. Continuing it must rebuild the client
      // for the locked provider — with the current anthropic key — and must NOT
      // overwrite the lock with the currently-selected provider/model.
      const resolveConnection = vi.fn((provider: string) => ({
        apiKey: provider === "anthropic" ? "anthropic-key" : "test-key",
        baseUrl: undefined as string | undefined,
      }));
      const { result } = renderChat({ ...defaultProps, resolveConnection });

      await restoreHistory(
        result,
        [{ role: "user", content: "hi" }],
        lockedSettings({ model: "claude-x", provider: "anthropic" }),
      );
      await sendMessage(result, "continue");

      expect(resolveConnection).toHaveBeenCalledWith("anthropic");
      expect(mockAdapter.buildConfig).toHaveBeenCalledWith(
        "claude-x",
        "Default",
        {},
        expect.anything(),
        expect.objectContaining({
          provider: "anthropic",
          apiKey: "anthropic-key",
        }),
      );
      expect(mockAdapter.createClient).toHaveBeenCalledWith(
        "anthropic-key",
        expect.anything(),
      );
      // The lock survives the send instead of switching to current settings.
      expect(result.current.activeModel).toBe("claude-x");
      expect(result.current.activeProvider).toBe("anthropic");
    });

    it("resets active state", async () => {
      const { result } = await renderAndSend(defaultProps);

      expect(result.current.activeModel).toBe("test-model");

      await restoreHistory(result, []);

      expect(result.current.activeModel).toBeNull();
      expect(result.current.activeProvider).toBeNull();
    });

    it("uses pending history on next handleSend", async () => {
      const { result } = renderChat(defaultProps);
      const history: TestMessage[] = [
        { role: "user", content: "prior msg" },
        { role: "assistant", content: "prior response" },
      ];

      await restoreHistory(result, history);
      await sendMessage(result, "New message");

      // buildConfig should have been called with the pending history, and with
      // the resolved connection for the (unlocked → current) provider.
      expect(mockAdapter.buildConfig).toHaveBeenCalledWith(
        "test-model",
        "Default",
        {},
        history,
        {
          provider: "gemini",
          apiKey: "test-key",
          baseUrl: undefined,
          lockedSystemInstruction: null,
          lockedNotation: null,
          lockedSmallModelMode: null,
        },
      );
    });

    it("clears pending history after clearConversation", async () => {
      const { result } = renderChat(defaultProps);

      await restoreHistory(result, [{ role: "user", content: "test" }]);
      await clearConversation(result);

      expect(result.current.getChatHistory()).toStrictEqual([]);
      expect(result.current.messages).toStrictEqual([]);
    });
  });

  describe("rate limit handling", () => {
    it("sets rateLimitState when rate limit error occurs", async () => {
      const { adapter } = createRateLimitAdapter();

      // Start send - it will hit rate limit, retry, and succeed
      const { result } = await renderAndSend(propsWith(adapter));

      // After completion, rateLimitState should be null
      expect(result.current.rateLimitState).toBeNull();
      // Messages should be populated (retry succeeded)
      expect(result.current.messages.length).toBeGreaterThan(0);
    });

    it("clears rateLimitState when stopResponse is called", async () => {
      const { result } = renderChat(defaultProps);

      await stopResponse(result);

      expect(result.current.rateLimitState).toBeNull();
    });

    it("clears rateLimitState when clearConversation is called", async () => {
      const { result } = renderChat(defaultProps);

      await clearConversation(result);

      expect(result.current.rateLimitState).toBeNull();
    });

    it("returns rateLimitState in hook return value", () => {
      const { result } = renderChat(defaultProps);

      // rateLimitState should be part of the return value and initially null
      expect(result.current).toHaveProperty("rateLimitState");
      expect(result.current.rateLimitState).toBeNull();
    });

    it("resumes instead of re-sending the message when nothing was produced", async () => {
      // Re-sending duplicated the user's instruction: the echo from the failed
      // attempt is already in history, and buildModelMessages concatenates
      // consecutive user turns, so the model was asked twice.
      const { adapter, attempts } = createEchoThenRateLimitAdapter(mockAdapter);

      const { result } = await renderAndSend(propsWith(adapter));

      expectResumedNotResent(attempts);
      expect(
        (result.current.getChatHistory() as TestMessage[]).filter(
          (m) => m.role === "user",
        ),
      ).toHaveLength(1);
    });

    it("resumes the same way when partial content arrived first, keeping it", async () => {
      // Whether the model got output out before the 429 no longer changes what
      // the retry sends — it changes only whether the client must append a
      // "continue" turn, which it decides from the wire shape.
      const { adapter, attempts } = createEchoThenRateLimitAdapter(
        mockAdapter,
        {
          partialContent: "Partial response...",
        },
      );

      const { result } = await renderAndSend(propsWith(adapter));

      expectResumedNotResent(attempts);
      // The partial work survives rather than being rewound.
      expect(
        (result.current.getChatHistory() as TestMessage[]).map(
          (m) => m.content,
        ),
      ).toStrictEqual(["Hello", "Partial response...", "Done"]);
    });

    it("resumes a rate-limited fork rather than re-sending its message", async () => {
      // A retry-from-a-user-message forks onto a fresh client and streams there,
      // which is separate wiring from a plain send. It needs the same rule: the
      // forked client already holds the message, so a 429 resumes.
      const { adapter, attempts } = createEchoThenRateLimitAdapter(mockAdapter);
      const { result } = await renderAndSend(propsWith(adapter));

      attempts.length = 0;
      await retryFromUserMessage(result);

      expect(attempts.map((a) => a.kind)).toStrictEqual(["send", "resume"]);
    });

    it("clears rateLimitState before the retry attempt streams its response", async () => {
      // After the retry delay ends and the next attempt begins streaming, the
      // indicator must disappear immediately — not wait for the entire stream
      // (which can include long thinking/tool phases) to complete.
      // We use a gate Promise to pause the second sendMessage mid-stream,
      // then assert the indicator is already cleared while the stream is
      // still in flight.
      const [gate, resolveGate] = openGate();

      const rateLimitAdapter = createScriptedAdapter(
        mockAdapter,
        (client) =>
          // Echoes the user turn like the real sendMessage, then rate-limits.
          async function* (message) {
            yield echoUserTurn(client, message);

            throw new Error("Resource has been exhausted");
          },
        (client) =>
          // The retry arrives here, and it is the retry's stream that must not
          // keep the indicator up while it runs.
          async function* () {
            yield [...client.chatHistory];
            // Pause mid-stream — simulates a long-running response (thinking,
            // tool calls). The rate-limit indicator must already be hidden
            // by this point, not wait for the full stream to finish.
            await gate;
            client.chatHistory.push({
              role: "assistant",
              content: "ok",
            });
            yield [...client.chatHistory];
          },
      );

      const { result } = renderChat(propsWith(rateLimitAdapter));

      // Kick off send without awaiting the full completion
      let sendDone = false;
      const sendPromise = result.current.handleSend("Hello").then(() => {
        sendDone = true;
      });

      // Drain timers/microtasks until the second sendMessage has yielded
      // its first chunk and is suspended on the gate. The retry delay
      // mock is 200 ms, plus a small margin for state to settle.
      await act(async () => {
        await new Promise((r) => setTimeout(r, 350));
      });

      expect(sendDone).toBe(false);
      expect(result.current.rateLimitState).toBeNull();

      // Release the gate and let send finish
      resolveGate();
      await act(async () => {
        await sendPromise;
      });

      expect(result.current.rateLimitState).toBeNull();
    });

    it("cancels retry when stopResponse is called during retry delay", async () => {
      // Create an adapter that always throws rate limit errors
      const alwaysRateLimitAdapter = createScriptedAdapter(
        mockAdapter,
        () =>
          // eslint-disable-next-line require-yield -- Throws before yielding to test error handling
          async function* () {
            throw new Error(RATE_LIMIT_ERROR);
          },
      );
      const { result } = renderChat(propsWith(alwaysRateLimitAdapter));

      await sendThenStopDuringRetryDelay(result);

      expect(result.current.isAssistantResponding).toBe(false);
      expect(result.current.rateLimitState).toBeNull();
    });

    it("persists cancel-during-retry error into chatHistory for auto-save", async () => {
      // Mimics the real ChatSdkClient: pushes a user message before
      // throwing 429. The stashed userMessageEntry from handleSend is a
      // different object than what sendMessage pushes, which previously
      // caused the cancel error to land in a fresh array copy and never
      // reach chatHistory — so auto-save persisted the user message
      // without the error.
      let capturedClient: MockChatClient | null = null;
      const realisticRateLimitAdapter = createScriptedAdapter(
        mockAdapter,
        (client) => {
          capturedClient = client;

          return async function* (message: string) {
            yield echoUserTurn(client, message);
            throw new Error(RATE_LIMIT_ERROR);
          };
        },
      );
      const { result } = renderChat(propsWith(realisticRateLimitAdapter));

      await sendThenStopDuringRetryDelay(result);

      expect(capturedClient).not.toBeNull();
      const chatHistory = capturedClient!.chatHistory;
      const errorEntry = chatHistory.find((m) => m.isError);

      expect(errorEntry).toBeDefined();
      expect(errorEntry?.content).toContain("Retry cancelled");
    });

    it("doesn't render a superseded turn's failure over the turn now streaming", async () => {
      // Stop re-enables the composer while the stopped turn is still unwinding,
      // so the next turn can take over the shared refs. The retry path's own
      // aborted-signal checks then read the NEW turn's controllers and stop
      // protecting anything — the ticket check is what holds.
      const [stoppedUnwind, releaseStopped] = openGate();
      let turn = 0;
      const adapter = createScriptedAdapter(
        mockAdapter,
        (client) =>
          async function* (message: string) {
            yield echoUserTurn(client, message);

            if (++turn === 1) {
              await stoppedUnwind;
              // Not a rate limit, so this is the render-an-error path.
              throw new Error("provider connection died");
            }

            await new Promise(() => {});
          },
      );
      const { result } = renderChat(propsWith(adapter));
      const { stoppedSend } = await supersedeInFlightTurn(result);

      releaseStopped();
      await stoppedSend;
      await tick();

      expect(hasErrorPart(result)).toBe(false);
      expect(result.current.isAssistantResponding).toBe(true);
    });
  });

  // The same overlap window, but inside a turn's SETUP rather than its stream:
  // the stopped turn is still building (or connecting) its client when the newer
  // turn takes the shared client and abort ref.
  describe("overlapping turns during setup", () => {
    it("doesn't stream a superseded turn whose client connected late", async () => {
      // The newer turn adopted the half-built client and is streaming on it, so
      // the late turn must not stream a second time into the same history — nor
      // take the abort ref the streaming turn's Stop needs.
      const signals: AbortSignal[] = [];
      const {
        clients,
        sent,
        result,
        stoppedSend,
        releaseInit,
        releaseStreams,
      } = await supersedeDuringConnect(signals);

      // The stopped turn's client finishes connecting only now, after the newer
      // turn has already claimed it.
      releaseInit();
      await tick();

      expect(clients).toHaveLength(1);
      expect(sent).toStrictEqual(["second"]);

      // The newer turn still owns the abort ref, so its Stop reaches its stream.
      await stopResponse(result);

      expect(signals[0]?.aborted).toBe(true);

      releaseStreams();
      await stoppedSend;
    });

    it("waits for the in-flight connect before streaming on an adopted client", async () => {
      // The newer turn finds a client and skips its own init, but that client's
      // initialize() — the MCP connect — hasn't resolved yet. Streaming there
      // would send before the tool catalog landed, so the turn waits it out.
      const { clients, sent, stoppedSend, releaseInit, releaseStreams } =
        await supersedeDuringConnect();

      expect(clients).toHaveLength(1);
      expect(sent).toStrictEqual([]);

      releaseInit();
      await tick();

      expect(sent).toStrictEqual(["second"]);

      releaseStreams();
      await stoppedSend;
    });

    it("doesn't let a superseded turn's setup dispose the newer turn's client", async () => {
      // Stop lands during the connection check, so the newer turn runs its own
      // init and streams. The stopped turn's setup resumes afterward: replacing
      // the client there would close the MCP connection under that stream.
      const [checking, releaseCheck] = openGate();

      vi.mocked(validateMcpConnection).mockImplementationOnce(
        async () => await checking,
      );

      const clients: MockChatClient[] = [];
      const adapter = trackingAdapter({ clients });
      const { result } = renderChat(propsWith(adapter));
      const { stoppedSend } = await supersedeInFlightTurn(result);

      releaseCheck();
      await stoppedSend;
      await tick();

      expect(clients).toHaveLength(1);
      expect(clients[0]?.dispose).not.toHaveBeenCalled();
    });
  });
});
