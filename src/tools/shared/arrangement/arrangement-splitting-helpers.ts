// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";
import { revealAudioContentAtPosition } from "#src/tools/shared/arrangement/arrangement-audio-helpers.ts";
import { setClipMarkersWithLoopingWorkaround } from "#src/tools/shared/clip-marker-helpers.ts";
import type { SplittingContext } from "./arrangement-splitting.ts";

/**
 * Create segments for unlooped MIDI clips by duplicating and setting markers.
 * @param sourceClip - Source clip to duplicate from
 * @param track - Track containing the clip
 * @param boundaries - Array of segment boundaries in beats
 * @param clipArrangementStart - Arrangement position of original clip
 * @param clipStartMarker - Start marker of original clip
 * @param warnings - Set to track warnings
 */
export function createUnloopedMidiSegments(
  sourceClip: LiveAPI,
  track: LiveAPI,
  boundaries: number[],
  clipArrangementStart: number,
  clipStartMarker: number,
  warnings: Set<string>,
): void {
  // Skip first segment (handled by shortening original)
  for (let i = 1; i < boundaries.length - 1; i++) {
    const segmentStart = boundaries[i] as number;
    const segmentEnd = boundaries[i + 1] as number;
    const segmentPosition = clipArrangementStart + segmentStart;
    const contentStart = clipStartMarker + segmentStart;
    const contentEnd = clipStartMarker + segmentEnd;

    const duplicateResult = track.call(
      "duplicate_clip_to_arrangement",
      `id ${sourceClip.id}`,
      segmentPosition,
    ) as [string, string | number];
    const segmentClip = LiveAPI.from(duplicateResult);

    if (!segmentClip.exists()) {
      if (!warnings.has("split-duplicate-failed")) {
        console.warn(
          `Failed to duplicate clip for split at ${segmentPosition}, some segments may be missing`,
        );
        warnings.add("split-duplicate-failed");
      }

      continue;
    }

    setClipMarkersWithLoopingWorkaround(segmentClip, {
      startMarker: contentStart,
      endMarker: contentEnd,
    });
  }
}

/**
 * Create segments for unlooped audio clips by revealing content at positions.
 * @param sourceClip - Source clip to duplicate from
 * @param track - Track containing the clip
 * @param boundaries - Array of segment boundaries in beats
 * @param clipArrangementStart - Arrangement position of original clip
 * @param clipStartMarker - Start marker of original clip
 * @param context - Splitting context
 */
export function createUnloopedAudioSegments(
  sourceClip: LiveAPI,
  track: LiveAPI,
  boundaries: number[],
  clipArrangementStart: number,
  clipStartMarker: number,
  context: SplittingContext,
): void {
  // Skip first segment (handled by shortening original)
  for (let i = 1; i < boundaries.length - 1; i++) {
    const segmentStart = boundaries[i] as number;
    const segmentEnd = boundaries[i + 1] as number;
    const segmentPosition = clipArrangementStart + segmentStart;
    const contentStart = clipStartMarker + segmentStart;
    const contentEnd = clipStartMarker + segmentEnd;

    revealAudioContentAtPosition(
      sourceClip,
      track,
      contentStart,
      contentEnd,
      segmentPosition,
      context,
    );
  }
}
