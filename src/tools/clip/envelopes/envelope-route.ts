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
  REMOTE_SCRIPT_REQUEST_TIMEOUT_MS,
} from "#src/tools/clip/envelopes/remote-script-envelope-contract.ts";

/** Only the remote script can reach clip automation at all. */
export const REMOTE_SCRIPT_MISSING =
  "the Producer Pal remote script isn't running, so clip automation can't be reached";

/** An arrangement clip's automation isn't the clip's — it's the track's. */
export const ARRANGEMENT_CLIP_NOTE =
  "Live doesn't give an arrangement clip envelopes of its own: its automation lives in the track's automation lane. Automate a session clip and duplicate that to the arrangement.";

/** What one route answered: its result, or why there isn't one. */
export type RouteOutcome<T> =
  | { ok: true; result: T }
  | { ok: false; reason: string; available: boolean };

/**
 * Call one envelope route, folding every way it can fail into one reason.
 * @param route - The Node route that forwards to the remote script
 * @param args - Which clip, and which parameter of it
 * @returns The route's result, or why there isn't one
 */
export async function envelopeRoute<T>(
  route: string,
  args: object,
): Promise<RouteOutcome<T>> {
  const response = await requestNode<EnvelopeReply<T>>(
    route,
    args,
    REMOTE_SCRIPT_REQUEST_TIMEOUT_MS,
  );
  const reply = response.result;

  if (!response.success || reply == null) {
    return {
      ok: false,
      reason: response.error ?? "the remote script went unanswered",
      available: true,
    };
  }

  if (!reply.available) {
    return { ok: false, reason: REMOTE_SCRIPT_MISSING, available: false };
  }

  return "error" in reply
    ? { ok: false, reason: reply.error, available: true }
    : { ok: true, result: reply.result };
}
