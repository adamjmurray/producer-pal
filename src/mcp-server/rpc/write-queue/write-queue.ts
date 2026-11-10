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

/** Writes that have arrived and not yet answered; each settles when it does. */
const unanswered = new Set<Promise<void>>();

/**
 * Run write calls one at a time, in arrival order. V8 runs other requests
 * while one waits on the remote script, so a parallel write could shift the
 * tracks or clips a waiting write already looked up.
 *
 * A read waits for the writes that arrived before it, then runs alongside
 * whatever comes next; reads never wait for each other. Otherwise a read sent
 * in parallel with a write sees it half done (two of its three envelopes).
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
      if (unanswered.size === 0) {
        return await send(tool, args, rest);
      }

      const ahead = Promise.all(unanswered).then(() => undefined);
      const turn = await waitFor(ahead, tool, budgetMs, signal);

      return "notRun" in turn
        ? notRunResponse(turn.notRun)
        : await send(tool, args, rest, turn.waitedMs);
    }

    const markAnswered = trackWrite();

    try {
      const turn = await takeTurn(tool, budgetMs, signal);

      if ("notRun" in turn) {
        return notRunResponse(turn.notRun);
      }

      try {
        return await send(tool, args, rest, turn.waitedMs);
      } finally {
        passTurn();
      }
    } finally {
      markAnswered();
    }
  };
}

/**
 * Hold reads that arrive from now on until this write answers.
 * @returns Marks the write answered
 */
function trackWrite(): () => void {
  let resolveAnswer!: () => void;
  const answer = new Promise<void>((resolve) => {
    resolveAnswer = resolve;
  });

  unanswered.add(answer);

  return () => {
    unanswered.delete(answer);
    resolveAnswer();
  };
}

/**
 * Wait for this write's turn, or until it runs out of time or its caller goes.
 * @param tool - Tool name, for the log
 * @param budgetMs - The call's whole timeout
 * @param signal - Aborts when the caller goes away
 * @returns How long it waited, or why it won't run
 */
function takeTurn(
  tool: string,
  budgetMs: number,
  signal: AbortSignal | undefined,
): Promise<Turn> {
  if (signal?.aborted === true) {
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
 * Wait for the writes ahead of a read, or until it runs out of time or its
 * caller goes.
 * @param ahead - Settles once every write ahead of the read has answered
 * @param tool - Tool name, for the log
 * @param budgetMs - The call's whole timeout
 * @param signal - Aborts when the caller goes away
 * @returns How long it waited, or why it won't run
 */
function waitFor(
  ahead: Promise<void>,
  tool: string,
  budgetMs: number,
  signal: AbortSignal | undefined,
): Promise<Turn> {
  if (signal?.aborted === true) {
    return Promise.resolve({ notRun: disconnectedText() });
  }

  nodeInfo(`${tool} waits for ${unanswered.size} write call(s)`);

  const since = Date.now();
  const minRunMs = Math.min(MIN_RUN_BUDGET_MS, budgetMs / 2);

  return new Promise((resolve) => {
    const leave = (turn: Turn): void => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      resolve(turn);
    };

    const onAbort = (): void => leave({ notRun: disconnectedText() });
    const timer = setTimeout(
      () => leave({ notRun: outOfTimeText(Date.now() - since) }),
      budgetMs - minRunMs,
    );

    signal?.addEventListener("abort", onAbort);

    // The writes can answer after the give-up point but before the timer fires.
    void ahead.then(() => {
      const waitedMs = Date.now() - since;

      leave(
        budgetMs - waitedMs < minRunMs
          ? { notRun: outOfTimeText(waitedMs) }
          : { waitedMs },
      );
    });
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
