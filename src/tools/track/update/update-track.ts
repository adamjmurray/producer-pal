// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { blankTargetIgnores } from "#src/tools/shared/validation/lists/target-lists.ts";
import { runWrite } from "#src/tools/shared/write-pipeline/write-pipeline.ts";
import {
  type Call,
  type Done,
  type PipelineResult,
  type WriteSpec,
} from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import {
  type TrackChecked,
  checkTrackCall,
} from "./helpers/call/check-track-call.ts";
import {
  type TrackCall,
  type UpdateTrackArgs,
  parseTrackCall,
  trackListArgs,
} from "./helpers/call/parse-track-call.ts";
import {
  type TrackPayload,
  trackTargets,
} from "./helpers/call/resolve-track-targets.ts";
import { type TrackEntry, writeTrack } from "./helpers/call/write-track.ts";

/** What update-track answers: the lone entry, or one entry per target. */
export type UpdateTrackAnswer = PipelineResult<TrackEntry>;

/**
 * Updates properties of existing tracks, and the take lanes on them
 * @param args - The track parameters
 * @param args.id - Track ID or comma-separated list of track IDs to update
 * @param args.ids - Hidden alias for id
 * @param args.path - Track or take lane path(s) to update instead of ids, comma-separated
 * @param args.paths - Hidden alias for path
 * @param args.name - Optional track name
 * @param args.color - Optional track color (CSS format: hex)
 * @param args.gainDb - Optional track gain in dB (-70 to 6)
 * @param args.pan - Optional pan position in stereo mode (-1 to 1)
 * @param args.panningMode - Optional panning mode ('stereo' or 'split')
 * @param args.leftPan - Optional left channel pan in split mode (-1 to 1)
 * @param args.rightPan - Optional right channel pan in split mode (-1 to 1)
 * @param args.mute - Optional mute state
 * @param args.solo - Optional solo state
 * @param args.arm - Optional arm state
 * @param args.inputRoutingType - Optional input routing type name or identifier
 * @param args.inputRoutingChannel - Optional input routing channel name or identifier
 * @param args.outputRoutingType - Optional output routing type name or identifier
 * @param args.outputRoutingChannel - Optional output routing channel name or identifier
 * @param args.inputRoutingTypeId - Deprecated alias for inputRoutingType
 * @param args.inputRoutingChannelId - Deprecated alias for inputRoutingChannel
 * @param args.outputRoutingTypeId - Deprecated alias for outputRoutingType
 * @param args.outputRoutingChannelId - Deprecated alias for outputRoutingChannel
 * @param args.monitoringState - Optional monitoring state ('in', 'auto', 'off')
 * @param args.sendGainDb - Optional send gain in dB (-70 to 0), requires sendReturn
 * @param args.sendReturn - Optional return track id, name, or letter prefix, requires sendGainDb
 * @param args.sends - Optional [{return, gainDb}] list, to set several at once
 * @param context - Internal context object, for the request deadline
 * @returns The target when one was named, otherwise one entry per target
 */
export function updateTrack(
  args: UpdateTrackArgs,
  context: Partial<ToolContext> = {},
): UpdateTrackAnswer {
  // No hook awaits, so the answer is never a promise.
  return runWrite(TRACK_WRITE, args, context) as UpdateTrackAnswer;
}

const TRACK_WRITE: WriteSpec<
  UpdateTrackArgs,
  TrackCall,
  TrackPayload,
  TrackChecked,
  TrackEntry
> = {
  tool: "ppal-update-track",
  words: { rerun: "track" },
  parse: (args) => parseTrackCall(args),
  lists: trackListArgs,
  targets: trackTargets,
  check: checkTrackCall,
  write: writeTrack,
  settle: settleTrackUpdate,
};

// --- Helpers below main export ---

/**
 * Once every target has had its turn: say what the call dropped.
 * @param done - What the call did
 * @param call - The call's shared state
 */
function settleTrackUpdate(
  done: Done<TrackPayload, TrackChecked, TrackEntry>,
  call: Call,
): void {
  const { sent, named } = done.checked;

  // Said once the writes are done: it claims what the call did.
  for (const { param, why } of blankTargetIgnores(sent, "tracks", named)) {
    call.ignored(param, why);
  }
}
