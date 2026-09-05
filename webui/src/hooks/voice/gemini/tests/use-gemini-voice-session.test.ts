// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { act, renderHook } from "@testing-library/preact";
import { waitForHookState } from "#webui/test-utils/async-test-helpers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GEM_ITEM_ID } from "#webui/hooks/voice/gemini/tests/gemini-message-handler-test-helpers";

// --- hoisted doubles (vi.mock factories can only see vi.hoisted values) ---
const h = vi.hoisted(() => {
  const fakeSession = {
    sendRealtimeInput: vi.fn(),
    sendToolResponse: vi.fn(),
    sendClientContent: vi.fn(),
    close: vi.fn(),
  };

  const state: {
    callbacks: Record<string, (arg?: unknown) => void>;
    connectParams: { model?: string; config?: unknown } | null;
    genaiOptions: unknown;
    onChunk: ((data: string) => void) | null;
    /** When set, FakeMic.start awaits this before resolving. Tests use it to
     * park connect() mid-start so they can interleave teardown. */
    micStartGate: Promise<void> | null;
    /** When set, FakePlayer.resume awaits this before resolving. Tests use it
     * to park connect() mid-resume so they can interleave teardown. */
    playerResumeGate: Promise<void> | null;
  } = {
    callbacks: {},
    connectParams: null,
    genaiOptions: null,
    onChunk: null,
    micStartGate: null,
    playerResumeGate: null,
  };

  const liveConnect = vi.fn(
    async (params: {
      model: string;
      callbacks: Record<string, (arg?: unknown) => void>;
      config: unknown;
    }) => {
      state.callbacks = params.callbacks;
      state.connectParams = params;
      params.callbacks.onopen?.();

      return fakeSession;
    },
  );

  class FakeGoogleGenAI {
    live = { connect: liveConnect };
    constructor(options: unknown) {
      state.genaiOptions = options;
    }
  }

  class FakeMic {
    static last: FakeMic | null = null;
    setMuted = vi.fn();
    stop = vi.fn(async () => {});
    start = vi.fn(async (opts: { onChunk: (data: string) => void }) => {
      state.onChunk = opts.onChunk;
      if (state.micStartGate) await state.micStartGate;

      return { sampleRate: 16000 };
    });

    constructor() {
      FakeMic.last = this;
    }
  }

  class FakePlayer {
    static last: FakePlayer | null = null;
    setVolume = vi.fn();
    resume = vi.fn(async () => {
      if (state.playerResumeGate) await state.playerResumeGate;
    });

    flush = vi.fn();
    enqueueBase64 = vi.fn();
    // Nothing queued, so the half-duplex unmute is never deferred here; the
    // deferral itself is covered in gemini-half-duplex.test.ts.
    hasQueued = vi.fn(() => false);
    onDrained = vi.fn((callback: () => void) => callback());
    // Reached by any `interrupted` message; without it the handler throws
    // where the `as never` cast at the mock site would have hidden it.
    hasPendingDrain = vi.fn(() => false);
    close = vi.fn(async () => {});
    constructor() {
      FakePlayer.last = this;
    }
  }

  const mcpClose = vi.fn(async () => {});
  const executeTool = vi.fn(async () => "tool-out");
  const createGeminiMcpTools = vi.fn(async () => ({
    functionDeclarations: [{ name: "ppal-x" }],
    executeTool,
    mcpClient: { close: mcpClose },
  }));

  const fetchGeminiToken = vi.fn(async () => ({
    value: "gem-key",
    ephemeral: false,
  }));

  return {
    fakeSession,
    state,
    liveConnect,
    FakeGoogleGenAI,
    FakeMic,
    FakePlayer,
    mcpClose,
    executeTool,
    createGeminiMcpTools,
    fetchGeminiToken,
  };
});

// `as never` lets the structural fakes stand in for the real module exports
// (classes with private fields can't be matched structurally) — same pattern as
// use-voice-session.test.ts.
vi.mock(import("@google/genai"), () => ({
  GoogleGenAI: h.FakeGoogleGenAI as never,
  Modality: { AUDIO: "AUDIO" } as never,
  // buildRealtimeInputConfig reads these by name; mirror real string values.
  ActivityHandling: {
    START_OF_ACTIVITY_INTERRUPTS: "START_OF_ACTIVITY_INTERRUPTS",
    NO_INTERRUPTION: "NO_INTERRUPTION",
  } as never,
  StartSensitivity: {
    START_SENSITIVITY_HIGH: "START_SENSITIVITY_HIGH",
    START_SENSITIVITY_LOW: "START_SENSITIVITY_LOW",
  } as never,
  EndSensitivity: {
    END_SENSITIVITY_HIGH: "END_SENSITIVITY_HIGH",
    END_SENSITIVITY_LOW: "END_SENSITIVITY_LOW",
  } as never,
}));
vi.mock(import("#webui/hooks/voice/gemini/gemini-mic-capture"), () => ({
  GeminiMicCapture: h.FakeMic as never,
}));
vi.mock(import("#webui/hooks/voice/gemini/gemini-pcm-player"), () => ({
  GeminiPcmPlayer: h.FakePlayer as never,
}));
vi.mock(import("#webui/hooks/voice/gemini/gemini-mcp-tools"), () => ({
  createGeminiMcpTools: h.createGeminiMcpTools as never,
}));
// Shrink the resume backoff — the real 1s is waited out for real here, and the
// backoff's own timing is covered with fake timers in the resume suite.
vi.mock(import("#webui/lib/constants/voice-resume"), () => ({
  MAX_RESUME_ATTEMPTS: 3,
  RESUME_BACKOFF_MS: 20,
}));

vi.mock(import("#webui/hooks/voice/gemini/gemini-voice-token"), () => ({
  fetchGeminiToken: h.fetchGeminiToken as never,
}));

import { type GeminiVadSettings } from "#webui/hooks/settings/turn-detection-helpers";
import {
  useGeminiVoiceSession,
  type UseGeminiVoiceSessionParams,
} from "#webui/hooks/voice/gemini/use-gemini-voice-session";

const PARAMS: UseGeminiVoiceSessionParams = {
  mcpUrl: "http://localhost:3350/mcp",
  voiceTokenUrl: "http://localhost:3350/gemini-voice-token",
  geminiKey: "gem-key" as string | null,
  model: "gemini-3.1-flash-live-preview",
  voice: "Puck",
  volume: 1,
};

/** Half-duplex (barge-in disabled) VAD shape used by the half-duplex tests. */
const HALF_DUPLEX_VAD: GeminiVadSettings = {
  startSensitivity: "high",
  endSensitivity: "high",
  silenceDurationMs: 500,
  prefixPaddingMs: 100,
  interruptResponse: false,
};

/**
 * Render the hook and run a successful connect().
 * @param overrides - Param overrides
 * @returns The renderHook result
 */
async function renderConnected(
  overrides: Partial<UseGeminiVoiceSessionParams> = {},
) {
  const view = renderHook(
    (p: UseGeminiVoiceSessionParams) => useGeminiVoiceSession(p),
    { initialProps: { ...PARAMS, ...overrides } },
  );

  await act(async () => {
    await view.result.current.connect();
  });

  return view;
}

/**
 * Render the hook with no API key and run the (failing) connect().
 * @returns The renderHook result
 */
async function renderKeyless() {
  const view = renderHook(() =>
    useGeminiVoiceSession({ ...PARAMS, geminiKey: null }),
  );

  await act(async () => {
    await view.result.current.connect();
  });

  return view;
}

/** A server message shaped for the `onmessage` callback. */
type ServerMessage = Record<string, unknown>;

/**
 * Build an incoming user-transcription message.
 * @param text - The transcribed text
 * @returns A server message carrying the transcript
 */
function transcriptMsg(text: string): ServerMessage {
  return { serverContent: { inputTranscription: { text } } };
}

/**
 * Build an assistant audio-chunk message (drives the half-duplex auto-mute).
 * @param data - Base64 audio payload
 * @returns A server message carrying one model-turn audio part
 */
function assistantAudioMsg(data: string): ServerMessage {
  return {
    serverContent: { modelTurn: { parts: [{ inlineData: { data } }] } },
  };
}

/** End-of-assistant-turn message. */
const TURN_COMPLETE: ServerMessage = { serverContent: { turnComplete: true } };

/**
 * Deliver server messages through the live-session onmessage callback. All
 * messages land inside a single act() so effects flush once, as they would for
 * a burst arriving on the transport.
 * @param messages - Server messages to deliver in order
 */
async function emit(...messages: ServerMessage[]): Promise<void> {
  await act(async () => {
    for (const message of messages) {
      h.state.callbacks.onmessage?.(message);
    }
  });
}

/** The `result` handle returned by renderHook for this hook. */
type SessionResult = { current: ReturnType<typeof useGeminiVoiceSession> };

/**
 * Clear the transcript via the hook's resetHistory().
 * @param result - The renderHook result handle
 */
async function resetHistory(result: SessionResult): Promise<void> {
  await act(async () => {
    result.current.resetHistory();
  });
}

/**
 * A one-shot gate promise plus its release trigger, for parking an async mock.
 * @returns The gate promise and its resolver
 */
function makeGate(): { gate: Promise<void>; release: () => void } {
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });

  return { gate, release };
}

/**
 * Render the hook and kick off connect() WITHOUT awaiting it — the caller has
 * parked a gated mock, so connect stays suspended inside it. Returns once
 * `parked` observes the gated resource, ready for teardown to be interleaved.
 * @param parked - Assertion polled until the gated mock is running
 * @returns The renderHook result and the in-flight connect() promise
 */
async function connectParkedAt(parked: () => void) {
  const view = renderHook((p: typeof PARAMS) => useGeminiVoiceSession(p), {
    initialProps: PARAMS,
  });
  // Wrap in act so React state updates flush as they happen.
  const connectPromise = act(() => view.result.current.connect());

  await vi.waitFor(parked);

  return { view, connectPromise };
}

/**
 * Render the hook, begin connect() (letting it reach its first await), unmount
 * mid-connect, then release the parked gate and await connect. The caller parks
 * the mock that awaits the gate before calling.
 * @param release - The gate release captured by the test's parked mock
 * @returns The renderHook result for post-teardown assertions
 */
async function connectUnmountRelease(release: () => void) {
  const { result, unmount } = renderHook(() => useGeminiVoiceSession(PARAMS));
  let connectPromise!: Promise<void>;

  await act(async () => {
    connectPromise = result.current.connect();
    await Promise.resolve();
  });

  unmount();
  await act(async () => {
    release();
    await connectPromise;
  });

  return result;
}

beforeEach(() => {
  h.fetchGeminiToken.mockResolvedValue({ value: "gem-key", ephemeral: false });
});

afterEach(() => {
  vi.clearAllMocks();
  h.FakeMic.last = null;
  h.FakePlayer.last = null;
  h.state.callbacks = {};
  h.state.onChunk = null;
  h.state.micStartGate = null;
  h.state.playerResumeGate = null;
});

describe("useGeminiVoiceSession", () => {
  it("errors without a key and never opens a session", async () => {
    const { result } = await renderKeyless();

    expect(result.current.status).toBe("error");
    expect(result.current.error).toMatch(/Gemini API key/);
    expect(h.liveConnect).not.toHaveBeenCalled();
  });

  it("connects: opens session with config, starts mic, sets status", async () => {
    const { result } = await renderConnected();

    expect(result.current.status).toBe("connected");
    expect(result.current.activeVoice).toBe("Puck");
    expect(h.FakePlayer.last!.resume).toHaveBeenCalled();
    expect(h.FakeMic.last!.start).toHaveBeenCalled();
    const params = h.state.connectParams!;

    expect(params.model).toBe("gemini-3.1-flash-live-preview");
    expect(h.state.genaiOptions).toStrictEqual({ apiKey: "gem-key" });
  });

  it("uses v1alpha httpOptions for an ephemeral credential", async () => {
    h.fetchGeminiToken.mockResolvedValueOnce({
      value: "auth_tokens/x",
      ephemeral: true,
    });

    await renderConnected();

    expect(h.state.genaiOptions).toStrictEqual({
      apiKey: "auth_tokens/x",
      httpOptions: { apiVersion: "v1alpha" },
    });
  });

  it("leaves activeVoice null when no voice is provided", async () => {
    const { result } = await renderConnected({ voice: undefined });

    expect(result.current.status).toBe("connected");
    expect(result.current.activeVoice).toBeNull();
  });

  it("ignores a second connect() while already connected", async () => {
    const { result } = await renderConnected();

    await act(async () => {
      await result.current.connect();
    });

    expect(h.liveConnect).toHaveBeenCalledTimes(1);
  });

  it("renders incoming transcripts into history", async () => {
    const { result } = await renderConnected();

    await emit(transcriptMsg("hello there"));

    expect(result.current.history[0]).toStrictEqual({
      itemId: GEM_ITEM_ID,
      type: "message",
      status: "completed",
      role: "user",
      content: [{ type: "input_audio", transcript: "hello there" }],
    });
  });

  it("forwards mic chunks to sendRealtimeInput", async () => {
    await renderConnected();

    h.state.onChunk?.("BASE64PCM");

    expect(h.fakeSession.sendRealtimeInput).toHaveBeenCalledWith({
      audio: { data: "BASE64PCM", mimeType: "audio/pcm;rate=16000" },
    });
  });

  it("runs a tool call through the session (covers getSession)", async () => {
    await renderConnected();

    await act(async () => {
      h.state.callbacks.onmessage?.({
        toolCall: { functionCalls: [{ id: "c1", name: "ppal-x", args: {} }] },
      });
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(h.executeTool).toHaveBeenCalledWith("ppal-x", {});
    expect(h.fakeSession.sendToolResponse).toHaveBeenCalled();
  });

  it("toggleMute drives the mic and flips isMuted", async () => {
    const { result } = await renderConnected();

    await act(async () => {
      await result.current.toggleMute();
    });

    expect(result.current.isMuted).toBe(true);
    expect(h.FakeMic.last!.setMuted).toHaveBeenCalledWith(true);

    await act(async () => {
      await result.current.toggleMute();
    });

    expect(result.current.isMuted).toBe(false);
  });

  it("toggleMute is a no-op when idle", async () => {
    const { result } = renderHook(() => useGeminiVoiceSession(PARAMS));

    await act(async () => {
      await result.current.toggleMute();
    });

    expect(result.current.isMuted).toBe(false);
  });

  it("interrupt flushes playback and clears speaking", async () => {
    const { result } = await renderConnected();

    await act(async () => {
      result.current.interrupt();
    });

    expect(h.FakePlayer.last!.flush).toHaveBeenCalled();
    expect(result.current.assistantSpeaking).toBe(false);
  });

  it("interrupt is safe before connect (no player)", () => {
    const { result } = renderHook(() => useGeminiVoiceSession(PARAMS));

    expect(() => act(() => result.current.interrupt())).not.toThrow();
  });

  it("retryResponse clears the error banner", async () => {
    const { result } = await renderKeyless();

    expect(result.current.error).not.toBeNull();

    await act(async () => {
      result.current.retryResponse();
    });
    expect(result.current.error).toBeNull();
  });

  it("resetHistory clears the transcript", async () => {
    const { result } = await renderConnected();

    await emit(transcriptMsg("hi"));
    expect(result.current.history).toHaveLength(1);

    await resetHistory(result);
    expect(result.current.history).toHaveLength(0);
  });

  it("closes the orphaned player when teardown races player.resume()", async () => {
    // Park player.resume so we can interleave teardown. cleanup() must capture
    // the player ref BEFORE the await; otherwise the AudioContext leaks.
    const { gate, release: resolveResume } = makeGate();

    h.state.playerResumeGate = gate;

    // Wait until the player has been constructed and resume() is parked.
    const { view, connectPromise } = await connectParkedAt(() => {
      expect(h.FakePlayer.last).not.toBeNull();
      expect(h.FakePlayer.last!.resume).toHaveBeenCalled();
    });
    const player = h.FakePlayer.last!;

    // Tear down WHILE player.resume is parked. cleanup() must see this player
    // via playerRef and close it; otherwise the AudioContext leaks.
    await act(() => view.result.current.disconnect());

    expect(player.close).toHaveBeenCalledTimes(1);

    // Let resume() resolve and the parked connect() unwind.
    resolveResume();
    await connectPromise;

    expect(view.result.current.status).toBe("idle");
  });

  it("clearing the chat keeps later messages flowing into history", async () => {
    // Bug: resetHistory used to replace builderRef with a brand-new builder,
    // but handleGeminiMessage closes over the original — so publishHistory's
    // identity check (builderRef.current === closed-over builder) failed and
    // dropped every subsequent update. Mutating in place keeps the same
    // instance live so the UI stays current after a reset.
    const { result } = await renderConnected();

    await emit(transcriptMsg("hello"));
    expect(result.current.history).toHaveLength(1);

    await resetHistory(result);
    expect(result.current.history).toHaveLength(0);

    await emit(transcriptMsg("world"));
    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0]).toStrictEqual({
      itemId: GEM_ITEM_ID,
      type: "message",
      status: "completed",
      role: "user",
      content: [{ type: "input_audio", transcript: "world" }],
    });
  });

  it("stops the orphaned mic when teardown races mic.start()", async () => {
    const { gate, release: resolveStart } = makeGate();

    h.state.micStartGate = gate;

    // Wait until the mic instance has been constructed and start() has been
    // called (so it's actually parked on the gate).
    const { view, connectPromise } = await connectParkedAt(() => {
      expect(h.FakeMic.last).not.toBeNull();
      expect(h.FakeMic.last!.start).toHaveBeenCalled();
    });
    const mic = h.FakeMic.last!;

    // Tear down WHILE mic.start is still parked. cleanup() captures and
    // stop()s this same mic; then completes its own work.
    await act(() => view.result.current.disconnect());

    // First stop() from cleanup.
    expect(mic.stop).toHaveBeenCalledTimes(1);

    // Now let mic.start resolve. The stale check post-start fires and we
    // call mic.stop a SECOND time on the now-fully-initialized mic so its
    // orphaned MediaStream / AudioContext gets closed.
    resolveStart();
    await connectPromise;

    expect(mic.stop).toHaveBeenCalledTimes(2);
    expect(view.result.current.status).toBe("idle");
  });

  it("disconnect tears everything down and goes idle", async () => {
    const { result } = await renderConnected();
    const mic = h.FakeMic.last!;
    const player = h.FakePlayer.last!;

    await act(async () => {
      await result.current.disconnect();
    });

    expect(result.current.status).toBe("idle");
    expect(mic.stop).toHaveBeenCalled();
    expect(player.close).toHaveBeenCalled();
    expect(h.fakeSession.close).toHaveBeenCalled();
    expect(h.mcpClose).toHaveBeenCalled();
  });

  it("surfaces an unexpected close as a lost connection", async () => {
    const { result } = await renderConnected();

    await act(async () => {
      h.state.callbacks.onclose?.();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toMatch(/Connection lost/);
  });

  it("captures a resumption handle and silently resumes after a drop", async () => {
    const { result } = await renderConnected();

    await act(async () => {
      h.state.callbacks.onmessage?.({
        sessionResumptionUpdate: { resumable: true, newHandle: "handle-1" },
      });
    });

    await act(async () => {
      h.state.callbacks.onclose?.();
    });

    // openResumableGeminiSession retries behind a linear backoff, mocked short
    // above. Poll past it rather than sleeping a hair over it, so a loaded
    // runner can't clip the resume.
    await waitForHookState(() => {
      expect(h.liveConnect).toHaveBeenCalledTimes(2);
      expect(result.current.status).toBe("connected");
    });

    expect(result.current.error).toBeNull();
    const cfg = h.state.connectParams!.config as {
      sessionResumption?: { handle?: string };
    };

    expect(cfg.sessionResumption?.handle).toBe("handle-1");
    // The mic and player are reused across a resume, not rebuilt.
    expect(h.FakeMic.last!.start).toHaveBeenCalledTimes(1);
  });

  it("surfaces a transport error", async () => {
    const { result } = await renderConnected();

    await act(async () => {
      h.state.callbacks.onerror?.(new Error("ws boom"));
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("ws boom");
  });

  it("catches a connect failure and cleans up", async () => {
    h.fetchGeminiToken.mockRejectedValueOnce(new Error("token denied"));

    const { result } = await renderConnected();

    expect(result.current.status).toBe("error");
    expect(result.current.error).toBe("token denied");
    expect(h.mcpClose).toHaveBeenCalled();
  });

  it("defaults volume to unity when none is provided", async () => {
    await renderConnected({ volume: undefined });

    expect(h.FakePlayer.last!.setVolume).toHaveBeenCalledWith(1);
  });

  it("pushes live volume changes to the player", async () => {
    const view = await renderConnected();
    const player = h.FakePlayer.last!;

    player.setVolume.mockClear();
    view.rerender({ ...PARAMS, volume: 0.5 });

    expect(player.setVolume).toHaveBeenCalledWith(0.5);
  });

  it("half-duplex (interruptResponse=false): auto-mutes mic during assistant turn", async () => {
    await renderConnected({ turnDetection: HALF_DUPLEX_VAD });
    const mic = h.FakeMic.last!;

    // Manual setMuted from mic.start(false) at connect, then nothing yet.
    mic.setMuted.mockClear();

    await emit(assistantAudioMsg("AUDIO1"));
    expect(mic.setMuted).toHaveBeenNthCalledWith(1, true);

    await emit(TURN_COMPLETE);
    // Restored to the user's manual state (unmuted → false).
    expect(mic.setMuted).toHaveBeenNthCalledWith(2, false);
  });

  it("half-duplex: manual interrupt during an auto-muted turn restores the mic", async () => {
    // M9: Gemini Live has no local cancel, so under NO_INTERRUPTION the server
    // keeps streaming after a manual interrupt and turnComplete/interrupted
    // don't arrive for seconds. interrupt() must lift the auto-mute itself, or
    // the mic stays stuck muted while the indicator shows unmuted.
    const { result } = await renderConnected({
      turnDetection: HALF_DUPLEX_VAD,
    });
    const mic = h.FakeMic.last!;

    mic.setMuted.mockClear();

    // Assistant audio auto-mutes the mic.
    await emit(assistantAudioMsg("AUDIO"));
    expect(mic.setMuted).toHaveBeenNthCalledWith(1, true);

    // Manual interrupt — without any turnComplete — restores the mic.
    await act(() => {
      result.current.interrupt();
    });
    expect(mic.setMuted).toHaveBeenNthCalledWith(2, false);
  });

  it("full-duplex (interruptResponse=true): no auto-mute around assistant audio", async () => {
    await renderConnected({
      turnDetection: { ...HALF_DUPLEX_VAD, interruptResponse: true },
    });
    const mic = h.FakeMic.last!;

    mic.setMuted.mockClear();

    await emit(assistantAudioMsg("AUDIO"), TURN_COMPLETE);

    expect(mic.setMuted).not.toHaveBeenCalled();
  });

  it("half-duplex: a manual mute survives an auto-mute / unmute cycle", async () => {
    const { result } = await renderConnected({
      turnDetection: HALF_DUPLEX_VAD,
    });
    const mic = h.FakeMic.last!;

    await act(async () => {
      await result.current.toggleMute();
    });
    expect(result.current.isMuted).toBe(true);
    mic.setMuted.mockClear();

    await emit(assistantAudioMsg("A"), TURN_COMPLETE);

    // Both calls should be `true`: auto-mute (true), then restore-to-manual (true).
    expect(mic.setMuted).toHaveBeenNthCalledWith(1, true);
    expect(mic.setMuted).toHaveBeenNthCalledWith(2, true);
  });

  it("half-duplex: unmuting mid-turn lets the rest of the turn re-mute", async () => {
    // Manual intent clears the auto-mute flag. Left set, every later chunk of
    // the same turn finds beginGeminiHalfDuplexMute already "armed" and no-ops,
    // so the assistant plays on into an open mic.
    const { result } = await renderConnected({
      turnDetection: HALF_DUPLEX_VAD,
    });
    const mic = h.FakeMic.last!;

    mic.setMuted.mockClear();

    await emit(assistantAudioMsg("A"));
    expect(mic.setMuted).toHaveBeenNthCalledWith(1, true);

    // The user overrides the auto-mute from the Mute/Unmute button, ending
    // unmuted — no turnComplete in between, so nothing else clears the flag.
    await act(async () => {
      await result.current.toggleMute();
    });
    await act(async () => {
      await result.current.toggleMute();
    });
    mic.setMuted.mockClear();

    await emit(assistantAudioMsg("B"));

    expect(mic.setMuted).toHaveBeenCalledWith(true);
  });

  it("bails after MCP tools resolve if torn down first", async () => {
    // Park createGeminiMcpTools so we can tear down before the first stale check
    // (right after the MCP client is stored). The token fetch and session open
    // must never run; cleanup closes the stored MCP client.
    const { gate, release } = makeGate();

    h.createGeminiMcpTools.mockReturnValueOnce(
      gate.then(() => ({
        functionDeclarations: [{ name: "ppal-x" }],
        executeTool: h.executeTool,
        mcpClient: { close: h.mcpClose },
      })),
    );

    await connectUnmountRelease(release);

    expect(h.fetchGeminiToken).not.toHaveBeenCalled();
    expect(h.liveConnect).not.toHaveBeenCalled();
    expect(h.mcpClose).toHaveBeenCalled();
  });

  it("closes the freshly opened session when torn down during session open", async () => {
    // Park live.connect so teardown races the post-open stale check: the opened
    // session must be closed (closeQuietly) rather than installed.
    const { gate, release } = makeGate();

    h.liveConnect.mockImplementationOnce(
      async (params: {
        callbacks: Record<string, (arg?: unknown) => void>;
        config: unknown;
        model: string;
      }) => {
        h.state.callbacks = params.callbacks;
        h.state.connectParams = params;
        params.callbacks.onopen?.();
        await gate;

        return h.fakeSession;
      },
    );

    const result = await connectUnmountRelease(release);

    expect(h.fakeSession.close).toHaveBeenCalled();
    expect(h.mcpClose).toHaveBeenCalled();
    expect(result.current.status).not.toBe("connected");
  });

  it("resets player volume to unity when the volume prop clears", async () => {
    const view = await renderConnected({ volume: 1 });
    const player = h.FakePlayer.last!;

    player.setVolume.mockClear();
    view.rerender({ ...PARAMS, volume: undefined });

    expect(player.setVolume).toHaveBeenCalledWith(1);
  });

  it("bails and closes the session if torn down during connect", async () => {
    // Suspend the token fetch, unmount mid-connect, then let it resolve.
    const { gate, release } = makeGate();

    h.fetchGeminiToken.mockReturnValueOnce(
      gate.then(() => ({ value: "gem-key", ephemeral: false })),
    );

    await connectUnmountRelease(release);

    // Torn down before the session opened: no live session leaked.
    expect(h.liveConnect).not.toHaveBeenCalled();
    expect(h.mcpClose).toHaveBeenCalled();
  });
});
