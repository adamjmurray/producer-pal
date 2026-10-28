// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { runWrite } from "#src/tools/shared/write-pipeline/write-pipeline.ts";
import {
  type PipelineResult,
  type WriteSpec,
} from "#src/tools/shared/write-pipeline/write-pipeline-types.ts";
import {
  type CreateTrackChecked,
  checkCreateTrackCall,
} from "./helpers/check-create-track-call.ts";
import { type CreateTrackTarget } from "./helpers/create-track-targets.ts";
import {
  type CreateTrackArgs,
  type CreateTrackCall,
  createTrackLists,
  createTrackTargets,
  parseCreateTrackCall,
} from "./helpers/parse-create-track-call.ts";
import { settleCreatedTracks } from "./helpers/settle-created-tracks.ts";
import {
  type CreatedTrackResult,
  writeCreatedTrack,
} from "./helpers/write-created-track.ts";

/**
 * Creates tracks at the places a path names
 * @param args - The track parameters
 * @param args.path - Where they go: "t+", "t<index>" or "rt+", comma-separated for several
 * @param args.trackIndex - Deprecated index (0-based, -1 or omit to append)
 * @param args.count - Deprecated repeat of a single path
 * @param args.name - Name for all, or one per track, in order
 * @param args.color - Color for all, or one per track, in order (CSS format: hex)
 * @param args.type - Type of tracks ("midi", "audio", or "return")
 * @param args.mute - Mute state for the tracks
 * @param args.solo - Solo state for the tracks
 * @param args.arm - Arm state for the tracks
 * @param context - Internal context object, for the request deadline
 * @returns One entry per track, unwrapped when the call named one
 */
export function createTrack(
  args: CreateTrackArgs = {},
  context: Partial<ToolContext> = {},
): PipelineResult<CreatedTrackResult> {
  // No hook awaits, so the answer is never a promise.
  return runWrite(
    CREATE_TRACK_WRITE,
    args,
    context,
  ) as PipelineResult<CreatedTrackResult>;
}

const CREATE_TRACK_WRITE: WriteSpec<
  CreateTrackArgs,
  CreateTrackCall,
  CreateTrackTarget,
  CreateTrackChecked,
  CreatedTrackResult
> = {
  tool: "ppal-create-track",
  words: { rerun: "path" },
  parse: parseCreateTrackCall,
  lists: createTrackLists,
  targets: createTrackTargets,
  check: checkCreateTrackCall,
  write: writeCreatedTrack,
  settle: settleCreatedTracks,
};
