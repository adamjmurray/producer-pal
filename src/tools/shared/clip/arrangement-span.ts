// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { abletonBeatsToDuration } from "#src/notation/barbeat/time/barbeat-time.ts";

const SPAN_EPSILON = 1e-6;

/**
 * How long an arrangement clip sits on the timeline. For a looping clip this is
 * not its `length`, which is the loop's.
 * @param clip - The clip to measure
 * @returns Its span in Ableton beats, or null for a session clip (or an
 *   unreadable one)
 */
export function arrangementSpan(clip: LiveAPI): number | null {
  if (clip.getProperty("is_arrangement_clip") !== 1) {
    return null;
  }

  const start = clip.getProperty("start_time") as number;
  const end = clip.getProperty("end_time") as number;
  const span = end - start;

  return Number.isFinite(span) && span > 0 ? span : null;
}

/**
 * Say so when a re-created arrangement clip didn't keep the source's span. The
 * new clip is read back: Live can't set an audio clip's end, so there the span
 * is whatever the sample gave it.
 * @param newClip - The clip just created, after its properties were written
 * @param sourceSpan - The source's span, or null when it had none to keep
 * @param meter - The source's time signature, to spell lengths in bars
 * @param meter.numerator - Time signature numerator
 * @param meter.denominator - Time signature denominator
 * @param cause - Why the length differs, for the entry
 * @param losses - What the re-create lost, added to
 */
export function noteSpanLoss(
  newClip: LiveAPI,
  sourceSpan: number | null,
  meter: { numerator: number; denominator: number },
  cause: string,
  losses: string[],
): void {
  if (sourceSpan == null) {
    return;
  }

  const landed = landedSpan(newClip);

  if (landed == null || Math.abs(landed - sourceSpan) < SPAN_EPSILON) {
    return;
  }

  const spell = (beats: number): string =>
    abletonBeatsToDuration(beats, meter.numerator, meter.denominator);

  losses.push(`length is ${spell(landed)}, not ${spell(sourceSpan)}: ${cause}`);
}

/**
 * Whether a copy was read back at exactly the source's span. False when it
 * differs or can't be read, so a true answer is always a verified one.
 * @param newClip - The clip just created
 * @param sourceSpan - The source's span, or null when it had none
 * @returns True only when both spans were read and match
 */
export function keptSpan(newClip: LiveAPI, sourceSpan: number | null): boolean {
  const landed = landedSpan(newClip);

  return (
    sourceSpan != null &&
    landed != null &&
    Math.abs(landed - sourceSpan) < SPAN_EPSILON
  );
}

/**
 * Whether a loss is {@link noteSpanLoss}'s, which belongs to one clip's own
 * entry rather than a shared one.
 * @param loss - One entry of a `losses` list
 * @returns True for a changed-length loss
 */
export function isSpanLoss(loss: string): boolean {
  return loss.startsWith("length is ");
}

/**
 * @param clip - A clip just created
 * @returns Its span in beats, or null when Live gave no readable edges
 */
function landedSpan(clip: LiveAPI): number | null {
  const span =
    (clip.getProperty("end_time") as number) -
    (clip.getProperty("start_time") as number);

  return Number.isFinite(span) ? span : null;
}
