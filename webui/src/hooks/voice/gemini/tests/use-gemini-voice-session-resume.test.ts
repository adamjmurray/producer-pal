// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type GoogleGenAI,
  type LiveConnectConfig,
  type Session,
} from "@google/genai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeMessageDeps,
  msg,
} from "#webui/hooks/voice/gemini/tests/gemini-message-handler-test-helpers";
import {
  MAX_RESUME_ATTEMPTS,
  openResumableGeminiSession,
  RESUME_BACKOFF_MS,
  type ResumableSessionContext,
} from "#webui/hooks/voice/gemini/use-gemini-voice-session-helpers";

/** The connect calls recorded by a makeFakeAi() client, in call order. */
type FakeAiCalls = {
  config: LiveConnectConfig;
  callbacks: Record<string, (arg?: unknown) => void>;
}[];

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
  const calls: FakeAiCalls = [];
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
  const { deps } = makeMessageDeps();

  return {
    ai,
    model: "gemini-x",
    voice: "Puck",
    vad: undefined,
    language: undefined,
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

/**
 * Open a session and drop it via its onclose, letting only the immediate
 * (pre-backoff) handling run — so no resume attempt has fired yet.
 * @param ctx - The context to open with
 * @param calls - The fake client's recorded connect calls
 */
async function openThenClose(
  ctx: ResumableSessionContext,
  calls: FakeAiCalls,
): Promise<void> {
  await openResumableGeminiSession(ctx);
  calls[0]!.callbacks.onclose?.();
  await vi.advanceTimersByTimeAsync(0);
}

/**
 * Open a session, drop it via its onclose, and drive past the backoff so the
 * resume attempt completes.
 * @param ctx - The context to open with
 * @param calls - The fake client's recorded connect calls
 * @param attempt - 1-based attempt number whose backoff to flush
 */
async function openThenResume(
  ctx: ResumableSessionContext,
  calls: FakeAiCalls,
  attempt = 1,
): Promise<void> {
  await openResumableGeminiSession(ctx);
  calls[0]!.callbacks.onclose?.();
  await flushBackoff(attempt);
}

/**
 * Build a fake client whose first connect succeeds and whose resume rejects.
 * @param onResumeAttempt - Hook run just before the resume rejects
 * @returns The fake client and an accessor for the first session's callbacks
 */
function makeFailingResumeAi(onResumeAttempt: () => void = () => {}): {
  ai: GoogleGenAI;
  firstCallbacks: () => Record<string, (arg?: unknown) => void>;
} {
  const session = { close: vi.fn() } as unknown as Session;
  let captured!: Record<string, (arg?: unknown) => void>;
  let n = 0;
  const connect = vi.fn(
    async (p: { callbacks: Record<string, (arg?: unknown) => void> }) => {
      n++;

      if (n === 1) {
        captured = p.callbacks;

        return session;
      }

      onResumeAttempt();
      throw new Error("resume failed");
    },
  );

  return {
    ai: { live: { connect } } as unknown as GoogleGenAI,
    firstCallbacks: () => captured,
  };
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

    await openThenResume(ctx, calls);

    expect(ai.live.connect).toHaveBeenCalledTimes(2);
    expect(calls[1]!.config.sessionResumption).toStrictEqual({ handle: "h-7" });
    expect(ctx.onSession).toHaveBeenCalledTimes(1);
    expect(ctx.onDrop).not.toHaveBeenCalled();
  });

  it("reports an unrecoverable drop when no handle is available", async () => {
    const { ai, calls } = makeFakeAi();
    const ctx = makeCtx(ai);

    await openThenClose(ctx, calls);

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

  it("uses a fallback message when the transport error has no text", async () => {
    const { ai, calls } = makeFakeAi();
    const ctx = makeCtx(ai);

    await openResumableGeminiSession(ctx);
    // An empty error string extracts to "", so the `||` fallback supplies text.
    calls[0]!.callbacks.onerror?.("");
    await vi.advanceTimersByTimeAsync(0);

    expect(ctx.onDrop).toHaveBeenCalledWith("Voice connection error.");
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

    await openThenClose(ctx, calls);

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

    await openThenResume(ctx, calls);

    expect(ctx.onSession).not.toHaveBeenCalled();
    expect(session.close).toHaveBeenCalled();
  });

  it("reports a failed resume via onDrop", async () => {
    const { ai, firstCallbacks } = makeFailingResumeAi();
    const ctx = ctxWithHandle(ai);

    await openResumableGeminiSession(ctx);
    firstCallbacks().onclose?.();
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

    await openThenResume(ctx, calls);

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

    await openThenClose(ctx, calls);

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

    await openThenResume(ctx, calls);

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

    await openThenResume(ctx, calls);
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
    let intentional = false;
    const { ai, firstCallbacks } = makeFailingResumeAi(() => {
      // Simulate the user clicking Stop while live.connect was rejecting.
      intentional = true;
    });
    const ctx = ctxWithHandle(ai, { isIntentionalClose: () => intentional });

    await openResumableGeminiSession(ctx);
    firstCallbacks().onclose?.();
    await flushBackoff(1);

    expect(ctx.onDrop).not.toHaveBeenCalled();
  });
});
