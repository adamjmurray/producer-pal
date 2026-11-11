// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { formatErrorResponse } from "#src/shared/mcp-responses.ts";
import { type McpResponse } from "../../max-api-adapter.ts";
import { nodeInfo } from "../../node-for-max-logger.ts";
import { markChangedNothing } from "../remote-script/forwarded/changed-nothing.ts";
import { type RequestOverrides } from "../../helpers/request-overrides/request-overrides.ts";
import { isWriteCall } from "./write-calls.ts";

type SendToolCall = (
  tool: string,
  args: object,
  overrides?: RequestOverrides,
) => Promise<McpResponse>;

/** Sends one call to V8; `queuedMs` is how much of its timeout the queue used. */
type SendToV8 = (
  tool: string,
  args: object,
  overrides: RequestOverrides,
  queuedMs?: number,
) => Promise<McpResponse>;

type Turn = { waitedMs: number } | { notRun: string };

/** Least time a queued write needs left to be worth starting. */
export const MIN_RUN_BUDGET_MS = 5_000;

/** A write is running in V8. Stays true while the turn passes down the queue. */
let busy = false;

/** Queued writes, oldest first. Each starts when called. */
const waiting: (() => void)[] = [];

/** A write that has arrived, with the reads held until it answers. */
type TrackedWrite = { readers: Set<HeldRead> };

/** A read waiting on `remaining` writes; `release` sends it. */
type HeldRead = { remaining: number; release: () => void };

/** Writes that have arrived and not yet answered, oldest first. */
const unanswered = new Set<TrackedWrite>();

/**
 * Run write calls one at a time, in arrival order. V8 runs other requests
 * while one waits on the remote script, so a parallel write could shift the
 * tracks or clips a waiting write already looked up.
 *
 * A read waits for the writes that arrived before it, then runs alongside
 * whatever comes next; reads never wait for each other. Otherwise a read sent
 * in parallel with a write sees it half done (two of its three envelopes).
 * When a write answers, the reads it was holding are sent before the next
 * write starts, so V8 sees them in arrival order.
 *
 * Waiting counts toward the call's own timeout, so the caller still hears back
 * within it. A call that gets down to MIN_RUN_BUDGET_MS (or half its timeout)
 * before it can run, or whose caller goes away, never runs. A write's turn
 * passes on when it answers, a timeout included, though V8 may still be
 * finishing a timed-out write.
 *
 * @param send - Sends one call to V8 with how long it queued, and resolves
 *   with its answer
 * @param getTimeoutMs - Reads the default timeout, for calls without an override
 * @returns The same call, with writes queued and reads behind them
 */
export function withWriteQueue(
  send: SendToV8,
  getTimeoutMs: () => number,
): SendToolCall {
  return async (tool, args, overrides) => {
    // The signal is for the queue only; V8 gets the rest.
    const { signal, ...rest } = overrides ?? {};
    const budgetMs = rest.timeoutMs ?? getTimeoutMs();

    if (!isWriteCall(tool, args)) {
      return unanswered.size === 0
        ? await send(tool, args, rest)
        : await holdRead(send, tool, args, rest, budgetMs, signal);
    }

    const markAnswered = trackWrite();

    try {
      const turn = await takeTurn(tool, budgetMs, signal, markAnswered);

      if ("notRun" in turn) {
        return notRunResponse(turn.notRun);
      }

      try {
        return await send(tool, args, rest, turn.waitedMs);
      } finally {
        // Release the held reads (sending them) before the next write starts.
        markAnswered();
        passTurn();
      }
    } finally {
      markAnswered();
    }
  };
}

/**
 * Hold reads that arrive from now on until this write answers.
 * @returns Marks the write answered and sends the reads waiting only on it,
 *   oldest first; does nothing the second time
 */
function trackWrite(): () => void {
  const write: TrackedWrite = { readers: new Set() };

  unanswered.add(write);

  return () => {
    if (!unanswered.delete(write)) {
      return;
    }

    for (const read of write.readers) {
      read.remaining--;

      if (read.remaining === 0) {
        read.release();
      }
    }
  };
}

/**
 * Wait for this write's turn, or until it runs out of time or its caller goes.
 * @param tool - Tool name, for the log
 * @param budgetMs - The call's whole timeout
 * @param signal - Aborts when the caller goes away
 * @param markAnswered - Marks the write answered; called as soon as it is
 *   known the write won't run
 * @returns How long it waited, or why it won't run
 */
function takeTurn(
  tool: string,
  budgetMs: number,
  signal: AbortSignal | undefined,
  markAnswered: () => void,
): Promise<Turn> {
  if (signal?.aborted === true) {
    markAnswered();

    return Promise.resolve({ notRun: disconnectedText() });
  }

  if (!busy) {
    busy = true;

    return Promise.resolve({ waitedMs: 0 });
  }

  nodeInfo(`Queued ${tool} behind ${waiting.length + 1} write call(s)`);

  const queuedAt = Date.now();
  const minRunMs = Math.min(MIN_RUN_BUDGET_MS, budgetMs / 2);

  return new Promise((resolve) => {
    const leave = (turn: Turn): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);

      const index = waiting.indexOf(start);

      if (index >= 0) {
        waiting.splice(index, 1);
      }

      if ("notRun" in turn) {
        markAnswered();
      }

      resolve(turn);
    };

    // The previous write can answer after the give-up point but before the
    // timer fires, so check again here, and pass the turn on if too late.
    const start = (): void => {
      const waitedMs = Date.now() - queuedAt;

      if (budgetMs - waitedMs < minRunMs) {
        leave({ notRun: outOfTimeText(waitedMs) });
        passTurn();
      } else {
        leave({ waitedMs });
      }
    };

    const onAbort = (): void => leave({ notRun: disconnectedText() });
    const timer = setTimeout(
      () => leave({ notRun: outOfTimeText(Date.now() - queuedAt) }),
      budgetMs - minRunMs,
    );

    signal?.addEventListener("abort", onAbort);
    waiting.push(start);
  });
}

/**
 * Hold a read until every write ahead of it has answered, then send it right
 * away (in the same step the last of them answers), or give up if it runs out
 * of time or its caller goes.
 * @param send - Sends one call to V8
 * @param tool - Tool name
 * @param args - The call's arguments
 * @param rest - The call's overrides, minus the signal
 * @param budgetMs - The call's whole timeout
 * @param signal - Aborts when the caller goes away
 * @returns V8's answer, or why it didn't run
 */
function holdRead(
  send: SendToV8,
  tool: string,
  args: object,
  rest: RequestOverrides,
  budgetMs: number,
  signal: AbortSignal | undefined,
): Promise<McpResponse> {
  if (signal?.aborted === true) {
    return Promise.resolve(notRunResponse(disconnectedText()));
  }

  nodeInfo(`${tool} waits for ${unanswered.size} write call(s)`);

  const since = Date.now();
  const minRunMs = Math.min(MIN_RUN_BUDGET_MS, budgetMs / 2);

  return new Promise((resolve, reject) => {
    let settled = false;

    // False if the read already left (timed out, aborted or sent).
    const leave = (): boolean => {
      if (settled) {
        return false;
      }

      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);

      return true;
    };

    // The writes can answer after the give-up point but before the timer fires.
    const release = (): void => {
      if (!leave()) {
        return;
      }

      const waitedMs = Date.now() - since;

      if (budgetMs - waitedMs < minRunMs) {
        resolve(notRunResponse(outOfTimeText(waitedMs)));

        return;
      }

      try {
        resolve(send(tool, args, rest, waitedMs));
      } catch (error) {
        reject(error);
      }
    };

    const onAbort = (): void => {
      if (leave()) {
        resolve(notRunResponse(disconnectedText()));
      }
    };

    const timer = setTimeout(() => {
      if (leave()) {
        resolve(notRunResponse(outOfTimeText(Date.now() - since)));
      }
    }, budgetMs - minRunMs);

    signal?.addEventListener("abort", onAbort);

    const held: HeldRead = { remaining: unanswered.size, release };

    for (const write of unanswered) {
      write.readers.add(held);
    }
  });
}

/** Hand the turn to the oldest queued write, or free it. */
function passTurn(): void {
  const next = waiting.shift();

  if (next) {
    next();
  } else {
    busy = false;
  }
}

/**
 * @param text - Why the call didn't run
 * @returns An error answer that counts as changing nothing
 */
function notRunResponse(text: string): McpResponse {
  const response = formatErrorResponse(text);

  markChangedNothing(response);

  return response;
}

/**
 * @param waitedMs - Time spent in the queue
 * @returns The answer for a write that ran out of time waiting
 */
function outOfTimeText(waitedMs: number): string {
  const seconds = Number((waitedMs / 1000).toFixed(1));

  return (
    `Not run: waited ${seconds}s for other Producer Pal writes to finish ` +
    `and ran out of time. Nothing changed; retry it.`
  );
}

/** @returns The answer for a write whose caller went away while it waited */
function disconnectedText(): string {
  return "Not run: the caller disconnected before its turn. Nothing changed.";
}
