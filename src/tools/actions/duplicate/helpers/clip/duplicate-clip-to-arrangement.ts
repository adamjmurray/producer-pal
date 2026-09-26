// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { duplicateToArrangementTarget } from "#src/tools/shared/arrangement/arrangement-duplicate-target.ts";
import { type TilingContext } from "#src/tools/shared/arrangement/helpers/arrangement-tiling-clips.ts";
import { arrangementPath } from "#src/tools/shared/validation/helpers/object-paths.ts";
import {
  getMinimalClipInfo,
  type MinimalClipInfo,
} from "../minimal-clip-info.ts";
import { type CopyAttempt } from "./duplicate-one-copy.ts";
import {
  createClipsForLength,
  parseArrangementLength,
} from "./arrangement-length.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

/**
 * Duplicate a clip to the arrangement view
 * @param clipId - Clip ID to duplicate
 * @param arrangementStartBeats - Start position in beats
 * @param destTrackIndex - Track to place the copy on (may differ from the source's)
 * @param name - Optional name for the duplicated clip(s)
 * @param color - Optional color for the duplicated clip(s)
 * @param arrangementLength - Optional length (<count>bar, n<fraction>, or <count>bar+n<fraction>)
 * @param songTimeSigNumerator - Song time signature numerator (resolves arrangementLength bars)
 * @param songTimeSigDenominator - Song time signature denominator (resolves arrangementLength bars)
 * @param context - Context object with silenceWavPath
 * @param sourceClip - The clip, when the caller already resolved it
 * @param tracks - The destination tracks, keyed by index
 * @returns The copy — one clip, or the destination track's path with the tiled
 *   clips under it — or why the destination got none
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
    throw new Error(`id "${clipId}" does not exist`);
  }

  const trackIndex = destTrackIndex ?? clip.trackIndex;

  if (trackIndex == null) {
    throw new Error(`no track for clip ${targetLabel(clip)}`);
  }

  const track =
    tracks.get(trackIndex) ?? LiveAPI.from(livePath.track(trackIndex));
  const duplicatedClips: MinimalClipInfo[] = [];

  if (arrangementLength != null) {
    // Resolve bars against the SONG meter, consistent with every other
    // arrangement-facing surface (create/update clip, read-clip read-back). The
    // clip's own meter governs its internal notation, not its arrangement span.
    const arrangementLengthBeats = parseArrangementLength(
      arrangementLength,
      songTimeSigNumerator,
      songTimeSigDenominator,
    );
    const clipsCreated = await createClipsForLength(
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

    duplicatedClips.push(...clipsCreated);
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
    // clip, matching the guards in arrangement-tiling and update-clip.
    if (newClip.exists()) {
      newClip.setAll({ name, color });
      duplicatedClips.push(getMinimalClipInfo(newClip));
    }
  }

  // Nothing landed: Live declines a duplicate it can't do without raising, and
  // the tiling helpers report what they couldn't place.
  if (duplicatedClips.length === 0) {
    return { refused: "Live made no copy there" };
  }

  // One clip directly, or the track the tiled copies share
  const [single] = duplicatedClips;

  return {
    copy:
      duplicatedClips.length === 1 && single != null
        ? single
        : { path: arrangementPath(trackIndex), clips: duplicatedClips },
  };
}
