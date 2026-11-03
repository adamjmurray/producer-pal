// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { SAME_TIME_EPSILON } from "#src/shared/config.ts";

/** A session clip's markers, in beats. */
export interface ClipMarkers {
  looping: boolean;
  loopStart: number;
  loopEnd: number;
  startMarker: number;
}

/** A stretch of clip content, and where in the copy it plays. */
export interface ContentSegment {
  /** Content start, in clip beats */
  from: number;
  /** Content end, in clip beats */
  to: number;
  /** Beats into the copy where it plays */
  at: number;
}

/**
 * The content playback goes through over `lengthBeats` of arrangement. A looped
 * clip plays from its start marker to the loop end (the pre-roll included),
 * then wraps to the loop start for the rest. An unlooped clip plays on from its
 * start marker. Lengthening tiles carry the same loop phase, so a longer copy
 * reads as one long looped clip.
 * @param markers - The clip's markers
 * @param lengthBeats - How long the copy plays
 * @yields The stretches in playing order, each cut so none passes the length.
 *   Made one at a time, so a very long length costs no memory up front.
 */
export function* contentSegments(
  markers: ClipMarkers,
  lengthBeats: number,
): Generator<ContentSegment, void> {
  const { looping, loopStart, loopEnd, startMarker } = markers;

  if (!looping) {
    yield { from: startMarker, to: startMarker + lengthBeats, at: 0 };

    return;
  }

  const loopLength = loopEnd - loopStart;

  // No loop to wrap around: there is nothing playback could repeat.
  if (loopLength <= SAME_TIME_EPSILON) {
    return;
  }

  let at = 0;

  // The first pass starts at the start marker; every later one at the loop
  // start. A start marker at or past the loop end leaves nothing of the first.
  for (let first = true; lengthBeats - at > SAME_TIME_EPSILON; first = false) {
    const from = first ? startMarker : loopStart;
    const length = Math.min(loopEnd - from, lengthBeats - at);

    if (length > SAME_TIME_EPSILON) {
      const segment = {
        from,
        to: length === loopEnd - from ? loopEnd : from + length,
        at,
      };

      at += length;
      yield segment;
    }
  }
}
