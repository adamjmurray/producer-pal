// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { idDoesNotExist } from "#src/tools/shared/validation/id-validation.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { duplicateToArrangementTarget } from "#src/tools/shared/arrangement/arrangement-duplicate-target.ts";
import { type TilingContext } from "#src/tools/shared/arrangement/helpers/arrangement-tiling-clips.ts";
import { finishCopy, type MinimalClipInfo } from "../minimal-clip-info.ts";
import { type CopyAttempt } from "./duplicate-one-copy.ts";
import { withLaneWriteNote } from "./stamp-automation.ts";
import {
  createClipsForLength,
  parseArrangementLength,
} from "./arrangement-length.ts";
import { requireTrackIndex } from "#src/tools/shared/validation/object-path-for-api.ts";

/**
 * Duplicate a clip to the arrangement view
 * @param clipId - Clip ID to duplicate
 * @param arrangementStartBeats - Start position in beats
 * @param destTrackIndex - Track to place the copy on (may differ from the source's)
 * @param name - Optional name for the duplicated clip
 * @param color - Optional color for the duplicated clip
 * @param arrangementLength - Optional length (<count>bar, n<fraction>, or <count>bar+n<fraction>)
 * @param songTimeSigNumerator - Song time signature numerator (resolves arrangementLength bars)
 * @param songTimeSigDenominator - Song time signature denominator (resolves arrangementLength bars)
 * @param context - Context object with silenceWavPath
 * @param sourceClip - The clip, when the caller already resolved it
 * @param tracks - The destination tracks, keyed by index
 * @returns The copy, or why the destination got none
 */
export async function duplicateClipToArrangement(
  clipId: string,
  arrangementStartBeats: number,
  destTrackIndex?: number,
  name?: string,
  color?: string,
  arrangementLength?: string,
  songTimeSigNumerator = 4,
  songTimeSigDenominator = 4,
  context: Partial<ToolContext & TilingContext> = {},
  sourceClip: LiveAPI | null = null,
  tracks: Map<number, LiveAPI> = new Map(),
): Promise<CopyAttempt> {
  // Support "id {id}" (such as returned by childIds()) and id values directly.
  // A source hoisted across the copies of one call stays good: Live's
  // arrangement duplicate never destroys its own source — measured on 12.4.3,
  // an exact self-cover no-ops and hands back the source's own id — and
  // clearClipAtDuplicateTarget refuses to clear it. That matters because
  // exists() could not tell us otherwise: a dead handle keeps its id
  // (dev/live-api/object-reuse.md).
  const clip = sourceClip ?? LiveAPI.from(clipId);

  if (!clip.exists()) {
    throw new Error(idDoesNotExist(clipId));
  }

  const trackIndex = destTrackIndex ?? requireTrackIndex(clip);

  const track =
    tracks.get(trackIndex) ?? LiveAPI.from(livePath.track(trackIndex));
  let copy: MinimalClipInfo | undefined;

  if (arrangementLength != null) {
    // Resolve bars against the SONG meter, consistent with every other
    // arrangement-facing surface (create/update clip, read-clip read-back). The
    // clip's own meter governs its internal notation, not its arrangement span.
    const arrangementLengthBeats = parseArrangementLength(
      arrangementLength,
      songTimeSigNumerator,
      songTimeSigDenominator,
    );

    copy = await createClipsForLength(
      clip,
      track,
      arrangementStartBeats,
      arrangementLengthBeats,
      songTimeSigNumerator,
      songTimeSigDenominator,
      name,
      context,
      color,
    );
  } else {
    // No length specified - use original behavior. Routes a self-overlapping
    // source through the holding area (overwrite semantics) instead of skipping;
    // clears other overlapping clips otherwise.
    const isMidiClip = clip.getProperty("is_midi_clip") === 1;

    const newClip = duplicateToArrangementTarget(
      track,
      clip.id,
      arrangementStartBeats,
      isMidiClip,
      context as TilingContext,
      clip,
    );

    // Skip a silent Ableton dup failure (["id", 0]) rather than push a phantom
    // clip, matching the guard in update-clip.
    if (newClip.exists()) {
      copy = withLaneWriteNote(clip, finishCopy(newClip, name, color));
    }
  }

  // Nothing landed: Live declines a duplicate it can't do without raising.
  return copy == null ? { refused: "Live made no copy there" } : { copy };
}
