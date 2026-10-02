// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// How V8 calls one clip-automation route, and the two things it says when there
// is no automation to reach. Shared by the read and the write side so a caller
// meets one wording, not two.

import { requestNode } from "#src/live-api-adapter/node-request-v8-protocol.ts";
import {
  type EnvelopeReply,
  REMOTE_SCRIPT_UNANSWERED,
} from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";
import { REQUEST_OUT_OF_TIME } from "#src/tools/shared/validation/lists/named-targets.ts";
import { remoteScriptWait } from "#src/tools/shared/remote-script/remote-script-wait.ts";

/** Only the remote script can reach clip automation at all. */
export const REMOTE_SCRIPT_MISSING =
  "the Producer Pal remote script isn't running, so clip automation can't be reached";

/** An arrangement clip's automation isn't the clip's — it's the track's. */
export const ARRANGEMENT_CLIP_NOTE =
  "Live doesn't give an arrangement clip envelopes of its own: its automation lives in the track's automation lane. Automate a session clip and duplicate that to the arrangement.";

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
      stalled?: "out-of-time" | "unanswered";
    };

/**
 * Call one envelope route, folding every way it can fail into one reason.
 * @param route - The Node route that forwards to the remote script
 * @param args - Which clip, and which parameter of it
 * @param deadline - The request deadline from ToolContext, if any
 * @returns The route's result, or why there isn't one
 */
export async function envelopeRoute<T>(
  route: string,
  args: object,
  deadline?: number | null,
): Promise<RouteOutcome<T>> {
  const waitMs = remoteScriptWait(deadline);

  if (waitMs == null) {
    return {
      ok: false,
      reason: REQUEST_OUT_OF_TIME,
      available: true,
      stalled: "out-of-time",
    };
  }

  const response = await requestNode<EnvelopeReply<T>>(route, args, waitMs);
  const reply = response.result;

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
    return { ok: false, reason: REMOTE_SCRIPT_MISSING, available: false };
  }

  return "error" in reply
    ? { ok: false, reason: reply.error, available: true }
    : { ok: true, result: reply.result };
}
