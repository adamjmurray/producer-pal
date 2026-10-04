// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// How V8 calls one clip-automation route, and the two things it says when there
// is no automation to reach. Shared by the read and the write side so a caller
// meets one wording, not two.

import {
  remoteScriptRoute,
  type RouteOutcome,
} from "#src/tools/shared/remote-script/remote-script-route.ts";

export type { RouteOutcome };

/** Only the remote script can reach clip automation at all. */
export const REMOTE_SCRIPT_MISSING =
  "the Producer Pal remote script isn't running, so clip automation can't be reached";

/** An arrangement clip's automation isn't the clip's — it's the track's. */
export const ARRANGEMENT_CLIP_NOTE =
  "Live doesn't give an arrangement clip envelopes of its own: its automation lives in the track's automation lane. Automate a session clip and duplicate that to the arrangement.";

/**
 * Call one envelope route, folding every way it can fail into one reason.
 * @param route - The Node route that forwards to the remote script
 * @param args - Which clip, and which parameter of it
 * @param deadline - The request deadline from ToolContext, if any
 * @returns The route's result, or why there isn't one
 */
export function envelopeRoute<T>(
  route: string,
  args: object,
  deadline?: number | null,
): Promise<RouteOutcome<T>> {
  return remoteScriptRoute<T>(route, args, deadline, REMOTE_SCRIPT_MISSING);
}
