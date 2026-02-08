// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";
import { createAudioClipInSession } from "#src/tools/shared/arrangement/arrangement-tiling.ts";
import { setClipMarkersWithLoopingWorkaround } from "#src/tools/shared/clip-marker-helpers.ts";

/**
 * Reveals hidden content in an unwarped audio clip using session holding area technique.
 * Creates a temp warped/looped clip, sets markers, then restores unwarp/unloop state.
 * ONLY used for unlooped + unwarped + audio clips with hidden content.
 * @param sourceClip - The source clip to get audio file from
 * @param track - The track to work with
 * @param newStartMarker - Start marker for revealed content
 * @param newEndMarker - End marker for revealed content
 * @param targetPosition - Where to place revealed clip in arrangement
 * @param _context - Context object with paths (unused)
 * @returns The revealed clip in arrangement
 */
function revealUnwarpedAudioContent(
  sourceClip: LiveAPI,
  track: LiveAPI,
  newStartMarker: number,
  newEndMarker: number,
  targetPosition: number,
  _context: Partial<ToolContext>,
): LiveAPI {
  const filePath = sourceClip.getProperty("file_path") as string;

  console.warn(
    `Extending unwarped audio clip requires recreating the extended portion due to Live API limitations. Envelopes will be lost in the revealed section.`,
  );

  // Create temp clip in session holding area; length=newEndMarker to include all content
  const { clip: tempClip, slot: tempSlot } = createAudioClipInSession(
    track,
    newEndMarker,
    filePath,
  );

  // Set markers in BEATS while warped and looped
  tempClip.set("loop_end", newEndMarker);
  tempClip.set("loop_start", newStartMarker);
  tempClip.set("end_marker", newEndMarker);
  tempClip.set("start_marker", newStartMarker);

  // Duplicate to arrangement WHILE STILL WARPED (preserves markers)
  const result = track.call(
    "duplicate_clip_to_arrangement",
    `id ${tempClip.id}`,
    targetPosition,
  ) as string;
  const revealedClip = LiveAPI.from(result);

  // Unwarp and unloop the ARRANGEMENT clip (markers auto-convert to seconds)
  revealedClip.set("warping", 0);
  revealedClip.set("looping", 0);

  // Shorten the clip to only show the revealed portion (if needed)
  const revealedClipEndTime = revealedClip.getProperty("end_time") as number;
  const targetLengthBeats = newEndMarker - newStartMarker;
  const expectedEndTime = targetPosition + targetLengthBeats;
  const EPSILON = 0.001;

  // Only shorten if the revealed clip is longer than expected
  // (placing a shortener at the exact boundary would damage adjacent clips)
  if (revealedClipEndTime > expectedEndTime + EPSILON) {
    const { clip: tempShortenerClip, slot: tempShortenerSlot } =
      createAudioClipInSession(
        track,
        targetLengthBeats,
        sourceClip.getProperty("file_path") as string,
      );

    const tempShortenerResult = track.call(
      "duplicate_clip_to_arrangement",
      `id ${tempShortenerClip.id}`,
      revealedClipEndTime,
    ) as string;

    const tempShortener = LiveAPI.from(tempShortenerResult);

    tempShortenerSlot.call("delete_clip");
    track.call("delete_clip", `id ${tempShortener.id}`);
  }

  tempSlot.call("delete_clip");

  return revealedClip;
}

/**
 * Reveals audio content at a target position with specific markers.
 * Handles both warped (looping workaround) and unwarped (session holding area) clips.
 * @param sourceClip - The source clip to duplicate from
 * @param track - The track to work with
 * @param newStartMarker - Start marker for revealed content
 * @param newEndMarker - End marker for revealed content
 * @param targetPosition - Where to place revealed clip in arrangement
 * @param _context - Context object
 * @returns The revealed clip in arrangement
 */
export function revealAudioContentAtPosition(
  sourceClip: LiveAPI,
  track: LiveAPI,
  newStartMarker: number,
  newEndMarker: number,
  targetPosition: number,
  _context: Partial<ToolContext>,
): LiveAPI {
  const isWarped = sourceClip.getProperty("warping") === 1;

  if (isWarped) {
    // Warped: duplicate and use looping workaround
    const duplicateResult = track.call(
      "duplicate_clip_to_arrangement",
      `id ${sourceClip.id}`,
      targetPosition,
    ) as string;
    const revealedClip = LiveAPI.from(duplicateResult);

    // Verify duplicate succeeded before proceeding
    if (!revealedClip.exists()) {
      throw new Error(
        `Failed to duplicate clip ${sourceClip.id} for audio content reveal`,
      );
    }

    setClipMarkersWithLoopingWorkaround(revealedClip, {
      loopStart: newStartMarker,
      loopEnd: newEndMarker,
      startMarker: newStartMarker,
      endMarker: newEndMarker,
    });

    return revealedClip;
  }

  // Unwarped: use session holding area workaround
  return revealUnwarpedAudioContent(
    sourceClip,
    track,
    newStartMarker,
    newEndMarker,
    targetPosition,
    _context,
  );
}
