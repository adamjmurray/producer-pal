// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  barBeatToAbletonBeats,
  validateBarBeatPosition,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import { resolveLocatorRefToBeats } from "./locator-helpers.ts";

// The published prefix and its undocumented spelling, longest first so
// "locator:" isn't read as "loc:" plus a stray "ator:". Matched
// case-insensitively: a model that writes "LOC:" made a well-founded guess, and
// a locator actually named "Loc:something" is not a thing anyone has.
const LOCATOR_PREFIXES = ["locator:", "loc:"];

/** How a song position names itself in errors, and what meter it's read in. */
export interface SongPositionOptions {
  toolName: string;
  /** The param the value came from. */
  paramName: string;
  timeSigNumerator: number;
  timeSigDenominator: number;
}

/**
 * The locator a song position names, or undefined for a bar|beat.
 *
 * The prefix is required, never sniffed: resolving a bare "Verse" by name
 * because it doesn't look like bar|beat would turn a locator named "5|1", or a
 * typo'd bar|beat, into a silent name lookup.
 * @param value - A song-timeline position as the caller wrote it
 * @returns The locator id or name, or undefined when this is a bar|beat
 */
export function locatorRef(value: string): string | undefined {
  const lowered = value.toLowerCase();
  const prefix = LOCATOR_PREFIXES.find((candidate) =>
    lowered.startsWith(candidate),
  );

  return prefix == null ? undefined : value.slice(prefix.length).trim();
}

/**
 * A point on the song timeline, in Ableton beats. One spelling covers both:
 * a bar|beat position in the song meter, or `loc:<name>` naming a locator.
 * @param liveSet - The live_set LiveAPI object, for the locator lookup
 * @param value - The position as the caller wrote it
 * @param options - Meter to read bar|beat in, and how to name this in errors
 * @returns The position in Ableton beats
 */
export function songPositionToBeats(
  liveSet: LiveAPI,
  value: string,
  options: SongPositionOptions,
): number {
  const { toolName, paramName, timeSigNumerator, timeSigDenominator } = options;
  const locator = locatorRef(value);

  if (locator == null) {
    validateBarBeatPosition(value);

    return barBeatToAbletonBeats(value, timeSigNumerator, timeSigDenominator);
  }

  if (locator === "") {
    throw new Error(
      `${toolName} failed: ${paramName} "${value}" names no locator`,
    );
  }

  return resolveLocatorRefToBeats(
    liveSet,
    locator,
    toolName,
    `for ${paramName}`,
  );
}
