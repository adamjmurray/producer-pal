// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic), Claude Code (Anthropic)
// SPDX-License-Identifier: MIT

// How V8 calls one remote-script route, folding every way it can fail into one
// outcome.

import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import { REQUEST_OUT_OF_TIME } from "#src/tools/shared/validation/lists/named-targets.ts";
import {
  REMOTE_SCRIPT_UNANSWERED,
  type RouteReply,
} from "./remote-script-route-contract.ts";
import { whyUnavailable } from "./outdated-remote-script.ts";
import { remoteScriptExpiry, remoteScriptWait } from "./remote-script-wait.ts";

/** Why a request too large for one Max message was never sent. */
const REQUEST_TOO_LARGE =
  "too large to send to the remote script, so nothing was sent";

/**
 * What one route answered: its result, or why there isn't one. `stalled` marks
 * a failure that the next call would meet too: no time left (`out-of-time`,
 * nothing sent) or no answer (`unanswered`, which may still have landed).
 */
export type RouteOutcome<T> =
  | { ok: true; result: T }
  | {
      ok: false;
      reason: string;
      available: boolean;
      /** The remote script is running but too old: `reason` says so. */
      outdated?: true;
      /** Too large to send in one Max message; nothing was sent. */
      tooLarge?: true;
      stalled?: "out-of-time" | "unanswered";
    };

/**
 * Call one remote-script route that only reads.
 * @param route - The Node route that forwards to the remote script
 * @param args - What to send it
 * @param deadline - The request deadline from ToolContext, if any
 * @param missing - What to say when the remote script isn't running
 * @param manage - Whether the caller can use ppal-manage (`manageOffered`)
 * @param maxWaitMs - A shorter wait than the usual one, for a caller that can
 *   do without the answer
 * @returns The route's result, or why there isn't one
 */
export function remoteScriptRoute<T>(
  route: string,
  args: object,
  deadline: number | null | undefined,
  missing: string,
  manage: boolean,
  maxWaitMs?: number,
): Promise<RouteOutcome<T>> {
  return callRoute<T>(route, args, deadline, missing, manage, { maxWaitMs });
}

/**
 * Call one remote-script route that changes the Set. It sends `expiresInMs`, so
 * Live skips the job if it hasn't started it by the time V8 stops waiting,
 * rather than make a change V8 already reported as failed. A change that fails
 * after Live may have started it comes back `stalled: "unanswered"`.
 * @param route - The Node route that forwards to the remote script
 * @param args - What to send it
 * @param deadline - The request deadline from ToolContext, if any
 * @param missing - What to say when the remote script isn't running
 * @param manage - Whether the caller can use ppal-manage (`manageOffered`)
 * @returns The route's result, or why there isn't one
 */
export function remoteScriptChange<T>(
  route: string,
  args: object,
  deadline: number | null | undefined,
  missing: string,
  manage: boolean,
): Promise<RouteOutcome<T>> {
  return callRoute<T>(route, args, deadline, missing, manage, { change: true });
}

// --- Helpers below main exports ---

/**
 * Call one route, folding every way it can fail into one outcome.
 * @param route - The Node route that forwards to the remote script
 * @param args - What to send it
 * @param deadline - The request deadline from ToolContext, if any
 * @param missing - What to say when the remote script isn't running
 * @param manage - Whether the caller can use ppal-manage
 * @param options - `maxWaitMs`: a shorter wait than the usual one; `change`:
 *   send the expiry a change needs
 * @returns The route's result, or why there isn't one
 */
async function callRoute<T>(
  route: string,
  args: object,
  deadline: number | null | undefined,
  missing: string,
  manage: boolean,
  options: { maxWaitMs?: number; change?: boolean },
): Promise<RouteOutcome<T>> {
  const usual = remoteScriptWait(deadline);
  const waitMs =
    usual == null ? null : Math.min(usual, options.maxWaitMs ?? usual);

  if (waitMs == null) {
    return {
      ok: false,
      reason: REQUEST_OUT_OF_TIME,
      available: true,
      stalled: "out-of-time",
    };
  }

  const response = await requestNode<RouteReply<T>>(
    route,
    options.change
      ? { ...args, expiresInMs: remoteScriptExpiry(waitMs) }
      : args,
    waitMs,
  );
  const reply = response.result;

  if (response.tooLarge === true) {
    return {
      ok: false,
      reason: REQUEST_TOO_LARGE,
      available: true,
      tooLarge: true,
    };
  }

  if (!response.success || reply == null) {
    // The text on a failed response is V8's or Node's own, not ours to show.
    return {
      ok: false,
      reason: REMOTE_SCRIPT_UNANSWERED,
      available: true,
      stalled: "unanswered",
    };
  }

  if (!reply.available) {
    return {
      ok: false,
      reason: whyUnavailable(reply, missing, manage),
      available: false,
      ...(reply.outdated != null && { outdated: true as const }),
    };
  }

  if (!("error" in reply)) {
    return { ok: true, result: reply.result };
  }

  return {
    ok: false,
    reason: reply.error,
    available: true,
    ...(reply.unfinished === true && { stalled: "unanswered" as const }),
  };
}
