// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Rate-limit handling for subagent workers: the retry wrapper, the backoff
 * window their orchestrator shares between them, and the side channel that gets
 * a worker's wait onto its card.
 *
 * The main chat's 429s are handled a layer up, by useChat's executeWithRetry.
 * Workers can't use it: they stream inside the spawn tool's execute(), below
 * that hook, so everything they need lives here instead.
 */

import {
  calculateRetryDelay,
  detectRateLimit,
  MAX_RETRY_ATTEMPTS,
  shouldRetry,
} from "#webui/lib/rate-limit";
import { type ChatMessage } from "./types";

/** Follow-up sent when a retry resumes a worker that already did some work. */
const RESUME_MESSAGE = "continue";

/** Options for one worker's retry-wrapped run. */
export interface SubagentRetryOptions {
  /** The delegated instruction, sent as the worker's first user message. */
  task: string;
  /** Run the worker's stream to completion with `message` as the user turn. */
  runAttempt: (message: string) => Promise<void>;
  /** The worker's live chat history (read to decide resume vs. restart). */
  getHistory: () => ChatMessage[];
  /** Backoff window shared with every sibling worker. */
  gate: RateLimitGate;
  /** The orchestrator turn's signal; aborts stop retrying immediately. */
  abortSignal?: AbortSignal;
  /** Publishes the current backoff (null = not waiting) for the card. */
  onStatus?: (status: SubagentRateLimitStatus | null) => void;
}

/**
 * Run one subagent worker with the same rate-limit backoff the main chat gets.
 *
 * Workers stream with `maxRetries: 0` like every other request, but they run
 * inside a tool's execute() — out of reach of executeWithRetry — so a 429 used
 * to reject straight out as a tool-error and kill the delegated work outright.
 * This is that missing layer, plus the cross-worker coordination the main chat
 * has no need for: every attempt parks on the shared gate first, and a 429 here
 * penalizes the gate so siblings back off too instead of each rediscovering the
 * limit on their own connection.
 *
 * Resuming mirrors executeWithRetry: once the worker has produced real output
 * (text or a tool call — Live may already have been edited) the retry sends
 * "continue" and keeps the work; with nothing to keep, the failed attempt's
 * echoed task is dropped so the retry sends one clean turn instead of stacking
 * duplicate user messages.
 * @param options - Task, attempt runner, history accessor, gate, and callbacks
 * @throws The underlying error when it isn't a rate limit, when the retry
 *   budget is exhausted, or when the turn was aborted
 */
export async function runSubagentWithRetry(
  options: SubagentRetryOptions,
): Promise<void> {
  const { task, runAttempt, getHistory, gate, abortSignal, onStatus } = options;
  let attempt = 0;

  try {
    for (;;) {
      // Hold off while any sibling is serving a shared cooldown, so N parallel
      // spawns don't all hammer a provider that just rate-limited one of them.
      await gate.wait(abortSignal);
      onStatus?.(null);

      try {
        await runAttempt(nextMessage(task, getHistory()));

        return;
      } catch (error) {
        const rateLimitInfo = detectRateLimit(error);

        if (abortSignal?.aborted || !rateLimitInfo.isRateLimited) throw error;

        if (!shouldRetry(attempt + 1)) throw exhaustedError(error, attempt + 1);

        gate.penalize(calculateRetryDelay(attempt, rateLimitInfo.retryAfterMs));
        onStatus?.({
          attempt,
          maxAttempts: MAX_RETRY_ATTEMPTS,
          retryAtMs: Date.now() + gate.remainingMs,
        });
        attempt++;
      }
    }
  } finally {
    onStatus?.(null);
  }
}

/**
 * Shared backoff window for every worker under one orchestrator client.
 *
 * Parallel subagents each stream on their own provider connection, so a 429 hit
 * by one worker says nothing to its siblings — without coordination they keep
 * hammering the provider that just asked everyone to slow down, and each burns
 * its own retry budget rediscovering the same limit. One gate instance lives on
 * the orchestrator's ChatSdkClient and is shared by every worker it spawns.
 *
 * The window only ever moves later (penalize takes the max), so a longer
 * Retry-After from a second worker mid-wait extends the wait for all of them.
 */
export class RateLimitGate {
  private cooldownUntilMs = 0;

  /**
   * Milliseconds left in the shared cooldown; 0 when the gate is open.
   * @returns Remaining cooldown in milliseconds
   */
  get remainingMs(): number {
    return Math.max(0, this.cooldownUntilMs - Date.now());
  }

  /**
   * Record a rate limit: hold everyone off for at least `delayMs` from now.
   * @param delayMs - Backoff the caller intends to serve, in milliseconds
   */
  penalize(delayMs: number): void {
    this.cooldownUntilMs = Math.max(this.cooldownUntilMs, Date.now() + delayMs);
  }

  /**
   * Resolve once the shared cooldown has elapsed (immediately when open).
   * Re-checks after each sleep so a sibling extending the window mid-wait keeps
   * this caller parked rather than releasing it early.
   * @param abortSignal - Cancels the wait (rejects) when the turn is aborted
   */
  async wait(abortSignal?: AbortSignal): Promise<void> {
    let remaining = this.remainingMs;

    while (remaining > 0) {
      await sleep(remaining, abortSignal);
      remaining = this.remainingMs;
    }
  }
}

/** A worker's in-progress rate-limit backoff, as shown on its card. */
export interface SubagentRateLimitStatus {
  /** 0-indexed retry attempt about to be made */
  attempt: number;
  /** Retry budget, matching the main chat's MAX_RETRY_ATTEMPTS */
  maxAttempts: number;
  /** Epoch ms when the backoff ends and the retry fires */
  retryAtMs: number;
}

/**
 * Live per-worker status keyed by the spawn tool-call id that owns the card.
 *
 * A worker runs entirely inside the spawn tool's execute(), so nothing it does
 * reaches the orchestrator's fullStream — the card is frozen at "working…" for
 * the whole worker run and cannot otherwise learn that the worker is sitting out
 * a backoff. Module-level (not React state) because the writer is this
 * framework-free client. Entries are transient: each is cleared when its worker
 * finishes, and neither the history nor the model ever sees them.
 */
const statuses = new Map<string, SubagentRateLimitStatus>();
const listeners = new Set<() => void>();

/**
 * Publish (or clear, with null) a worker's rate-limit status and notify
 * subscribers. Clearing an id that has no status is a no-op — no notification,
 * so the common finish path doesn't re-render every card.
 * @param toolCallId - The spawn tool-call id identifying the worker's card
 * @param status - The backoff in progress, or null to clear
 */
export function setSubagentRateLimit(
  toolCallId: string,
  status: SubagentRateLimitStatus | null,
): void {
  if (status == null) {
    if (!statuses.delete(toolCallId)) return;
  } else {
    statuses.set(toolCallId, status);
  }

  for (const listener of listeners) listener();
}

/**
 * Read a worker's current rate-limit status.
 * @param toolCallId - The spawn tool-call id identifying the worker's card
 * @returns The backoff in progress, or null when the worker isn't waiting
 */
export function getSubagentRateLimit(
  toolCallId: string,
): SubagentRateLimitStatus | null {
  return statuses.get(toolCallId) ?? null;
}

/**
 * Subscribe to every status change (the listener re-reads what it cares about).
 * @param listener - Called after any status is set or cleared
 * @returns Unsubscribe function
 */
export function subscribeToSubagentRateLimits(
  listener: () => void,
): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

/**
 * Drop all statuses without notifying. For test isolation only — production
 * clears each entry through setSubagentRateLimit when its worker finishes.
 */
export function resetSubagentRateLimits(): void {
  statuses.clear();
}

/**
 * Promise-based setTimeout that rejects instead of resolving when the signal
 * aborts, so an aborted turn unwinds its waiters rather than serving out a
 * minute-long backoff nobody is waiting for anymore.
 * @param ms - Delay in milliseconds
 * @param abortSignal - Signal that cancels the delay
 */
export function sleep(ms: number, abortSignal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (abortSignal?.aborted) {
      reject(new Error("Aborted"));

      return;
    }

    const timer: { id: ReturnType<typeof setTimeout> | null } = { id: null };

    const onAbort = () => {
      if (timer.id != null) clearTimeout(timer.id);
      reject(new Error("Aborted"));
    };

    timer.id = setTimeout(() => {
      abortSignal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    abortSignal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * The user turn the next attempt should send, dropping a leftover echo of the
 * task when the failed attempt produced nothing worth resuming.
 * @param task - The original delegated instruction
 * @param history - The worker's chat history (cleared when restarting)
 * @returns "continue" to resume partial work, or the task to start over
 */
function nextMessage(task: string, history: ChatMessage[]): string {
  if (hasWorkerOutput(history)) return RESUME_MESSAGE;

  history.length = 0;

  return task;
}

/**
 * Whether the worker produced output a retry must preserve. A tool call counts
 * even with no text: it may already have changed the Live Set, so restarting
 * from scratch would redo it.
 * @param history - The worker's chat history
 * @returns True when there is assistant output worth resuming from
 */
function hasWorkerOutput(history: ChatMessage[]): boolean {
  return history.some(
    (msg) =>
      msg.role === "assistant" &&
      !msg.isError &&
      (msg.content.trim() !== "" || (msg.toolCalls?.length ?? 0) > 0),
  );
}

/**
 * Error surfaced to the orchestrator when a worker never got past the rate
 * limit. Phrased so the model can act on it (wait, or do the work itself)
 * rather than reading a raw provider 429.
 * @param error - The last underlying rate-limit error
 * @param attempts - How many attempts were made in total
 * @returns The error to throw out of the spawn tool
 */
function exhaustedError(error: unknown, attempts: number): Error {
  const detail = error instanceof Error ? error.message : String(error);

  return new Error(
    `Subagent gave up after ${attempts} rate-limited attempts: ${detail}. ` +
      "Wait before delegating again, or do this part of the work yourself.",
  );
}
