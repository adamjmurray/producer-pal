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

import { type ChatMessage } from "#webui/chat/sdk/types";
import {
  calculateRetryDelay,
  detectRateLimit,
  MAX_RETRY_ATTEMPTS,
  shouldRetry,
} from "#webui/lib/rate-limit";
import { abortableSleep } from "#webui/lib/utils/abortable-sleep";

/** Follow-up sent when a retry resumes a worker that already did some work. */
const RESUME_MESSAGE = "continue";

/**
 * Longest single sleep inside a gate wait. The window can be extended by a
 * sibling mid-wait, so waiting the whole remainder in one go would leave the
 * published deadline (and the card's countdown) stale until it expired. Waking
 * each second re-reads the window and republishes.
 */
const WAIT_SLICE_MS = 1000;

/** Options for one worker's retry-wrapped run. */
export interface SubagentRetryOptions {
  /** The delegated instruction, sent as the worker's first user message. */
  task: string;
  /** Run the worker's stream to completion with `message` as the user turn. */
  runAttempt: (message: string) => Promise<void>;
  /** The worker's live chat history (read to decide resume vs. restart). */
  getHistory: () => ChatMessage[];
  /**
   * Where this run's own messages start in that history — nonzero when the
   * worker was seeded with a session to continue. Everything below it belongs to
   * an earlier run: not output this attempt may claim credit for, and not history
   * a restart may throw away. Defaults to 0 (a fresh worker).
   */
  baselineLength?: number;
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
 *
 * NOTE: this and useChat's executeWithRetry encode the same retry strategy for
 * two different layers (this one throws; that one writes UI state and an error
 * message into history). They are deliberately separate, so a change to the
 * budget, the delay schedule, or the resume rule has to be made in both.
 * @param options - Task, attempt runner, history accessor, gate, and callbacks
 * @throws The underlying error when it isn't a rate limit, when the retry
 *   budget is exhausted, or when the turn was aborted
 */
export async function runSubagentWithRetry(
  options: SubagentRetryOptions,
): Promise<void> {
  const {
    task,
    runAttempt,
    getHistory,
    baselineLength = 0,
    gate,
    abortSignal,
    onStatus,
  } = options;
  let attempt = 0;
  // Which attempt the pending wait is for: null until this worker is itself
  // rate-limited, so a wait forced purely by a sibling's backoff is reported as
  // such rather than as this worker's own retry.
  let waitingFor: number | null = null;

  try {
    for (;;) {
      const pendingAttempt = waitingFor;

      // Hold off while any sibling is serving a shared cooldown, so N parallel
      // spawns don't all hammer a provider that just rate-limited one of them.
      // The window can be extended mid-wait, so the deadline is republished as
      // it moves instead of being snapshotted once.
      await gate.wait(abortSignal, (retryAtMs) =>
        onStatus?.({
          attempt: pendingAttempt,
          maxAttempts: MAX_RETRY_ATTEMPTS,
          retryAtMs,
        }),
      );
      onStatus?.(null);

      try {
        await runAttempt(nextMessage(task, getHistory(), baselineLength));

        return;
      } catch (error) {
        const rateLimitInfo = detectRateLimit(error);

        if (abortSignal?.aborted || !rateLimitInfo.isRateLimited) throw error;

        if (!shouldRetry(attempt + 1)) throw exhaustedError(error, attempt + 1);

        gate.penalize(calculateRetryDelay(attempt, rateLimitInfo.retryAfterMs));
        waitingFor = attempt;
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
   * Sleeps in slices, re-reading the window each time, so a sibling extending
   * it mid-wait keeps this caller parked AND gets the new deadline reported
   * promptly instead of after the original one passes.
   * @param abortSignal - Cancels the wait (rejects) when the turn is aborted
   * @param onDeadline - Called with the current end-of-cooldown timestamp
   *   before each slice; never called when the gate is already open
   */
  async wait(
    abortSignal?: AbortSignal,
    onDeadline?: (deadlineMs: number) => void,
  ): Promise<void> {
    let remaining = this.remainingMs;

    while (remaining > 0) {
      onDeadline?.(this.cooldownUntilMs);
      await abortableSleep(Math.min(remaining, WAIT_SLICE_MS), abortSignal);
      remaining = this.remainingMs;
    }
  }
}

/** A worker's in-progress rate-limit backoff, as shown on its card. */
export interface SubagentRateLimitStatus {
  /**
   * 0-indexed retry attempt this wait leads to, or null when the worker was
   * never rate-limited itself and is only holding for a sibling's backoff.
   */
  attempt: number | null;
  /** Retry budget, matching the main chat's MAX_RETRY_ATTEMPTS */
  maxAttempts: number;
  /** Epoch ms when the backoff ends and the wait releases */
  retryAtMs: number;
}

/**
 * Live per-worker status keyed by the spawn tool-call id that owns the card.
 *
 * A worker runs entirely inside the spawn tool's execute(), so nothing it does
 * reaches the orchestrator's stream — the card is frozen at "working…" for
 * the whole worker run and cannot otherwise learn that the worker is sitting out
 * a backoff. Module-level (not React state) because the writer is this
 * framework-free client. Entries are transient: each is cleared when its worker
 * finishes, and neither the history nor the model ever sees them.
 */
const statuses = new Map<string, SubagentRateLimitStatus>();
const listeners = new Set<() => void>();

/**
 * Publish (or clear, with null) a worker's rate-limit status and notify
 * subscribers. A write that changes nothing is a no-op — clearing an id that
 * has no status (the common finish path) or republishing an unchanged deadline
 * (every gate wait slice) must not re-render every card.
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
    if (isSameStatus(statuses.get(toolCallId), status)) return;

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
 * Whether a republished status is identical to what's already stored.
 * @param previous - The stored status, if any
 * @param next - The status being published
 * @returns True when nothing subscribers care about changed
 */
function isSameStatus(
  previous: SubagentRateLimitStatus | undefined,
  next: SubagentRateLimitStatus,
): boolean {
  if (previous == null) return false;

  return (
    previous.attempt === next.attempt &&
    previous.maxAttempts === next.maxAttempts &&
    previous.retryAtMs === next.retryAtMs
  );
}

/**
 * The user turn the next attempt should send, dropping a leftover echo of the
 * task when the failed attempt produced nothing worth resuming.
 *
 * Everything below `baseline` is a seeded session from an earlier run, so it is
 * neither output this run produced nor history a restart may discard — the
 * restart rewinds to the baseline, not to empty. Getting this wrong on a resumed
 * worker would send "continue" on the FIRST attempt (the seeded session reads as
 * output) and drop the follow-up instruction entirely.
 * @param task - The original delegated instruction
 * @param history - The worker's chat history (rewound when restarting)
 * @param baseline - Index where this run's own messages start
 * @returns "continue" to resume partial work, or the task to start over
 */
function nextMessage(
  task: string,
  history: ChatMessage[],
  baseline: number,
): string {
  if (hasWorkerOutput(history, baseline)) return RESUME_MESSAGE;

  history.length = baseline;

  return task;
}

/**
 * Whether the worker produced output a retry must preserve. A tool call counts
 * even with no text: it may already have changed the Live Set, so restarting
 * from scratch would redo it.
 * @param history - The worker's chat history
 * @param from - Index to start looking from (skips any seeded session)
 * @returns True when there is assistant output worth resuming from
 */
function hasWorkerOutput(history: ChatMessage[], from: number): boolean {
  return history
    .slice(from)
    .some(
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
