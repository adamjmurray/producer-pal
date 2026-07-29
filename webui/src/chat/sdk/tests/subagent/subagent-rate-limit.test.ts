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
 * Build retry options over a mutable history, with a runAttempt that records
 * the messages it was sent and applies each scripted attempt outcome.
 * @param attempts - Per-attempt behavior: throw the error, or mutate history
 * @param overrides - Extra option overrides (gate, abortSignal, onStatus)
 * @param initial - History the worker starts with (a resumed worker's session)
 * @returns The options plus the history and the messages runAttempt saw
 */
function setup(
  attempts: Array<(history: ChatMessage[]) => void>,
  overrides?: Partial<SubagentRetryOptions>,
  initial?: ChatMessage[],
) {
  const history: ChatMessage[] = [...(initial ?? [])];
  const messages: string[] = [];
  let index = 0;

  const options: SubagentRetryOptions = {
    task: "add a bassline",
    getHistory: () => history,
    gate: new RateLimitGate(),
    runAttempt: async (message) => {
      messages.push(message);
      // Every attempt echoes the user turn into history first, like sendMessage.
      history.push({ role: "user", content: message });
      await Promise.resolve();
      const attempt = attempts[index] ?? (() => {});

      index += 1;
      attempt(history);
    },
    ...overrides,
  };

  return { options, history, messages };
}

describe("runSubagentWithRetry", () => {
  it("passes the task straight through when nothing goes wrong", async () => {
    const { options, messages } = setup([
      (history) => history.push({ role: "assistant", content: "Done." }),
    ]);

    await runSubagentWithRetry(options);

    expect(messages).toStrictEqual(["add a bassline"]);
  });

  it("retries a rate-limited worker instead of failing the spawn", async () => {
    const { options, messages } = setup([
      () => {
        throw rateLimitError();
      },
      (history) => history.push({ role: "assistant", content: "Done." }),
    ]);

    await runSubagentWithRetry(options);

    expect(messages).toStrictEqual(["add a bassline", "add a bassline"]);
  });

  it("restarts cleanly when the failed attempt produced nothing", async () => {
    // The failed attempt left only its echoed task behind; resending without
    // dropping it would stack duplicate user turns in the worker's history.
    const { options, history } = setup([
      () => {
        throw rateLimitError();
      },
      (h) => h.push({ role: "assistant", content: "Done." }),
    ]);

    await runSubagentWithRetry(options);

    expect(history.filter((m) => m.role === "user")).toHaveLength(1);
  });

  it("resumes with continue when the worker already produced text", async () => {
    const { options, messages, history } = setup([
      (h) => {
        h.push({ role: "assistant", content: "Wrote the first half." });

        throw rateLimitError();
      },
      (h) => h.push({ role: "assistant", content: "Done." }),
    ]);

    await runSubagentWithRetry(options);

    expect(messages).toStrictEqual(["add a bassline", "continue"]);
    expect(history[1]?.content).toBe("Wrote the first half.");
  });

  it("resumes with continue after a tool call with no text", async () => {
    // A tool call may already have edited the Live Set, so restarting from
    // scratch would redo it.
    const { options, messages } = setup([
      (h) => {
        h.push({
          role: "assistant",
          content: "",
          toolCalls: [{ id: "t1", name: "ppal-create-clip", args: {} }],
        });

        throw rateLimitError();
      },
      (h) => h.push({ role: "assistant", content: "Done." }),
    ]);

    await runSubagentWithRetry(options);

    expect(messages).toStrictEqual(["add a bassline", "continue"]);
  });

  describe("with a seeded session (a resumed worker)", () => {
    /**
     * A session the worker completed before this run was started.
     * @returns The seeded history
     */
    const seed = (): ChatMessage[] => [
      { role: "user", content: "add a bassline" },
      { role: "assistant", content: "Added a bassline." },
    ];

    /**
     * Retry options for a run that continues the seeded session.
     * @returns The option overrides
     */
    const resumeOptions = (): Partial<SubagentRetryOptions> => ({
      task: "make it swing",
      baselineLength: 2,
    });

    it("sends the follow-up on the first attempt, not continue", async () => {
      // The seeded session reads as worker output, so without the baseline the
      // very first attempt would send "continue" and the follow-up instruction
      // would never reach the worker at all.
      const { options, messages } = setup(
        [(h) => h.push({ role: "assistant", content: "Swung it." })],
        resumeOptions(),
        seed(),
      );

      await runSubagentWithRetry(options);

      expect(messages).toStrictEqual(["make it swing"]);
    });

    it("rewinds a restart to the baseline, keeping the seeded session", async () => {
      const { options, history, messages } = setup(
        [
          () => {
            throw rateLimitError();
          },
          (h) => h.push({ role: "assistant", content: "Swung it." }),
        ],
        resumeOptions(),
        seed(),
      );

      await runSubagentWithRetry(options);

      // The failed attempt's echoed turn is dropped, but the session it was
      // continuing survives — truncating to 0 would erase an earlier run.
      expect(messages).toStrictEqual(["make it swing", "make it swing"]);
      expect(history.map((m) => m.content)).toStrictEqual([
        "add a bassline",
        "Added a bassline.",
        "make it swing",
        "Swung it.",
      ]);
    });

    it("still resumes with continue once this run has produced output", async () => {
      const { options, messages } = setup(
        [
          (h) => {
            h.push({ role: "assistant", content: "Half swung." });

            throw rateLimitError();
          },
          (h) => h.push({ role: "assistant", content: "Swung it." }),
        ],
        resumeOptions(),
        seed(),
      );

      await runSubagentWithRetry(options);

      expect(messages).toStrictEqual(["make it swing", "continue"]);
    });
  });

  it("penalizes the shared gate so sibling workers back off too", async () => {
    const gate = new RateLimitGate();
    const { options } = setup(
      [
        () => {
          throw rateLimitError();
        },
        (h) => h.push({ role: "assistant", content: "Done." }),
      ],
      { gate },
    );

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

    const { options, messages } = setup(
      [(h) => h.push({ role: "assistant", content: "Done." })],
      { gate },
    );

    await runSubagentWithRetry(options);

    expect(messages).toHaveLength(1);
    expect(gate.remainingMs).toBe(0);
  });

  it("rethrows a non-rate-limit error without retrying", async () => {
    const { options, messages } = setup([
      () => {
        throw new Error("MCP connection refused");
      },
    ]);

    await expect(runSubagentWithRetry(options)).rejects.toThrow(
      "MCP connection refused",
    );
    expect(messages).toHaveLength(1);
  });

  it("stops retrying once the turn is aborted", async () => {
    const controller = new AbortController();
    const { options, messages } = setup(
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
    expect(messages).toHaveLength(1);
  });

  it("gives the orchestrator an actionable error once the budget runs out", async () => {
    const alwaysRateLimited = Array.from({ length: MAX_RETRY_ATTEMPTS }, () => {
      return () => {
        throw rateLimitError();
      };
    });
    const { options, messages } = setup(alwaysRateLimited);

    await expect(runSubagentWithRetry(options)).rejects.toThrow(
      `gave up after ${MAX_RETRY_ATTEMPTS} rate-limited attempts`,
    );
    expect(messages).toHaveLength(MAX_RETRY_ATTEMPTS);
  });

  it("publishes the backoff for the card and clears it when done", async () => {
    const statuses: Array<SubagentRateLimitStatus | null> = [];
    const { options } = setup(
      [
        () => {
          throw rateLimitError();
        },
        (h) => h.push({ role: "assistant", content: "Done." }),
      ],
      { onStatus: (status) => statuses.push(status) },
    );

    await runSubagentWithRetry(options);

    const backoff = statuses.find((s) => s != null);

    expect(backoff).toMatchObject({
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
    const gate = new RateLimitGate();
    let released = false;

    gate.penalize(1000);

    const waiting = gate.wait().then(() => {
      released = true;
    });

    await vi.advanceTimersByTimeAsync(600);
    expect(released).toBe(false);

    await vi.advanceTimersByTimeAsync(400);
    await waiting;
    expect(released).toBe(true);
  });

  it("keeps a waiter parked when a sibling extends the window mid-wait", async () => {
    // The whole point of sharing the gate: worker B's longer Retry-After must
    // hold worker A too, instead of A waking on its own shorter deadline.
    const gate = new RateLimitGate();
    let released = false;

    gate.penalize(1000);

    const waiting = gate.wait().then(() => {
      released = true;
    });

    await vi.advanceTimersByTimeAsync(600);
    gate.penalize(1000);

    await vi.advanceTimersByTimeAsync(400);
    expect(released).toBe(false);

    await vi.advanceTimersByTimeAsync(600);
    await waiting;
    expect(released).toBe(true);
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
