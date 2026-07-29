// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  createVoiceSessionTestKit,
  type FakeRealtimeSession,
} from "./use-voice-session-test-helpers";

/* jscpd:ignore-start -- vitest mock harness must be defined inline per file
   (vi.hoisted runs before imports, so the doubles can't be shared); identical
   to the preamble in use-voice-session.test.ts by necessity, not copy-paste. */
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
    constructor(public options?: unknown) {
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

import {
  DEFAULT_TURN_DETECTION,
  type TurnDetectionSettings,
} from "#webui/hooks/settings/turn-detection-helpers";
import { useVoiceSession } from "#webui/hooks/voice/use-voice-session";

const {
  defaultParams,
  stubFetchOk,
  connectAndGetSession,
  emitResponseFailure,
} = createVoiceSessionTestKit(mocks);

/**
 * Count the `response.create` nudges the auto-retry sent on the session.
 * @param session - Fake session whose recorded transport events are scanned
 * @returns Number of response.create events sent
 */
function countAutoRetries(session: FakeRealtimeSession): number {
  return session.transport.sendEvent.mock.calls.filter(
    ([event]) => (event as { type?: string }).type === "response.create",
  ).length;
}

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
/* jscpd:ignore-end */

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
    await emitResponseFailure(
      session,
      "rate_limit_exceeded",
      "Please try again in 1s",
    );
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

  it("sets a fallback retry window when the rate-limit wait is unparseable", async () => {
    const { result, session } = await connectAndGetSession();

    // No "try again in …" in the message — without a fallback this would leave a
    // dead error banner with no retry path.
    await emitResponseFailure(
      session,
      "rate_limit_exceeded",
      "Rate limit reached. Please slow down.",
    );
    expect(result.current.rateLimitedUntil).not.toBeNull();
  });

  it("auto-retries once the rate-limit window elapses", async () => {
    const { result, session } = await connectAndGetSession();

    vi.useFakeTimers();

    try {
      await emitResponseFailure(
        session,
        "rate_limit_exceeded",
        "Please try again in 166ms",
      );
      expect(result.current.rateLimitedUntil).not.toBeNull();
      expect(session.transport.sendEvent).not.toHaveBeenCalled();

      // Past the floor + safety buffer the session nudges itself to continue,
      // no manual Retry click or user speech needed.
      await act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(session.transport.sendEvent).toHaveBeenCalledWith({
        type: "response.create",
      });
      expect(result.current.rateLimitedUntil).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("stops auto-retrying after a run of consecutive rate limits", async () => {
    const { session } = await connectAndGetSession();

    vi.useFakeTimers();

    try {
      // Seven consecutive rate-limited windows, advancing past each retry delay.
      // A persistent limit must not loop forever — auto-retry caps and gives up.
      for (let i = 0; i < 7; i++) {
        await emitResponseFailure(
          session,
          "rate_limit_exceeded",
          "Please try again in 0.1s",
        );
        await act(() => {
          vi.advanceTimersByTime(2000);
        });
      }

      expect(countAutoRetries(session)).toBe(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it("refreshes the auto-retry budget after a successful response", async () => {
    const { session } = await connectAndGetSession();

    vi.useFakeTimers();

    try {
      const burst = async () => {
        await emitResponseFailure(
          session,
          "rate_limit_exceeded",
          "Please try again in 0.1s",
        );
        await act(() => {
          vi.advanceTimersByTime(2000);
        });
      };

      for (let i = 0; i < 3; i++) await burst();

      // A clean response ends the streak, so the budget resets to full.
      await act(() => {
        session.emit("transport_event", {
          type: "response.done",
          response: { status: "completed" },
        });
      });
      session.transport.sendEvent.mockClear();

      // Three more limits all auto-retry again (budget was refreshed, not spent).
      for (let i = 0; i < 3; i++) await burst();

      expect(countAutoRetries(session)).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("clears the rate-limit and error banner on an explicit disconnect", async () => {
    const { result, session } = await connectAndGetSession();

    await emitResponseFailure(
      session,
      "rate_limit_exceeded",
      "Please try again in 3s",
    );
    expect(result.current.error).not.toBeNull();
    expect(result.current.rateLimitedUntil).not.toBeNull();

    await act(async () => {
      await result.current.disconnect();
    });

    // Stop is a clean exit — the banner must not linger into the idle screen.
    expect(result.current.error).toBeNull();
    expect(result.current.rateLimitedUntil).toBeNull();
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

  it("retryResponse does not fire response.create while a response is in progress", async () => {
    const { result, session } = await connectAndGetSession();

    // A response is underway (created, not yet done). Sending response.create now
    // would be rejected by the server as "active response in progress" — the
    // rejection that surfaced as a spurious banner on stop→restart.
    await act(() => {
      session.emit("transport_event", { type: "response.created" });
    });

    await act(() => {
      result.current.retryResponse();
    });
    expect(countAutoRetries(session)).toBe(0);

    // Once the response completes the gate lifts and a retry goes through again.
    await act(() => {
      session.emit("transport_event", {
        type: "response.done",
        response: { status: "completed" },
      });
    });
    await act(() => {
      result.current.retryResponse();
    });
    expect(countAutoRetries(session)).toBe(1);
  });

  it("disconnect cancels an in-flight response before closing the session", async () => {
    const { result, session } = await connectAndGetSession();

    // Response in progress when the user hits Stop — teardown should cancel it so
    // the server doesn't keep billing/holding an orphaned response.
    await act(() => {
      session.emit("transport_event", { type: "response.created" });
    });

    await act(async () => {
      await result.current.disconnect();
    });
    expect(session.interrupt).toHaveBeenCalled();
    expect(session.close).toHaveBeenCalled();
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

describe("useVoiceSession half-duplex (barge-in disabled)", () => {
  // End-to-end wiring: the hook derives halfDuplex from
  // turnDetection.interruptResponse and threads it + the mute refs into the
  // transport handler. (The branch matrix lives in the helper unit tests;
  // these prove the pieces are connected.) DEFAULT_TURN_DETECTION has
  // interruptResponse: false.
  const TD_ON: TurnDetectionSettings = {
    ...DEFAULT_TURN_DETECTION,
    interruptResponse: true,
  };

  async function connectWith(turnDetection: TurnDetectionSettings) {
    stubFetchOk({ value: "ek_x" });
    const { result } = renderHook(() =>
      useVoiceSession({ ...defaultParams(), turnDetection }),
    );

    await act(async () => {
      await result.current.connect();
    });

    return { result, session: mocks.FakeSession.instances[0]! };
  }

  // Emit a full response lifecycle (created → done) in a single act().
  function emitResponse(
    session: { emit: (event: string, payload: unknown) => void },
    response: unknown,
  ) {
    return act(() => {
      session.emit("transport_event", { type: "response.created" });
      session.emit("transport_event", { type: "response.done", response });
    });
  }

  it("mutes during a response (call 1) and restores after", async () => {
    const { session } = await connectWith(DEFAULT_TURN_DETECTION);

    await emitResponse(session, { status: "completed" });

    expect(session.mute).toHaveBeenNthCalledWith(1, true);
    expect(session.mute).toHaveBeenLastCalledWith(false);
  });

  it("does not auto-mute when barge-in is on", async () => {
    const { session } = await connectWith(TD_ON);

    await emitResponse(session, { status: "completed" });

    expect(session.mute).not.toHaveBeenCalled();
  });

  it("preserves a manual mute across a half-duplex response", async () => {
    const { result, session } = await connectWith(DEFAULT_TURN_DETECTION);

    await act(async () => {
      await result.current.toggleMute();
    });
    expect(result.current.isMuted).toBe(true);

    await emitResponse(session, { status: "completed" });

    // Restored to muted, not unmuted — the manual intent survives.
    expect(session.mute).toHaveBeenLastCalledWith(true);
    expect(result.current.isMuted).toBe(true);
  });

  it("lifts the auto-mute even when the response fails", async () => {
    const { session } = await connectWith(DEFAULT_TURN_DETECTION);

    await emitResponse(session, {
      status: "failed",
      status_details: { error: {} },
    });

    expect(session.mute).toHaveBeenLastCalledWith(false);
  });
});

describe("useVoiceSession output volume", () => {
  it("sets the initial volume on the playback element and updates it live", async () => {
    stubFetchOk({ value: "ek_x" });
    const { result, rerender } = renderHook(
      ({ volume }: { volume: number }) =>
        useVoiceSession({ ...defaultParams(), volume }),
      { initialProps: { volume: 0.5 } },
    );

    await act(async () => {
      await result.current.connect();
    });

    const audioElement = (
      mocks.FakeTransport.instances[0]!.options as {
        audioElement: HTMLAudioElement;
      }
    ).audioElement;

    // The transport got our own element at the initial volume...
    expect(audioElement.volume).toBe(0.5);

    // ...and a mid-session change updates that same element immediately.
    rerender({ volume: 0.25 });
    expect(audioElement.volume).toBe(0.25);
  });
});
