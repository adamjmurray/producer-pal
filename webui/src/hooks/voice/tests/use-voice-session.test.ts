// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook, waitFor } from "@testing-library/preact";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { createVoiceSessionTestKit } from "./use-voice-session-test-helpers";

const mocks = vi.hoisted(() => {
  class FakeSession {
    static instances: FakeSession[] = [];
    transport = { sendEvent: vi.fn() };
    listeners = new Map<string, ((...args: unknown[]) => void)[]>();
    closed = false;
    connectArgs: unknown = null;
    constructor(
      public agent: unknown,
      public options: unknown,
    ) {
      FakeSession.instances.push(this);
    }

    on(event: string, handler: (...args: unknown[]) => void) {
      const arr = this.listeners.get(event) ?? [];

      arr.push(handler);
      this.listeners.set(event, arr);
    }

    emit(event: string, payload: unknown) {
      for (const h of this.listeners.get(event) ?? []) h(payload);
    }

    connect(args: unknown) {
      this.connectArgs = args;

      return Promise.resolve();
    }

    mute = vi.fn();
    interrupt = vi.fn();
    updateHistory = vi.fn();
    close = vi.fn(() => {
      this.closed = true;
    });
  }

  class FakeAgent {
    constructor(opts: unknown) {
      Object.assign(this, opts as object);
    }
  }

  class FakeTransport {
    static instances: FakeTransport[] = [];
    on = vi.fn();
    constructor() {
      FakeTransport.instances.push(this);
    }
  }

  return {
    FakeSession,
    FakeAgent,
    FakeTransport,
    createRealtimeMcpTools: vi.fn(),
    fetchMock: vi.fn(),
  };
});

// The factory return type must satisfy a Partial<typeof module>, which the
// real classes have static methods (RealtimeAgent.create, etc.) that our test
// doubles don't replicate. Cast through `never` since the doubles are only
// used via their construct signatures.
vi.mock(import("@openai/agents/realtime"), () => ({
  RealtimeAgent: mocks.FakeAgent as never,
  RealtimeSession: mocks.FakeSession as never,
  OpenAIRealtimeWebRTC: mocks.FakeTransport as never,
}));

vi.mock(import("#webui/hooks/voice/realtime-mcp-tools"), () => ({
  createRealtimeMcpTools: mocks.createRealtimeMcpTools,
}));

import { useVoiceSession } from "#webui/hooks/voice/use-voice-session";

const {
  defaultParams,
  stubFetchOk,
  renderAndConnect,
  connectAndGetSession,
  connectWithSeed,
  emitResponseFailure,
  fireTransportDisconnect,
  teardownDuring,
} = createVoiceSessionTestKit(mocks);

const REAL_FETCH = globalThis.fetch;

beforeEach(() => {
  mocks.FakeSession.instances = [];
  mocks.FakeTransport.instances = [];
  mocks.createRealtimeMcpTools.mockResolvedValue({
    tools: [],
    mcpClient: { close: vi.fn(async () => {}) },
  });
  mocks.fetchMock.mockReset();
  globalThis.fetch = mocks.fetchMock as unknown as typeof globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = REAL_FETCH;
});

afterAll(() => {
  globalThis.fetch = REAL_FETCH;
});

describe("useVoiceSession initial state", () => {
  it("starts in 'idle' with empty history and no error", () => {
    const { result } = renderHook(() => useVoiceSession(defaultParams()));

    expect(result.current.status).toBe("idle");
    expect(result.current.history).toStrictEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.isMuted).toBe(false);
    expect(result.current.assistantSpeaking).toBe(false);
    expect(result.current.assistantThinking).toBe(false);
    expect(result.current.rateLimitedUntil).toBeNull();
  });
});

describe("useVoiceSession.connect", () => {
  it("sets error when openAiKey is null and never opens a session", async () => {
    const { result } = renderHook(() =>
      useVoiceSession(defaultParams({ openAiKey: null })),
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toMatch(/openai api key/i);
    expect(mocks.FakeSession.instances).toHaveLength(0);
  });

  it("happy path: builds session, fetches ephemeral token, sets status to 'connected'", async () => {
    stubFetchOk({ value: "ek_abc" });
    const { result } = await renderAndConnect();

    expect(result.current.status).toBe("connected");
    expect(mocks.FakeSession.instances).toHaveLength(1);
    const session = mocks.FakeSession.instances[0]!;

    expect(session.connectArgs).toStrictEqual({ apiKey: "ek_abc" });

    // POSTed to the voice-token URL with the API key in the header.
    expect(mocks.fetchMock).toHaveBeenCalledWith(
      "http://localhost:3350/voice-token",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "X-OpenAI-Key": "sk-test" }),
      }),
    );
  });

  it("surfaces an error and tears down when /voice-token returns non-200", async () => {
    mocks.fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "bad key" }), {
        status: 401,
        statusText: "Unauthorized",
        headers: { "Content-Type": "application/json" },
      }),
    );
    const { result } = await renderAndConnect();

    expect(result.current.status).toBe("error");
    expect(result.current.error).toContain("401");
  });

  it("handles non-JSON body from /voice-token without crashing", async () => {
    mocks.fetchMock.mockResolvedValue(
      new Response("not json at all", {
        status: 500,
        statusText: "Server Error",
        headers: { "Content-Type": "text/plain" },
      }),
    );
    const { result } = await renderAndConnect();

    expect(result.current.status).toBe("error");
    expect(result.current.error).toContain("500");
  });

  it("surfaces an error when /voice-token returns 200 but no 'value' field", async () => {
    stubFetchOk({ expires_at: 123 });
    const { result } = await renderAndConnect();

    expect(result.current.status).toBe("error");
    expect(result.current.error).toMatch(/value/i);
  });

  it("seeds initialHistory: rewrites audio→text, passes text through, drops untranscribed audio and function_calls", async () => {
    stubFetchOk({ value: "ek_x" });

    const initialHistory = [
      // user audio with transcript → input_text
      {
        itemId: "u-audio",
        type: "message",
        role: "user",
        status: "completed",
        content: [{ type: "input_audio", transcript: "earlier" }],
      },
      // user mixed: untranscribed audio is dropped, typed text survives
      {
        itemId: "u-mixed",
        type: "message",
        role: "user",
        status: "completed",
        content: [
          { type: "input_audio", transcript: null },
          { type: "input_text", text: "typed too" },
        ],
      },
      // user with only untranscribed audio → whole item dropped
      {
        itemId: "u-pending",
        type: "message",
        role: "user",
        status: "in_progress",
        content: [{ type: "input_audio", transcript: null }],
      },
      // function_call: dropped (SDK refuses to re-add)
      {
        itemId: "fc1",
        type: "function_call",
        status: "completed",
        name: "ppal-read-track",
        arguments: "{}",
        output: '{"ok":true}',
      },
      // assistant audio with transcript → output_text
      {
        itemId: "a-audio",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_audio", transcript: "ok" }],
      },
      // assistant pre-existing text → passes through
      {
        itemId: "a-text",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_text", text: "reply" }],
      },
      // system message → passes through
      {
        itemId: "sys",
        type: "message",
        role: "system",
        content: [{ type: "input_text", text: "system note" }],
      },
    ];

    await connectWithSeed(initialHistory);

    const session = mocks.FakeSession.instances[0]!;
    const args = session.updateHistory.mock.calls[0]?.[0] as
      | { itemId: string; content: { type: string; text: string }[] }[]
      | undefined;

    expect(args).toBeDefined();
    expect(args!.map((i) => i.itemId)).toStrictEqual([
      "u-audio",
      "u-mixed",
      "a-audio",
      "a-text",
      "sys",
    ]);
    expect(args![0]!.content).toStrictEqual([
      { type: "input_text", text: "earlier" },
    ]);
    expect(args![1]!.content).toStrictEqual([
      { type: "input_text", text: "typed too" },
    ]);
    expect(args![2]!.content).toStrictEqual([
      { type: "output_text", text: "ok" },
    ]);
  });

  it("does not call updateHistory when initialHistory is empty or omitted", async () => {
    const { session } = await connectAndGetSession();

    expect(session.updateHistory).not.toHaveBeenCalled();
  });

  it("skips updateHistory when initialHistory contains only function_call items", async () => {
    stubFetchOk({ value: "ek_x" });
    const onlyFunctionCalls = [
      {
        itemId: "fc1",
        type: "function_call",
        status: "completed",
        name: "ppal-read-track",
        arguments: "{}",
        output: '{"ok":true}',
      },
    ];

    const result = await connectWithSeed(onlyFunctionCalls);

    expect(result.current.status).toBe("connected");
    expect(
      mocks.FakeSession.instances[0]!.updateHistory,
    ).not.toHaveBeenCalled();
  });

  it("is a no-op when called twice in a row (second call ignored)", async () => {
    stubFetchOk({ value: "ek_x" });

    const { result } = renderHook(() => useVoiceSession(defaultParams()));

    await act(async () => {
      await result.current.connect();
      await result.current.connect();
    });

    expect(mocks.FakeSession.instances).toHaveLength(1);
  });

  it("ignores a concurrent connect() during the await window", async () => {
    stubFetchOk({ value: "ek_x" });
    const { result } = renderHook(() => useVoiceSession(defaultParams()));

    // The second connect lands before the first resolves its awaits (MCP-tool
    // setup, token fetch). sessionRef isn't set yet, so only connectingRef
    // guards against a duplicate session + leaked MCP client.
    await act(async () => {
      await Promise.all([result.current.connect(), result.current.connect()]);
    });

    expect(mocks.FakeSession.instances).toHaveLength(1);
    expect(result.current.status).toBe("connected");
  });

  it("aborts and closes the MCP client when torn down during MCP setup (no hot-mic leak)", async () => {
    const { mcpClose, sessions } = await teardownDuring("mcp");

    // The resumed connect detected the teardown: it closed the just-created
    // client and never built a session (no peer connection / mic opened).
    expect(mcpClose).toHaveBeenCalledTimes(1);
    expect(sessions).toHaveLength(0);
  });

  it("aborts before session.connect when torn down during the token fetch", async () => {
    const { sessions } = await teardownDuring("token");

    // A session was built but session.connect() was never called: no peer
    // connection / mic was opened.
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.connectArgs).toBeNull();
    expect(sessions[0]!.close).toHaveBeenCalled();
  });
});

describe("useVoiceSession connection drop", () => {
  it("surfaces a dropped connection, resets latched flags, and cleans up for reconnect", async () => {
    const { result, session } = await connectAndGetSession();

    // Latch the thinking indicator, as if a drop landed mid-response.
    await act(() => {
      session.emit("transport_event", { type: "response.created" });
    });
    expect(result.current.assistantThinking).toBe(true);

    // Network drop: the transport fires "disconnected" unprompted.
    await act(async () => {
      fireTransportDisconnect();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toMatch(/connection lost/i);
    // The latched indicator is cleared so the UI doesn't hang on "Thinking…".
    expect(result.current.assistantThinking).toBe(false);
    // cleanup() closed the dead session and cleared the refs, so Talk reconnects.
    expect(session.close).toHaveBeenCalled();
  });

  it("ignores the transport 'disconnected' event during an intentional disconnect", async () => {
    const { result, session } = await connectAndGetSession();

    await act(async () => {
      await result.current.disconnect();
    });

    expect(session.close).toHaveBeenCalled();
    expect(result.current.status).toBe("idle");

    // disconnect() set the intentional-close flag, so the transport's
    // "disconnected" (real or a late stray) must not surface a lost-connection
    // error.
    await act(() => {
      fireTransportDisconnect();
    });
    expect(result.current.status).toBe("idle");
    expect(result.current.error).toBeNull();
  });
});

describe("useVoiceSession transport event handling", () => {
  it("response.created sets assistantThinking=true; response.done clears it", async () => {
    const { result, session } = await connectAndGetSession();

    await act(() => {
      session.emit("transport_event", { type: "response.created" });
    });
    expect(result.current.assistantThinking).toBe(true);

    await act(() => {
      session.emit("transport_event", {
        type: "response.done",
        response: { status: "completed" },
      });
    });
    expect(result.current.assistantThinking).toBe(false);
  });

  it("output_audio_buffer.started/stopped toggle assistantSpeaking", async () => {
    const { result, session } = await connectAndGetSession();

    await act(() => {
      session.emit("transport_event", { type: "output_audio_buffer.started" });
    });
    expect(result.current.assistantSpeaking).toBe(true);

    await act(() => {
      session.emit("transport_event", { type: "output_audio_buffer.stopped" });
    });
    expect(result.current.assistantSpeaking).toBe(false);

    // .cleared also clears the flag
    await act(() => {
      session.emit("transport_event", { type: "output_audio_buffer.started" });
      session.emit("transport_event", { type: "output_audio_buffer.cleared" });
    });
    expect(result.current.assistantSpeaking).toBe(false);
  });

  it("clears a prior error when the next response.created arrives", async () => {
    const { result, session } = await connectAndGetSession();

    await emitResponseFailure(session, "content_filter", "blocked");
    expect(result.current.error).toBe("blocked");

    await act(() => {
      session.emit("transport_event", { type: "response.created" });
    });
    expect(result.current.error).toBeNull();
  });

  it("response.done with status=failed and rate_limit_exceeded sets the countdown", async () => {
    const { result, session } = await connectAndGetSession();
    const before = Date.now();

    await emitResponseFailure(
      session,
      "rate_limit_exceeded",
      "Rate limit exceeded. Please try again in 7.5s. (TPM bucket)",
    );

    expect(result.current.error).toMatch(/rate limit/i);
    expect(result.current.rateLimitedUntil).not.toBeNull();
    // ~7.5s from 'now'; allow generous slack for slow runners.
    const expected = before + 7500;

    expect(result.current.rateLimitedUntil!).toBeGreaterThan(before);
    expect(result.current.rateLimitedUntil!).toBeLessThanOrEqual(
      expected + 500,
    );
  });

  it("response.done with a failure that lacks a parseable retry seconds keeps rateLimitedUntil=null", async () => {
    const { result, session } = await connectAndGetSession();

    await emitResponseFailure(session, "content_filter", "blocked");

    expect(result.current.error).toBe("blocked");
    expect(result.current.rateLimitedUntil).toBeNull();
  });

  it("rate_limit_exceeded without a 'try again in Xs' pattern keeps rateLimitedUntil=null", async () => {
    const { result, session } = await connectAndGetSession();

    await emitResponseFailure(
      session,
      "rate_limit_exceeded",
      "Rate limit exceeded (no retry hint).",
    );

    expect(result.current.error).toMatch(/rate limit/i);
    expect(result.current.rateLimitedUntil).toBeNull();
  });

  it("a successful response.done clears a prior rate-limit indicator", async () => {
    const { result, session } = await connectAndGetSession();

    await emitResponseFailure(
      session,
      "rate_limit_exceeded",
      "Please try again in 3s",
    );
    expect(result.current.rateLimitedUntil).not.toBeNull();

    await act(() => {
      session.emit("transport_event", {
        type: "response.done",
        response: { status: "completed" },
      });
    });
    expect(result.current.rateLimitedUntil).toBeNull();
  });

  it("history_updated copies items; history survives disconnect; resetHistory clears it", async () => {
    const { result, session } = await connectAndGetSession();

    await act(() => {
      session.emit("history_updated", [{ itemId: "i1", type: "message" }]);
    });
    await act(async () => {
      await result.current.disconnect();
    });
    expect(result.current.history).toHaveLength(1);

    await act(() => {
      result.current.resetHistory();
    });
    expect(result.current.history).toStrictEqual([]);
  });

  it("session.error sets the error state with a string message for Errors, strings, and object payloads", async () => {
    const { result, session } = await connectAndGetSession();

    await act(() => {
      session.emit("error", { type: "error", error: new Error("boom") });
    });
    expect(result.current.error).toBe("boom");

    await act(() => {
      session.emit("error", { type: "error", error: "plain string" });
    });
    expect(result.current.error).toBe("plain string");

    // Server-side errors come through as plain objects — extract .message
    // rather than letting String(obj) produce "[object Object]".
    await act(() => {
      session.emit("error", {
        type: "error",
        error: { type: "invalid_request_error", message: "bad item" },
      });
    });
    expect(result.current.error).toBe("bad item");

    // Nested { error: { message } } shape, also stringified safely otherwise
    await act(() => {
      session.emit("error", {
        type: "error",
        error: { error: { code: "x", message: "nested message" } },
      });
    });
    expect(result.current.error).toBe("nested message");

    // Opaque object: must JSON-stringify (not "[object Object]")
    await act(() => {
      session.emit("error", {
        type: "error",
        error: { weird: "shape" },
      });
    });
    expect(result.current.error).toBe('{"weird":"shape"}');

    // Non-string, non-object: falls back to String()
    await act(() => {
      session.emit("error", { type: "error", error: 42 });
    });
    expect(result.current.error).toBe("42");
  });

  it("session.error stringifies an object with a circular reference safely", async () => {
    const { result, session } = await connectAndGetSession();
    const circular: Record<string, unknown> = { kind: "loop" };

    circular.self = circular;

    await act(() => {
      session.emit("error", { type: "error", error: circular });
    });
    expect(result.current.error).toMatch(/loop|object/i);
  });
});

describe("useVoiceSession mute / interrupt / retry", () => {
  it("toggleMute calls session.mute and flips isMuted", async () => {
    const { result, session } = await connectAndGetSession();

    await act(async () => {
      await result.current.toggleMute();
    });
    expect(session.mute).toHaveBeenLastCalledWith(true);
    expect(result.current.isMuted).toBe(true);

    await act(async () => {
      await result.current.toggleMute();
    });
    expect(session.mute).toHaveBeenLastCalledWith(false);
    expect(result.current.isMuted).toBe(false);
  });

  it("toggleMute is a no-op when not connected", async () => {
    const { result } = renderHook(() => useVoiceSession(defaultParams()));

    await act(async () => {
      await result.current.toggleMute();
    });
    expect(result.current.isMuted).toBe(false);
  });

  it("toggleMute surfaces the SDK error if mute() throws", async () => {
    const { result, session } = await connectAndGetSession();

    session.mute.mockImplementationOnce(() => {
      throw new Error("transport does not support mute");
    });

    await act(async () => {
      await result.current.toggleMute();
    });
    expect(result.current.error).toMatch(/transport does not support mute/);
  });

  it("interrupt() delegates to session.interrupt", async () => {
    const { result, session } = await connectAndGetSession();

    await act(() => {
      result.current.interrupt();
    });
    expect(session.interrupt).toHaveBeenCalled();
  });

  it("interrupt() is a no-op when not connected", async () => {
    const { result } = renderHook(() => useVoiceSession(defaultParams()));

    await act(() => {
      result.current.interrupt();
    });
    expect(result.current.error).toBeNull();
  });

  it("interrupt() surfaces SDK errors", async () => {
    const { result, session } = await connectAndGetSession();

    session.interrupt.mockImplementationOnce(() => {
      throw new Error("nothing to interrupt");
    });

    await act(() => {
      result.current.interrupt();
    });
    expect(result.current.error).toMatch(/nothing to interrupt/);
  });

  it("retryResponse sends response.create and clears the rate-limit + error state", async () => {
    const { result, session } = await connectAndGetSession();

    // Force into rate-limited state first.
    await act(() => {
      session.emit("transport_event", {
        type: "response.done",
        response: {
          status: "failed",
          status_details: {
            error: {
              code: "rate_limit_exceeded",
              message: "Please try again in 1s",
            },
          },
        },
      });
    });
    expect(result.current.rateLimitedUntil).not.toBeNull();

    await act(() => {
      result.current.retryResponse();
    });
    expect(session.transport.sendEvent).toHaveBeenCalledWith({
      type: "response.create",
    });
    expect(result.current.rateLimitedUntil).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it("retryResponse surfaces SDK errors", async () => {
    const { result, session } = await connectAndGetSession();

    session.transport.sendEvent.mockImplementationOnce(() => {
      throw new Error("send failed");
    });

    await act(() => {
      result.current.retryResponse();
    });
    expect(result.current.error).toMatch(/send failed/);
  });

  it("response.done failure without an error.code falls back to 'unknown'", async () => {
    const { result, session } = await connectAndGetSession();

    await act(() => {
      session.emit("transport_event", {
        type: "response.done",
        response: {
          status: "failed",
          status_details: { error: { message: "no code provided" } },
        },
      });
    });
    expect(result.current.error).toBe("no code provided");
  });

  it("response.done failure with neither code nor message uses the literal fallback", async () => {
    const { result, session } = await connectAndGetSession();

    await act(() => {
      session.emit("transport_event", {
        type: "response.done",
        response: {
          status: "failed",
          status_details: { error: {} },
        },
      });
    });
    expect(result.current.error).toBe("Response failed");
  });

  it("retryResponse is a no-op when not connected", async () => {
    const { result } = renderHook(() => useVoiceSession(defaultParams()));

    await act(() => {
      result.current.retryResponse();
    });
    expect(result.current.error).toBeNull();
  });

  it("non-Error throws from mute/interrupt/sendEvent are stringified into error state", async () => {
    const { result, session } = await connectAndGetSession();

    session.mute.mockImplementationOnce(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- exercising the non-Error branch
      throw "mute exploded";
    });
    await act(async () => {
      await result.current.toggleMute();
    });
    expect(result.current.error).toBe("mute exploded");

    session.interrupt.mockImplementationOnce(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- exercising the non-Error branch
      throw "interrupt exploded";
    });
    await act(() => {
      result.current.interrupt();
    });
    expect(result.current.error).toBe("interrupt exploded");

    session.transport.sendEvent.mockImplementationOnce(() => {
      // eslint-disable-next-line @typescript-eslint/only-throw-error -- exercising the non-Error branch
      throw "send exploded";
    });
    await act(() => {
      result.current.retryResponse();
    });
    expect(result.current.error).toBe("send exploded");
  });
});

describe("useVoiceSession.disconnect", () => {
  it("closes the session, transitions through 'disconnecting' to 'idle', resets mute", async () => {
    const { result, session } = await connectAndGetSession();

    await act(async () => {
      await result.current.disconnect();
    });

    expect(session.close).toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
    expect(result.current.isMuted).toBe(false);
  });

  it("cleanup runs on unmount without throwing", async () => {
    stubFetchOk({ value: "ek_x" });

    const { result, unmount } = renderHook(() =>
      useVoiceSession(defaultParams()),
    );

    await act(async () => {
      await result.current.connect();
    });

    expect(() => unmount()).not.toThrow();
    await waitFor(() => {
      expect(mocks.FakeSession.instances[0]!.close).toHaveBeenCalled();
    });
  });
});
