// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Live reports a scale's intervals only once set; a clip not yet made needs these.

import { scaleIntervalsToPitchClassMask } from "#src/shared/pitch.ts";
import { type VALID_SCALE_NAMES } from "#src/tools/constants.ts";
import { type ParsedScale } from "./scale-parsing.ts";

export const SCALE_INTERVALS: Record<
  (typeof VALID_SCALE_NAMES)[number],
  readonly number[]
> = {
  Major: [0, 2, 4, 5, 7, 9, 11],
  Minor: [0, 2, 3, 5, 7, 8, 10],
  Dorian: [0, 2, 3, 5, 7, 9, 10],
  Mixolydian: [0, 2, 4, 5, 7, 9, 10],
  Lydian: [0, 2, 4, 6, 7, 9, 11],
  Phrygian: [0, 1, 3, 5, 7, 8, 10],
  Locrian: [0, 1, 3, 5, 6, 8, 10],
  "Whole Tone": [0, 2, 4, 6, 8, 10],
  "Half-whole Dim.": [0, 1, 3, 4, 6, 7, 9, 10],
  "Whole-half Dim.": [0, 2, 3, 5, 6, 8, 9, 11],
  "Minor Blues": [0, 3, 5, 6, 7, 10],
  "Minor Pentatonic": [0, 3, 5, 7, 10],
  "Major Pentatonic": [0, 2, 4, 7, 9],
  "Harmonic Minor": [0, 2, 3, 5, 7, 8, 11],
  "Harmonic Major": [0, 2, 4, 5, 7, 8, 11],
  "Dorian #4": [0, 2, 3, 6, 7, 9, 10],
  "Phrygian Dominant": [0, 1, 4, 5, 7, 8, 10],
  "Melodic Minor": [0, 2, 3, 5, 7, 9, 11],
  "Lydian Augmented": [0, 2, 4, 6, 8, 9, 11],
  "Lydian Dominant": [0, 2, 4, 6, 7, 9, 10],
  "Super Locrian": [0, 1, 3, 4, 6, 8, 10],
  "8-Tone Spanish": [0, 1, 3, 4, 5, 6, 8, 10],
  Bhairav: [0, 1, 4, 5, 7, 8, 11],
  "Hungarian Minor": [0, 2, 3, 6, 7, 8, 11],
  Hirajoshi: [0, 2, 3, 7, 8],
  "In-Sen": [0, 1, 5, 7, 10],
  Iwato: [0, 1, 5, 6, 10],
  Kumoi: [0, 2, 3, 7, 9],
  "Pelog Selisir": [0, 1, 3, 7, 8],
  "Pelog Tembung": [0, 1, 5, 7, 8],
  "Messiaen 3": [0, 2, 3, 4, 6, 7, 8, 10, 11],
  "Messiaen 4": [0, 1, 2, 5, 6, 7, 8, 11],
  "Messiaen 5": [0, 1, 5, 6, 7, 11],
  "Messiaen 6": [0, 2, 4, 5, 6, 8, 10, 11],
  "Messiaen 7": [0, 1, 2, 3, 5, 6, 7, 8, 9, 11],
};

/**
 * The pitch class mask of a scale that isn't on a clip yet.
 * @param parsed - The scale, already read by parseScale
 * @returns The mask
 */
export function scaleIntervalsMask(parsed: ParsedScale): number {
  const intervals =
    SCALE_INTERVALS[parsed.scaleName as keyof typeof SCALE_INTERVALS];

  return scaleIntervalsToPitchClassMask([...intervals], parsed.scaleRootNumber);
}
