// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  abletonBeatsToBarBeat,
  barBeatToAbletonBeats,
  validateBarBeatPosition,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import { resolveLocatorRefToBeats } from "./locator-helpers.ts";

// The published prefix and its undocumented spelling, longest first so
// "locator:" isn't read as "loc:" plus a stray "ator:". Matched
// case-insensitively: a model that writes "LOC:" made a well-founded guess, and
// a locator actually named "Loc:something" is not a thing anyone has.
const LOCATOR_PREFIXES = ["locator:", "loc:"];

/** How a song position names itself in errors. */
export interface SongPositionLabels {
  toolName: string;
  /** The param the value came from. */
  paramName: string;
}

/** {@link SongPositionLabels} plus the meter a bar|beat is read in. */
export interface SongPositionOptions extends SongPositionLabels {
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

/**
 * Rewrite every `loc:` entry in a comma-separated song-position list as the
 * bar|beat it names, so everything downstream sees one spelling and needs no
 * Live Set of its own. A bar|beat entry passes through byte for byte, keeping
 * its own format errors and any `±n` offset exactly as the caller wrote it.
 *
 * The song meter is read here rather than passed in, and only when the list
 * actually names a locator — a call with none costs nothing.
 *
 * A locator name containing a comma can't be spelled here, since the list
 * splits on commas first. The `[...]` coordinate is where such a name gets
 * said.
 * @param liveSet - The live_set LiveAPI object, for the meter and the lookups
 * @param value - The position list as the caller wrote it
 * @param labels - How to name this in errors
 * @returns The list with every locator resolved to a bar|beat
 */
export function resolveLocatorPositions(
  liveSet: LiveAPI,
  value: string,
  labels: SongPositionLabels,
): string {
  const entries = value.split(",");

  if (!entries.some((entry) => locatorRef(entry.trim()) != null)) return value;

  const options: SongPositionOptions = {
    ...labels,
    timeSigNumerator: liveSet.getProperty("signature_numerator") as number,
    timeSigDenominator: liveSet.getProperty("signature_denominator") as number,
  };

  return entries
    .map((entry) => {
      const trimmed = entry.trim();

      if (locatorRef(trimmed) == null) return entry;

      return abletonBeatsToBarBeat(
        songPositionToBeats(liveSet, trimmed, options),
        options.timeSigNumerator,
        options.timeSigDenominator,
      );
    })
    .join(",");
}
