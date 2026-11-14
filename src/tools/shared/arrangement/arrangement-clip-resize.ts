// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Resizing an arrangement clip where it stands, looped or not.
 *
 * Live API facts this relies on (probed in Live 12.3.8 and 12.4.6):
 * - An unlooped clip's span follows `loop_end`: span = `loop_end` −
 *   `start_marker`. Unwarped audio counts `loop_end` in seconds, everything else
 *   in beats.
 * - A looped clip's span ignores every property, but survives a toggle: turn
 *   `looping` off, set the unlooped span, turn it back on. Live restores the
 *   loop brace by itself, and the clip keeps its id, notes, warp markers and
 *   envelopes.
 * - Turning `looping` off swaps in Live's remembered unlooped end, so for a
 *   moment the span can be anything. Growth stops at the next clip on the lane
 *   (Live never overlaps one), so the moment can't damage a neighbor.
 * - A looped audio clip is always warped: Live forces `looping` off when warp
 *   goes off, and forces warp back on when `looping` is set.
 */

interface ResizeArrangementClipArgs {
  clip: LiveAPI;
  /** Target span in beats, more than zero. */
  spanBeats: number;
  isAudioClip: boolean;
}

/**
 * Resizes an arrangement clip in place: the same clip, a new span. Lengthening
 * stops at the next clip on the lane, so clear the span first to overwrite it.
 * @param args - Resize arguments
 * @param args.clip - The arrangement clip
 * @param args.spanBeats - Target span in beats
 * @param args.isAudioClip - Whether the clip is audio
 * @returns The span the clip landed at, in beats
 */
export function resizeArrangementClip({
  clip,
  spanBeats,
  isAudioClip,
}: ResizeArrangementClipArgs): number {
  if ((clip.getProperty("looping") as number) > 0) {
    resizeLoopedClip(clip, spanBeats);
  } else {
    setUnloopedSpan(clip, spanBeats, isAudioClip);
  }

  return arrangementSpanOf(clip);
}

/**
 * Sets an unlooped clip's span through `loop_end`, and moves `end_marker` with
 * it, since that's where a read of an unlooped clip says the region ends.
 * @param clip - An unlooped arrangement clip
 * @param spanBeats - Target span in beats
 * @param isAudioClip - Whether the clip is audio
 */
export function setUnloopedSpan(
  clip: LiveAPI,
  spanBeats: number,
  isAudioClip: boolean,
): void {
  const startMarker = clip.getProperty("start_marker") as number;
  const loopStart = clip.getProperty("loop_start") as number;
  const unwarped = isAudioClip && (clip.getProperty("warping") as number) === 0;
  // Unwarped markers are seconds: convert at the clip's own current rate.
  const markerSpan = unwarped
    ? spanBeats / beatsPerMarkerUnit(clip, loopStart)
    : spanBeats;

  clip.set("loop_end", loopStart + markerSpan);
  clip.set("end_marker", startMarker + markerSpan);
}

/**
 * The toggle: unloop, set the span, loop again. The loop brace is written back
 * only if Live didn't restore it.
 * @param clip - A looped arrangement clip
 * @param spanBeats - Target span in beats
 */
function resizeLoopedClip(clip: LiveAPI, spanBeats: number): void {
  const loopStart = clip.getProperty("loop_start") as number;
  const loopEnd = clip.getProperty("loop_end") as number;

  clip.set("looping", 0);

  try {
    // A looped clip is MIDI or warped audio, so the unlooped span is in beats.
    setUnloopedSpan(clip, spanBeats, false);
  } finally {
    // Looped again whatever happened, or a throw leaves the clip unlooped.
    clip.set("looping", 1);
  }

  restoreLoopBrace(clip, loopStart, loopEnd);
}

/**
 * Writes the loop brace back if it moved, in an order that never puts the
 * start past the end.
 * @param clip - The re-looped clip
 * @param loopStart - The loop start it had
 * @param loopEnd - The loop end it had
 */
function restoreLoopBrace(
  clip: LiveAPI,
  loopStart: number,
  loopEnd: number,
): void {
  const nowStart = clip.getProperty("loop_start") as number;
  const nowEnd = clip.getProperty("loop_end") as number;

  if (nowStart === loopStart && nowEnd === loopEnd) {
    return;
  }

  if (loopStart >= nowEnd) {
    clip.set("loop_end", loopEnd);
    clip.set("loop_start", loopStart);
  } else {
    clip.set("loop_start", loopStart);
    clip.set("loop_end", loopEnd);
  }
}

/**
 * Arrangement beats per unit of the clip's markers, from its current span.
 * @param clip - An unlooped arrangement clip
 * @param loopStart - Its loop start
 * @returns Beats per marker unit (seconds, for unwarped audio)
 */
function beatsPerMarkerUnit(clip: LiveAPI, loopStart: number): number {
  const markerSpan = (clip.getProperty("loop_end") as number) - loopStart;

  return arrangementSpanOf(clip) / markerSpan;
}

/**
 * @param clip - An arrangement clip
 * @returns Its span on the timeline, in beats
 */
export function arrangementSpanOf(clip: LiveAPI): number {
  return (
    (clip.getProperty("end_time") as number) -
    (clip.getProperty("start_time") as number)
  );
}
