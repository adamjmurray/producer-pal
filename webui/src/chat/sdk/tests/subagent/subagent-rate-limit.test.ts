// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Shrink the backoff so these tests don't sit through real seconds-long waits.
vi.mock(import("#webui/lib/rate-limit"), async (importOriginal) => {
  const actual = await importOriginal();

  return { ...actual, calculateRetryDelay: () => 20 };
});

import {
  type SubagentRateLimitStatus,
  type SubagentRetryOptions,
  RateLimitGate,
  getSubagentRateLimit,
  resetSubagentRateLimits,
  runSubagentWithRetry,
  setSubagentRateLimit,
  subscribeToSubagentRateLimits,
} from "#webui/chat/sdk/subagent/subagent-rate-limit";
import { type ChatMessage } from "#webui/chat/sdk/types";
import { MAX_RETRY_ATTEMPTS } from "#webui/lib/rate-limit";

/**
 * A provider 429 as the AI SDK surfaces it (APICallError uses statusCode).
 * @returns A rate-limit error
 */
function rateLimitError(): Error {
  return Object.assign(new Error("Too Many Requests"), { statusCode: 429 });
}

/**
 * Build retry options over a mutable history, recording whether each attempt
 * came through runAttempt (a first send) or resumeAttempt (a retry) and applying
 * each scripted attempt outcome.
 *
 * Only the first send echoes a user turn, mirroring the client: sendMessage
 * pushes the task, resumeStream does not push anything unconditionally.
 * @param attempts - Per-attempt behavior: throw the error, or mutate history
 * @param overrides - Extra option overrides (gate, abortSignal, onStatus)
 * @returns The options plus the history and the sequence of attempt kinds
 */
function setup(
  attempts: Array<(history: ChatMessage[]) => void>,
  overrides?: Partial<SubagentRetryOptions>,
) {
  const history: ChatMessage[] = [];
  const calls: Array<"send" | "resume"> = [];
  let index = 0;

  /**
   * Run the next scripted outcome.
   * @param kind - Which entry point was used
   */
  const attemptFn = async (kind: "send" | "resume"): Promise<void> => {
    calls.push(kind);

    if (kind === "send") {
      history.push({ role: "user", content: "add a bassline" });
    }

    await Promise.resolve();

    const attempt = attempts[index] ?? (() => {});

    index += 1;
    attempt(history);
  };

  const options: SubagentRetryOptions = {
    gate: new RateLimitGate(),
    runAttempt: () => attemptFn("send"),
    resumeAttempt: () => attemptFn("resume"),
    ...overrides,
  };

  return { options, history, calls };
}

/** A scripted attempt that hits the provider's rate limit. */
const rateLimited = (): never => {
  throw rateLimitError();
};

/**
 * A scripted attempt that finishes the task.
 * @param history - The worker's history, which the attempt appends to
 */
const finishTask = (history: ChatMessage[]): void => {
  history.push({ role: "assistant", content: "Done." });
};

/**
 * Penalize a fresh gate and park one waiter on it.
 * @param ms - The cooldown to penalize with
 * @returns The gate, the parked wait, and a reader for whether it released
 */
function parkWaiter(ms: number) {
  const gate = new RateLimitGate();
  let released = false;

  gate.penalize(ms);

  const waiting = gate.wait().then(() => {
    released = true;
  });

  return { gate, waiting, isReleased: () => released };
}

describe("runSubagentWithRetry", () => {
  it("sends the task on the only attempt when nothing goes wrong", async () => {
    const { options, calls } = setup([finishTask]);

    await runSubagentWithRetry(options);

    expect(calls).toStrictEqual(["send"]);
  });

  it("retries a rate-limited worker instead of failing the spawn", async () => {
    const { options, calls } = setup([rateLimited, finishTask]);

    await runSubagentWithRetry(options);

    expect(calls).toStrictEqual(["send", "resume"]);
  });

  it("never re-sends the task, so the worker is not instructed twice", async () => {
    // The task is already in the worker's history; replaying it stacked a
    // duplicate user turn, and the model saw the instruction twice because
    // consecutive user turns are concatenated for the wire.
    const { options, history, calls } = setup([rateLimited, finishTask]);

    await runSubagentWithRetry(options);

    expect(calls).toStrictEqual(["send", "resume"]);
    expect(history.filter((m) => m.role === "user")).toHaveLength(1);
  });

  it("resumes the same way whether or not the failed attempt produced output", async () => {
    // This layer no longer inspects the worker's history to choose between
    // resuming and restarting: every retry is a resume, and whether that resume
    // needs a "continue" turn to be a valid request is the client's decision.
    const producedOutput = setup([
      (h) => {
        h.push({ role: "assistant", content: "Wrote the first half." });

        throw rateLimitError();
      },
      finishTask,
    ]);
    const producedNothing = setup([rateLimited, finishTask]);

    await runSubagentWithRetry(producedOutput.options);
    await runSubagentWithRetry(producedNothing.options);

    expect(producedOutput.calls).toStrictEqual(["send", "resume"]);
    expect(producedNothing.calls).toStrictEqual(["send", "resume"]);
    // Partial work is kept either way — nothing truncates the history here.
    expect(producedOutput.history[1]?.content).toBe("Wrote the first half.");
  });

  it("resumes every subsequent attempt, not just the first retry", async () => {
    const { options, calls } = setup([rateLimited, rateLimited, finishTask]);

    await runSubagentWithRetry(options);

    expect(calls).toStrictEqual(["send", "resume", "resume"]);
  });

  it("penalizes the shared gate so sibling workers back off too", async () => {
    const gate = new RateLimitGate();
    const { options } = setup([rateLimited, finishTask], { gate });

    const penalized = new Promise<number>((resolve) => {
      const original = gate.penalize.bind(gate);

      gate.penalize = (delayMs: number) => {
        original(delayMs);
        resolve(gate.remainingMs);
      };
    });

    await runSubagentWithRetry(options);

    expect(await penalized).toBeGreaterThan(0);
  });

  it("waits on the shared gate before its first attempt", async () => {
    // A worker spawned while a sibling is cooling down must not add load.
    const gate = new RateLimitGate();

    gate.penalize(30);

    const { options, calls } = setup(
      [(h) => h.push({ role: "assistant", content: "Done." })],
      { gate },
    );

    await runSubagentWithRetry(options);

    expect(calls).toHaveLength(1);
    expect(gate.remainingMs).toBe(0);
  });

  it("rethrows a non-rate-limit error without retrying", async () => {
    const { options, calls } = setup([
      () => {
        throw new Error("MCP connection refused");
      },
    ]);

    await expect(runSubagentWithRetry(options)).rejects.toThrow(
      "MCP connection refused",
    );
    expect(calls).toHaveLength(1);
  });

  it("stops retrying once the turn is aborted", async () => {
    const controller = new AbortController();
    const { options, calls } = setup(
      [
        () => {
          controller.abort();

          throw rateLimitError();
        },
      ],
      { abortSignal: controller.signal },
    );

    await expect(runSubagentWithRetry(options)).rejects.toThrow(
      "Too Many Requests",
    );
    expect(calls).toHaveLength(1);
  });

  it("gives the orchestrator an actionable error once the budget runs out", async () => {
    const alwaysRateLimited = Array.from({ length: MAX_RETRY_ATTEMPTS }, () => {
      return () => {
        throw rateLimitError();
      };
    });
    const { options, calls } = setup(alwaysRateLimited);

    await expect(runSubagentWithRetry(options)).rejects.toThrow(
      `gave up after ${MAX_RETRY_ATTEMPTS} rate-limited attempts`,
    );
    expect(calls).toHaveLength(MAX_RETRY_ATTEMPTS);
  });

  it("stringifies a rate limit thrown as a bare value", async () => {
    // Providers do not always throw an Error; the give-up message still has to
    // name what happened.
    const thrown: unknown = "429 Too Many Requests";
    const alwaysRateLimited = Array.from({ length: MAX_RETRY_ATTEMPTS }, () => {
      return () => {
        throw thrown;
      };
    });
    const { options } = setup(alwaysRateLimited);

    await expect(runSubagentWithRetry(options)).rejects.toThrow(
      "429 Too Many Requests",
    );
  });

  it("publishes the backoff for the card and clears it when done", async () => {
    const statuses: Array<SubagentRateLimitStatus | null> = [];
    const { options } = setup([rateLimited, finishTask], {
      onStatus: (status) => statuses.push(status),
    });

    await runSubagentWithRetry(options);

    const backoff = statuses.find((s) => s != null);

    expect(backoff).toStrictEqual({
      retryAtMs: expect.any(Number),
      attempt: 0,
      maxAttempts: MAX_RETRY_ATTEMPTS,
    });
    expect(backoff?.retryAtMs).toBeGreaterThan(0);
    // Always ends cleared, so a finished card never shows a stale countdown.
    expect(statuses.at(-1)).toBeNull();
  });

  it("reports a wait forced purely by a sibling's backoff as not its own", async () => {
    // This worker was never rate-limited; it's only holding the shared gate, so
    // its card must not claim it is retrying.
    const gate = new RateLimitGate();
    const statuses: Array<SubagentRateLimitStatus | null> = [];

    gate.penalize(30);

    const { options } = setup(
      [(h) => h.push({ role: "assistant", content: "Done." })],
      { gate, onStatus: (status) => statuses.push(status) },
    );

    await runSubagentWithRetry(options);

    expect(statuses.find((s) => s != null)?.attempt).toBeNull();
  });

  it("republishes the deadline when a sibling extends the window mid-wait", async () => {
    // Without this the card counts down to 0 and then sits there for however
    // much longer the sibling's Retry-After added — the "looks hung" state the
    // card exists to prevent.
    const gate = new RateLimitGate();
    const statuses: Array<SubagentRateLimitStatus | null> = [];

    gate.penalize(40);

    const { options } = setup(
      [(h) => h.push({ role: "assistant", content: "Done." })],
      { gate, onStatus: (status) => statuses.push(status) },
    );

    const run = runSubagentWithRetry(options);

    gate.penalize(120);
    await run;

    const deadlines = statuses
      .filter((s) => s != null)
      .map((s) => s.retryAtMs)
      .filter((value, index, all) => all.indexOf(value) === index);

    expect(deadlines.length).toBeGreaterThan(1);
    expect(deadlines.at(-1)).toBeGreaterThan(deadlines[0] as number);
  });

  it("clears the published backoff even when the worker ends up failing", async () => {
    const statuses: Array<SubagentRateLimitStatus | null> = [];
    const { options } = setup(
      [
        () => {
          throw new Error("boom");
        },
      ],
      { onStatus: (status) => statuses.push(status) },
    );

    await expect(runSubagentWithRetry(options)).rejects.toThrow("boom");
    expect(statuses.at(-1)).toBeNull();
  });
});

describe("RateLimitGate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is open until something is rate-limited", async () => {
    const gate = new RateLimitGate();

    expect(gate.remainingMs).toBe(0);
    await expect(gate.wait()).resolves.toBeUndefined();
  });

  it("parks waiters until the cooldown elapses", async () => {
    const { waiting, isReleased } = parkWaiter(1000);

    await vi.advanceTimersByTimeAsync(600);
    expect(isReleased()).toBe(false);

    await vi.advanceTimersByTimeAsync(400);
    await waiting;
    expect(isReleased()).toBe(true);
  });

  it("keeps a waiter parked when a sibling extends the window mid-wait", async () => {
    // The whole point of sharing the gate: worker B's longer Retry-After must
    // hold worker A too, instead of A waking on its own shorter deadline.
    const { gate, waiting, isReleased } = parkWaiter(1000);

    await vi.advanceTimersByTimeAsync(600);
    gate.penalize(1000);

    await vi.advanceTimersByTimeAsync(400);
    expect(isReleased()).toBe(false);

    await vi.advanceTimersByTimeAsync(600);
    await waiting;
    expect(isReleased()).toBe(true);
  });

  it("reports the current deadline to a waiter, and again when it moves", async () => {
    const gate = new RateLimitGate();
    const deadlines: number[] = [];

    gate.penalize(1000);

    const waiting = gate.wait(undefined, (deadlineMs) =>
      deadlines.push(deadlineMs),
    );

    await vi.advanceTimersByTimeAsync(600);
    gate.penalize(2000);
    await vi.advanceTimersByTimeAsync(3000);
    await waiting;

    // Slices re-read the window, so the extension is reported, not swallowed.
    expect(deadlines.at(-1)).toBeGreaterThan(deadlines[0] as number);
  });

  it("does not report a deadline when the gate is already open", async () => {
    const gate = new RateLimitGate();
    const deadlines: number[] = [];

    await gate.wait(undefined, (deadlineMs) => deadlines.push(deadlineMs));

    expect(deadlines).toStrictEqual([]);
  });

  it("never shortens an existing cooldown", () => {
    const gate = new RateLimitGate();

    gate.penalize(5000);
    gate.penalize(100);

    expect(gate.remainingMs).toBe(5000);
  });

  it("reports a cooldown that has already expired as open", async () => {
    const gate = new RateLimitGate();

    gate.penalize(1000);
    await vi.advanceTimersByTimeAsync(1500);

    expect(gate.remainingMs).toBe(0);
  });
});

const backoff = { attempt: 0, maxAttempts: 5, retryAtMs: 1000 };

describe("subagent rate-limit status", () => {
  afterEach(() => {
    resetSubagentRateLimits();
  });

  it("round-trips a status by tool-call id", () => {
    setSubagentRateLimit("tc1", backoff);

    expect(getSubagentRateLimit("tc1")).toStrictEqual(backoff);
    expect(getSubagentRateLimit("tc2")).toBeNull();
  });

  it("clears a status with null", () => {
    setSubagentRateLimit("tc1", backoff);
    setSubagentRateLimit("tc1", null);

    expect(getSubagentRateLimit("tc1")).toBeNull();
  });

  it("keeps parallel workers independent", () => {
    setSubagentRateLimit("tc1", backoff);
    setSubagentRateLimit("tc2", { ...backoff, attempt: 2 });
    setSubagentRateLimit("tc1", null);

    expect(getSubagentRateLimit("tc1")).toBeNull();
    expect(getSubagentRateLimit("tc2")?.attempt).toBe(2);
  });

  it("notifies subscribers on set and clear, and stops after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToSubagentRateLimits(listener);

    setSubagentRateLimit("tc1", backoff);
    setSubagentRateLimit("tc1", null);
    unsubscribe();
    setSubagentRateLimit("tc1", backoff);

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("does not notify when republishing an unchanged status", () => {
    // Gate waits republish the same deadline every slice; that must not
    // re-render every card once a second.
    const listener = vi.fn();
    const unsubscribe = subscribeToSubagentRateLimits(listener);

    setSubagentRateLimit("tc1", backoff);
    setSubagentRateLimit("tc1", { ...backoff });
    setSubagentRateLimit("tc1", { ...backoff, retryAtMs: 2000 });
    unsubscribe();

    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("does not notify when clearing an id that was never set", () => {
    // Every worker clears its id on finish, so the common path must not
    // re-render every other card.
    const listener = vi.fn();
    const unsubscribe = subscribeToSubagentRateLimits(listener);

    setSubagentRateLimit("never-waited", null);
    unsubscribe();

    expect(listener).not.toHaveBeenCalled();
  });
});
