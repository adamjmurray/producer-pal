// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  ActivityHandling,
  EndSensitivity,
  GoogleGenAI,
  type LiveConnectConfig,
  type LiveServerMessage,
  type Session,
  StartSensitivity,
} from "@google/genai";
import { type RealtimeItem } from "@openai/agents/realtime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type GeminiVadSettings } from "#webui/hooks/settings/turn-detection-helpers";
import { GeminiHistoryBuilder } from "#webui/hooks/voice/gemini/gemini-realtime-items";
import { type GeminiPcmPlayer } from "#webui/hooks/voice/gemini/gemini-pcm-player";
import {
  buildGeminiConfig,
  closeQuietly,
  createGenAIClient,
  type GeminiMessageDeps,
  handleGeminiMessage,
  MAX_RESUME_ATTEMPTS,
  openResumableGeminiSession,
  RESUME_BACKOFF_MS,
  type ResumableSessionContext,
  seedGeminiContext,
} from "#webui/hooks/voice/gemini/use-gemini-voice-session-helpers";

/**
 * Build message-handler deps with spy-able fakes (a real history builder, a fake
 * player, and an injectable session/tool dispatcher).
 * @param overrides - Partial deps to override
 * @returns The deps plus the fakes for assertions
 */
function makeDeps(overrides: Partial<GeminiMessageDeps> = {}) {
  const player = {
    flush: vi.fn(),
    enqueueBase64: vi.fn(),
  } as unknown as GeminiPcmPlayer;
  const sendToolResponse = vi.fn();
  const session = { sendToolResponse } as unknown as Session;
  const deps: GeminiMessageDeps = {
    builder: new GeminiHistoryBuilder(),
    player,
    getSession: () => session,
    executeTool: vi.fn(async () => "tool-output"),
    publishHistory: vi.fn(),
    setAssistantSpeaking: vi.fn(),
    setAssistantThinking: vi.fn(),
    setError: vi.fn(),
    setResumeHandle: vi.fn(),
    ...overrides,
  };

  return { deps, player, sendToolResponse, session };
}

/**
 * Cast a partial message literal to LiveServerMessage (a class with text/data
 * getters that plain object literals can't satisfy structurally).
 * @param partial - The message fields under test
 * @returns The same value typed as LiveServerMessage
 */
function msg(partial: Partial<LiveServerMessage>): LiveServerMessage {
  return partial as LiveServerMessage;
}

describe("buildGeminiConfig", () => {
  it("sets audio modality, voice, tools, and transcription", () => {
    const config = buildGeminiConfig({
      voice: "Charon",
      functionDeclarations: [{ name: "ppal-x" }],
    });

    expect(config.responseModalities).toStrictEqual(["AUDIO"]);
    expect(
      config.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName,
    ).toBe("Charon");
    expect(config.tools).toStrictEqual([
      { functionDeclarations: [{ name: "ppal-x" }] },
    ]);
    expect(config.inputAudioTranscription).toStrictEqual({});
    expect(config.outputAudioTranscription).toStrictEqual({});
    expect(typeof config.systemInstruction).toBe("string");
  });

  it("falls back to the default voice when none is given", () => {
    const config = buildGeminiConfig({
      voice: undefined,
      functionDeclarations: [],
    });

    expect(
      config.speechConfig?.voiceConfig?.prebuiltVoiceConfig?.voiceName,
    ).toBe("Puck");
  });

  it("enables session resumption with an empty handle for a fresh session", () => {
    const config = buildGeminiConfig({
      voice: "Puck",
      functionDeclarations: [],
    });

    expect(config.sessionResumption).toStrictEqual({});
  });

  it("passes the resumption handle when resuming a prior session", () => {
    const config = buildGeminiConfig({
      voice: "Puck",
      functionDeclarations: [],
      resumeHandle: "handle-9",
    });

    expect(config.sessionResumption).toStrictEqual({ handle: "handle-9" });
  });

  it("omits realtimeInputConfig when no VAD settings are given", () => {
    const config = buildGeminiConfig({
      voice: "Puck",
      functionDeclarations: [],
    });

    expect(config.realtimeInputConfig).toBeUndefined();
  });

  it("maps high-sensitivity VAD with barge-in on", () => {
    const vad: GeminiVadSettings = {
      startSensitivity: "high",
      endSensitivity: "high",
      silenceDurationMs: 500,
      prefixPaddingMs: 100,
      interruptResponse: true,
    };

    const config = buildGeminiConfig({
      voice: "Puck",
      functionDeclarations: [],
      vad,
    });

    expect(config.realtimeInputConfig).toStrictEqual({
      automaticActivityDetection: {
        startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH,
        endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_HIGH,
        prefixPaddingMs: 100,
        silenceDurationMs: 500,
      },
      activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
    });
  });

  it("maps low-sensitivity VAD with barge-in off to NO_INTERRUPTION", () => {
    const vad: GeminiVadSettings = {
      startSensitivity: "low",
      endSensitivity: "low",
      silenceDurationMs: 800,
      prefixPaddingMs: 20,
      interruptResponse: false,
    };

    const config = buildGeminiConfig({
      voice: "Puck",
      functionDeclarations: [],
      vad,
    });

    expect(config.realtimeInputConfig).toStrictEqual({
      automaticActivityDetection: {
        startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
        endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
        prefixPaddingMs: 20,
        silenceDurationMs: 800,
      },
      activityHandling: ActivityHandling.NO_INTERRUPTION,
    });
  });
});

describe("createGenAIClient", () => {
  it("builds a client for a raw key (default API version)", () => {
    const client = createGenAIClient({ value: "raw-key", ephemeral: false });

    expect(client).toBeInstanceOf(GoogleGenAI);
  });

  it("builds a client for an ephemeral token (v1alpha)", () => {
    const client = createGenAIClient({ value: "ephemeral", ephemeral: true });

    expect(client).toBeInstanceOf(GoogleGenAI);
  });
});

describe("handleGeminiMessage", () => {
  it("appends input transcription to history", async () => {
    const { deps } = makeDeps();

    await handleGeminiMessage(
      msg({ serverContent: { inputTranscription: { text: "hello" } } }),
      deps,
    );

    expect(deps.builder.toRealtimeItems()[0]).toMatchObject({ role: "user" });
    expect(deps.publishHistory).toHaveBeenCalled();
  });

  it("appends output transcription and enqueues audio", async () => {
    const { deps, player } = makeDeps();

    await handleGeminiMessage(
      msg({
        serverContent: {
          outputTranscription: { text: "hi" },
          modelTurn: { parts: [{ inlineData: { data: "BASE64" } }] },
        },
      }),
      deps,
    );

    expect(deps.builder.toRealtimeItems()[0]).toMatchObject({
      role: "assistant",
    });
    expect(player.enqueueBase64).toHaveBeenCalledWith("BASE64");
    expect(deps.setAssistantSpeaking).toHaveBeenCalledWith(true);
  });

  it("ignores model-turn parts that carry no audio data", async () => {
    const { deps, player } = makeDeps();

    await handleGeminiMessage(
      msg({ serverContent: { modelTurn: { parts: [{ text: "no audio" }] } } }),
      deps,
    );

    expect(player.enqueueBase64).not.toHaveBeenCalled();
  });

  it("flushes playback and stops speaking on interruption", async () => {
    const { deps, player } = makeDeps();

    await handleGeminiMessage(
      msg({ serverContent: { interrupted: true } }),
      deps,
    );

    expect(player.flush).toHaveBeenCalled();
    expect(deps.setAssistantSpeaking).toHaveBeenCalledWith(false);
  });

  it("stops speaking on turnComplete", async () => {
    const { deps } = makeDeps();

    await handleGeminiMessage(
      msg({ serverContent: { turnComplete: true } }),
      deps,
    );

    expect(deps.setAssistantSpeaking).toHaveBeenCalledWith(false);
    expect(deps.publishHistory).toHaveBeenCalled();
  });

  it("ignores a message with no serverContent or toolCall", async () => {
    const { deps } = makeDeps();

    await handleGeminiMessage(msg({ setupComplete: {} }), deps);

    expect(deps.publishHistory).not.toHaveBeenCalled();
  });

  it("stores a resumable session-resumption handle", async () => {
    const { deps } = makeDeps();

    await handleGeminiMessage(
      msg({ sessionResumptionUpdate: { resumable: true, newHandle: "h-1" } }),
      deps,
    );

    expect(deps.setResumeHandle).toHaveBeenCalledWith("h-1");
  });

  it("ignores a non-resumable update and one with no handle", async () => {
    const { deps } = makeDeps();

    await handleGeminiMessage(
      msg({ sessionResumptionUpdate: { resumable: false } }),
      deps,
    );
    await handleGeminiMessage(
      msg({ sessionResumptionUpdate: { resumable: true } }),
      deps,
    );

    expect(deps.setResumeHandle).not.toHaveBeenCalled();
  });

  it("runs a tool call and sends the response with matching id", async () => {
    const executeTool = vi.fn(async () => "Tempo updated.");
    const { deps, sendToolResponse } = makeDeps({ executeTool });

    const message = msg({
      toolCall: {
        functionCalls: [
          { id: "c1", name: "ppal-update-live-set", args: { tempo: 128 } },
        ],
      },
    });

    await handleGeminiMessage(message, deps);

    expect(executeTool).toHaveBeenCalledWith("ppal-update-live-set", {
      tempo: 128,
    });
    expect(sendToolResponse).toHaveBeenCalledWith({
      functionResponses: [
        {
          id: "c1",
          name: "ppal-update-live-set",
          response: { output: "Tempo updated." },
        },
      ],
    });
    expect(deps.setAssistantThinking).toHaveBeenCalledWith(true);
    expect(deps.setAssistantThinking).toHaveBeenCalledWith(false);
  });

  it("falls back to the tool name as id when none is provided", async () => {
    const { deps, sendToolResponse } = makeDeps();

    await handleGeminiMessage(
      msg({ toolCall: { functionCalls: [{ name: "ppal-x" }] } }),
      deps,
    );

    expect(deps.builder.toRealtimeItems()[0]).toMatchObject({
      type: "function_call",
      name: "ppal-x",
    });
    expect(sendToolResponse).toHaveBeenCalled();
  });

  it("tolerates a function call with no name (empty-string fallbacks)", async () => {
    const executeTool = vi.fn(async () => "ok");
    const { deps, sendToolResponse } = makeDeps({ executeTool });

    await handleGeminiMessage(msg({ toolCall: { functionCalls: [{}] } }), deps);

    expect(executeTool).toHaveBeenCalledWith("", {});
    expect(sendToolResponse).toHaveBeenCalled();
  });

  it("surfaces a sendToolResponse failure via setError", async () => {
    const { deps } = makeDeps({
      getSession: () =>
        ({
          sendToolResponse: () => {
            throw new Error("socket closed");
          },
        }) as unknown as Session,
    });

    await handleGeminiMessage(
      msg({ toolCall: { functionCalls: [{ id: "c", name: "ppal-x" }] } }),
      deps,
    );

    expect(deps.setError).toHaveBeenCalledWith("socket closed");
  });

  it("skips sendToolResponse when the session is gone", async () => {
    const { deps } = makeDeps({ getSession: () => null });

    await handleGeminiMessage(
      msg({ toolCall: { functionCalls: [{ id: "c", name: "ppal-x" }] } }),
      deps,
    );

    // No throw; thinking still toggled off.
    expect(deps.setAssistantThinking).toHaveBeenCalledWith(false);
  });
});

/**
 * Build a fake GenAI client whose live.connect records each call's config and
 * callbacks and returns a shared fake session.
 * @param closeImpl - Optional session.close implementation (defaults to a spy)
 * @returns The fake ai, the shared session, and the recorded connect calls
 */
function makeFakeAi(closeImpl?: () => void) {
  const session = {
    close: closeImpl ? vi.fn(closeImpl) : vi.fn(),
  } as unknown as Session;
  const calls: {
    config: LiveConnectConfig;
    callbacks: Record<string, (arg?: unknown) => void>;
  }[] = [];
  const connect = vi.fn(
    async (params: {
      config: LiveConnectConfig;
      callbacks: Record<string, (arg?: unknown) => void>;
    }) => {
      calls.push({ config: params.config, callbacks: params.callbacks });

      return session;
    },
  );
  const ai = { live: { connect } } as unknown as GoogleGenAI;

  return { ai, session, connect, calls };
}

/**
 * Build a ResumableSessionContext with sensible defaults and spy callbacks.
 * @param ai - The fake GenAI client to drive
 * @param over - Per-test overrides
 * @returns A ResumableSessionContext
 */
function makeCtx(
  ai: GoogleGenAI,
  over: Partial<ResumableSessionContext> = {},
): ResumableSessionContext {
  const { deps } = makeDeps();

  return {
    ai,
    model: "gemini-x",
    voice: "Puck",
    vad: undefined,
    functionDeclarations: [],
    deps,
    resumeRef: { current: { handle: null, attempts: 0 } },
    sessionGenRef: { current: 0 },
    isStale: () => false,
    isIntentionalClose: () => false,
    onSession: vi.fn(),
    onDrop: vi.fn(),
    ...over,
  };
}

/**
 * Build a ctx with a stored handle (the common shape across resume tests).
 * @param ai - The fake GenAI client
 * @param overrides - Optional extra ctx overrides
 * @param handle - The stored resumption handle
 * @returns A ResumableSessionContext seeded for a resume scenario
 */
function ctxWithHandle(
  ai: GoogleGenAI,
  overrides: Partial<ResumableSessionContext> = {},
  handle = "h",
): ResumableSessionContext {
  return makeCtx(ai, {
    resumeRef: { current: { handle, attempts: 0 } },
    ...overrides,
  });
}

/**
 * Drive past the linear resume backoff for attempt N.
 * @param attempt - 1-based attempt number
 */
async function flushBackoff(attempt: number): Promise<void> {
  await vi.advanceTimersByTimeAsync(attempt * RESUME_BACKOFF_MS);
}

describe("openResumableGeminiSession", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("opens a session enabling resumption and returns it", async () => {
    const { ai, session, calls } = makeFakeAi();

    const result = await openResumableGeminiSession(makeCtx(ai));

    expect(result).toBe(session);
    expect(calls[0]!.config.sessionResumption).toStrictEqual({});
  });

  it("resumes with the stored handle after an unexpected close", async () => {
    const { ai, calls } = makeFakeAi();
    const ctx = ctxWithHandle(ai, {}, "h-7");

    await openResumableGeminiSession(ctx);
    calls[0]!.callbacks.onclose?.();
    await flushBackoff(1);

    expect(ai.live.connect).toHaveBeenCalledTimes(2);
    expect(calls[1]!.config.sessionResumption).toStrictEqual({ handle: "h-7" });
    expect(ctx.onSession).toHaveBeenCalledTimes(1);
    expect(ctx.onDrop).not.toHaveBeenCalled();
  });

  it("reports an unrecoverable drop when no handle is available", async () => {
    const { ai, calls } = makeFakeAi();
    const ctx = makeCtx(ai);

    await openResumableGeminiSession(ctx);
    calls[0]!.callbacks.onclose?.();
    await vi.advanceTimersByTimeAsync(0);

    expect(ai.live.connect).toHaveBeenCalledTimes(1);
    expect(ctx.onDrop).toHaveBeenCalledWith(
      "Connection lost. Press Talk to reconnect.",
    );
  });

  it("reports the transport error message when erroring without a handle", async () => {
    const { ai, calls } = makeFakeAi();
    const ctx = makeCtx(ai);

    await openResumableGeminiSession(ctx);
    calls[0]!.callbacks.onerror?.(new Error("ws down"));
    await vi.advanceTimersByTimeAsync(0);

    expect(ctx.onDrop).toHaveBeenCalledWith("ws down");
  });

  it("handles a drop once when onerror and onclose both fire", async () => {
    const { ai, calls } = makeFakeAi();
    const ctx = ctxWithHandle(ai);

    await openResumableGeminiSession(ctx);
    calls[0]!.callbacks.onerror?.(new Error("x"));
    calls[0]!.callbacks.onclose?.();
    await flushBackoff(1);

    expect(ai.live.connect).toHaveBeenCalledTimes(2);
    expect(ctx.onSession).toHaveBeenCalledTimes(1);
  });

  it("does not resume after an intentional close", async () => {
    const { ai, calls } = makeFakeAi();
    const ctx = ctxWithHandle(ai, { isIntentionalClose: () => true });

    await openResumableGeminiSession(ctx);
    calls[0]!.callbacks.onclose?.();
    await vi.advanceTimersByTimeAsync(0);

    expect(ai.live.connect).toHaveBeenCalledTimes(1);
    expect(ctx.onDrop).not.toHaveBeenCalled();
  });

  it("closes a resumed session that races teardown instead of installing it", async () => {
    // close throws to also exercise closeQuietly's swallow path.
    const { ai, session, calls } = makeFakeAi(() => {
      throw new Error("already closed");
    });
    let staleChecks = 0;
    const ctx = ctxWithHandle(ai, {
      // false at handleClose entry, true at resumeOrFail's post-resume check.
      isStale: () => staleChecks++ >= 1,
    });

    await openResumableGeminiSession(ctx);
    calls[0]!.callbacks.onclose?.();
    await flushBackoff(1);

    expect(ctx.onSession).not.toHaveBeenCalled();
    expect(session.close).toHaveBeenCalled();
  });

  it("reports a failed resume via onDrop", async () => {
    const session = { close: vi.fn() } as unknown as Session;
    let firstCallbacks!: Record<string, (arg?: unknown) => void>;
    let n = 0;
    const connect = vi.fn(
      async (p: { callbacks: Record<string, (arg?: unknown) => void> }) => {
        n++;

        if (n === 1) {
          firstCallbacks = p.callbacks;

          return session;
        }

        throw new Error("resume failed");
      },
    );
    const ai = { live: { connect } } as unknown as GoogleGenAI;
    const ctx = ctxWithHandle(ai);

    await openResumableGeminiSession(ctx);
    firstCallbacks.onclose?.();
    await flushBackoff(1);

    expect(ctx.onDrop).toHaveBeenCalledWith("resume failed");
  });

  it("waits attempt * RESUME_BACKOFF_MS before retrying", async () => {
    const { ai, calls } = makeFakeAi();
    const ctx = ctxWithHandle(ai);

    await openResumableGeminiSession(ctx);
    calls[0]!.callbacks.onclose?.();

    // Not yet enough time for attempt 1's wait.
    await vi.advanceTimersByTimeAsync(RESUME_BACKOFF_MS - 1);
    expect(ai.live.connect).toHaveBeenCalledTimes(1);

    // Cross attempt 1's threshold → second connect.
    await vi.advanceTimersByTimeAsync(1);
    expect(ai.live.connect).toHaveBeenCalledTimes(2);
  });

  it("resets the attempt counter when the resumed session delivers a message", async () => {
    const { ai, calls } = makeFakeAi();
    const ctx = ctxWithHandle(ai);

    await openResumableGeminiSession(ctx);
    calls[0]!.callbacks.onclose?.();
    await flushBackoff(1);

    // After the resume, counter is at 1 until the new session emits its first
    // server message — then it resets to 0.
    expect(ctx.resumeRef.current.attempts).toBe(1);

    calls[1]!.callbacks.onmessage?.(msg({}));

    expect(ctx.resumeRef.current.attempts).toBe(0);
  });

  it("stops resuming and reports a drop after MAX_RESUME_ATTEMPTS failures", async () => {
    // Pre-seed counter at MAX so the next resume attempt hits the cap.
    const { ai, calls } = makeFakeAi();
    const ctx = makeCtx(ai, {
      resumeRef: { current: { handle: "h", attempts: MAX_RESUME_ATTEMPTS } },
    });

    await openResumableGeminiSession(ctx);
    calls[0]!.callbacks.onclose?.();
    await vi.advanceTimersByTimeAsync(0);

    expect(ai.live.connect).toHaveBeenCalledTimes(1);
    expect(ctx.onDrop).toHaveBeenCalledWith(
      `Voice connection lost after ${MAX_RESUME_ATTEMPTS} resume attempts. Press Talk to reconnect.`,
    );
  });

  it("ignores repeat onmessage calls after the first reset", async () => {
    // The receivedMessage gate is per-session; only the first message resets.
    // A later message shouldn't re-reset (counter already 0, but exercise the
    // branch where `receivedMessage` is true).
    const { ai, calls } = makeFakeAi();
    const ctx = ctxWithHandle(ai);

    await openResumableGeminiSession(ctx);
    calls[0]!.callbacks.onclose?.();
    await flushBackoff(1);

    calls[1]!.callbacks.onmessage?.(msg({}));
    expect(ctx.resumeRef.current.attempts).toBe(0);

    // Manually bump and re-fire onmessage; the gate should NOT reset it again.
    ctx.resumeRef.current.attempts = 5;
    calls[1]!.callbacks.onmessage?.(msg({}));
    expect(ctx.resumeRef.current.attempts).toBe(5);
  });

  it("ignores a delayed close on a session we've already replaced", async () => {
    // Cover the dropHandled guard on the second close: handleClose returns
    // early so resumeOrFail isn't called again for this session.
    const { ai, calls } = makeFakeAi();
    const ctx = ctxWithHandle(ai);

    await openResumableGeminiSession(ctx);
    calls[0]!.callbacks.onclose?.();
    await flushBackoff(1);
    calls[0]!.callbacks.onclose?.();
    await flushBackoff(2);

    // Only the original close triggered a resume.
    expect(ai.live.connect).toHaveBeenCalledTimes(2);
  });

  it("per-session sentinel blocks a stale onclose from kicking off a second resume", async () => {
    // Open session 1, then open session 2 directly (this bumps sessionGenRef).
    // Now session 1's onclose fires fresh — its closure-local dropHandled is
    // still false, so without the sentinel handleClose would proceed and call
    // resumeOrFail, opening a third session on top of the live second one.
    const { ai, calls } = makeFakeAi();
    const ctx = ctxWithHandle(ai);

    await openResumableGeminiSession(ctx);
    await openResumableGeminiSession(ctx);

    expect(ai.live.connect).toHaveBeenCalledTimes(2);
    expect(ctx.sessionGenRef.current).toBe(2);

    calls[0]!.callbacks.onclose?.();
    await flushBackoff(1);
    await flushBackoff(2);

    expect(ai.live.connect).toHaveBeenCalledTimes(2);
  });

  it("does not call onDrop when a resume fails after intentional close", async () => {
    // The user clicks Stop during a failing resume. Without the catch-side
    // stale/intentional check, onDrop fires with "Connection lost" → status
    // ends at error instead of the expected idle.
    const session = { close: vi.fn() } as unknown as Session;
    let firstCallbacks!: Record<string, (arg?: unknown) => void>;
    let intentional = false;
    let n = 0;
    const connect = vi.fn(
      async (p: { callbacks: Record<string, (arg?: unknown) => void> }) => {
        n++;

        if (n === 1) {
          firstCallbacks = p.callbacks;

          return session;
        }

        // Simulate the user clicking Stop while live.connect was rejecting.
        intentional = true;
        throw new Error("resume failed");
      },
    );
    const ai = { live: { connect } } as unknown as GoogleGenAI;
    const ctx = ctxWithHandle(ai, { isIntentionalClose: () => intentional });

    await openResumableGeminiSession(ctx);
    firstCallbacks.onclose?.();
    await flushBackoff(1);

    expect(ctx.onDrop).not.toHaveBeenCalled();
  });
});

describe("closeQuietly", () => {
  it("swallows a close that throws", () => {
    const session = {
      close: () => {
        throw new Error("boom");
      },
    } as unknown as Session;

    expect(() => closeQuietly(session)).not.toThrow();
  });
});

describe("seedGeminiContext", () => {
  it("is a no-op for empty or missing history", () => {
    const sendClientContent = vi.fn();
    const session = { sendClientContent } as unknown as Session;

    seedGeminiContext(session, undefined);
    seedGeminiContext(session, []);

    expect(sendClientContent).not.toHaveBeenCalled();
  });

  it("sends prior message transcripts as a non-triggering context turn", () => {
    const sendClientContent = vi.fn();
    const session = { sendClientContent } as unknown as Session;
    const history: RealtimeItem[] = [
      {
        itemId: "1",
        type: "message",
        role: "user",
        status: "completed",
        content: [{ type: "input_audio", transcript: "set tempo to 128" }],
      },
      {
        itemId: "2",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_audio", transcript: "Done." }],
      },
      // function_call + system items are skipped by the transcript flattener.
      {
        itemId: "3",
        type: "function_call",
        status: "completed",
        name: "ppal-x",
        arguments: "{}",
        output: "ok",
      },
    ];

    seedGeminiContext(session, history);

    expect(sendClientContent).toHaveBeenCalledTimes(1);
    const arg = sendClientContent.mock.calls[0]![0] as {
      turns: { parts: { text: string }[] }[];
      turnComplete: boolean;
    };

    expect(arg.turnComplete).toBe(false);
    const text = arg.turns[0]!.parts[0]!.text;

    expect(text).toContain("User: set tempo to 128");
    expect(text).toContain("You: Done.");
    expect(text).not.toContain("ppal-x");
  });

  it("is a no-op when history has no usable transcript text", () => {
    const sendClientContent = vi.fn();
    const session = { sendClientContent } as unknown as Session;
    const history: RealtimeItem[] = [
      {
        itemId: "1",
        type: "message",
        role: "assistant",
        status: "completed",
        content: [{ type: "output_audio", transcript: "" }],
      },
    ];

    seedGeminiContext(session, history);

    expect(sendClientContent).not.toHaveBeenCalled();
  });
});
