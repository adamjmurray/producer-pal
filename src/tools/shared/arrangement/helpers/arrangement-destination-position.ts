// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Rewriting the `loc:` inside a destination coordinate as the bar|beat it
// names, so nothing downstream needs a Live Set of its own. One position at a
// time rather than a comma-separated list: a locator name may hold a comma, and
// the coordinate is the one place it can be spelled.

import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  locatorRef,
  songPositionToBeats,
  type SongPositionLabels,
} from "#src/tools/shared/locator/song-position.ts";
import { type ClipDestinationPath } from "#src/tools/shared/validation/helpers/clip-destination-path.ts";

/**
 * Resolves every locator a destination list names. A list with none costs no
 * Live API call at all. A null entry — one the caller already gave up on —
 * keeps its place untouched.
 * @param entries - The parsed destinations, in order
 * @param labels - How to name the position in its own errors
 * @returns The destinations, with every locator spelled as bar|beat
 */
export function resolveDestinationPositions<
  T extends ClipDestinationPath | null,
>(entries: T[], labels: SongPositionLabels): T[] {
  const resolve = destinationPositionResolver(entries, labels);

  return resolve == null ? entries : entries.map(resolve);
}

/**
 * The same rewrite one entry at a time, so a caller can catch each lookup on
 * its own. The Live Set is read once, and only when a locator is named.
 * @param entries - The parsed destinations, in order
 * @param labels - How to name the position in its own errors
 * @returns A rewrite for one entry, or null when the list names no locator
 */
export function destinationPositionResolver<
  T extends ClipDestinationPath | null,
>(entries: T[], labels: SongPositionLabels): ((entry: T) => T) | null {
  if (!entries.some((entry) => namesLocator(entry))) {
    return null;
  }

  const liveSet = LiveAPI.from(livePath.liveSet);
  const options = {
    ...labels,
    timeSigNumerator: liveSet.getProperty("signature_numerator") as number,
    timeSigDenominator: liveSet.getProperty("signature_denominator") as number,
  };

  return (entry) =>
    namesLocator(entry)
      ? {
          ...entry,
          position: abletonBeatsToBarBeat(
            songPositionToBeats(liveSet, entry?.position as string, options),
            options.timeSigNumerator,
            options.timeSigDenominator,
          ),
        }
      : entry;
}

// --- Helpers below main exports ---

/**
 * Whether an entry's coordinate names a locator rather than a bar|beat.
 * @param entry - One parsed destination
 * @returns True when it needs a lookup
 */
function namesLocator(entry: ClipDestinationPath | null): boolean {
  return entry?.position != null && locatorRef(entry.position) != null;
}
