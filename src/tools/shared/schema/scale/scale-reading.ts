// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  CHROMATIC_SCALE_MASK,
  intervalsToPitchClasses,
  PITCH_CLASS_NAMES,
  scaleIntervalsToPitchClassMask,
} from "#src/shared/pitch.ts";

/** What the Live Set or a clip holds for its scale. */
export interface ScaleState {
  /** Whether the scale is switched on; the root and name are kept when off */
  enabled: boolean;
  /** The root's pitch class, 0-11 */
  rootNote: number;
  name: string;
}

/**
 * Read the scale of the Live Set or a clip.
 * @param api - The live_set, or a clip on Live 12.4.15 or later
 * @returns Whether it is on, and its root and name
 */
export function readScaleState(api: LiveAPI): ScaleState {
  return {
    enabled: (api.getProperty("scale_mode") as number) > 0,
    rootNote: api.getProperty("root_note") as number,
    name: String(api.getProperty("scale_name")),
  };
}

/**
 * A scale as a read shows it.
 * @param state - The scale
 * @returns "Root Name", like "C Major" (Live spells its roots with flats)
 */
export function formatScale(
  state: Pick<ScaleState, "rootNote" | "name">,
): string {
  return `${String(PITCH_CLASS_NAMES[state.rootNote])} ${state.name}`;
}

/**
 * The pitch classes of an object's scale, as a read shows them.
 * @param api - The live_set or clip, with its scale on
 * @param rootNote - Its root pitch class
 * @returns Comma-separated note names, like "C,D,E,F,G,A,B"
 */
export function readScalePitches(api: LiveAPI, rootNote: number): string {
  const intervals = api.getProperty("scale_intervals") as number[];

  return intervalsToPitchClasses(intervals, rootNote).join(",");
}

/**
 * The pitch class mask of an object's scale, for the `scale:mask` transform
 * variable.
 * @param api - The live_set or clip, with its scale on
 * @param rootNote - Its root pitch class
 * @returns The mask, or undefined for a chromatic scale (a mask that keeps
 *   every note changes nothing, so it is skipped)
 */
export function readScaleMask(
  api: LiveAPI,
  rootNote: number,
): number | undefined {
  const intervals = api.getProperty("scale_intervals") as number[];
  const mask = scaleIntervalsToPitchClassMask(intervals, rootNote);

  return mask === CHROMATIC_SCALE_MASK ? undefined : mask;
}
