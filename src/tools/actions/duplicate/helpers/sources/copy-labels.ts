// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// The names, colors and arrangement lengths one duplicate call hands out. The
// indices run across every copy the call makes, not across each source's own —
// so "a,b,c,d" over two sources of two copies names them a, b, c, d.

import { getColorForIndex } from "#src/tools/shared/validation/color-parsing.ts";
import { type SongMeter } from "#src/tools/shared/validation/helpers/song-meter.ts";
import { pairLabels } from "#src/tools/shared/validation/lists/labeled-targets.ts";
import { validateListLengths } from "#src/tools/shared/validation/lists/list-lengths.ts";
import { getNameForIndex } from "#src/tools/shared/validation/name-parsing.ts";
import {
  splitList,
  valueForIndex,
} from "#src/tools/shared/validation/lists/list-pairing.ts";
import { parseArrangementLength } from "../clip/arrangement-length.ts";
import { readsArrangementLength } from "../duplicate-destinations.ts";
import { type CopyLabel } from "../call/duplicate-call-types.ts";

/**
 * Pair the call's name, color and arrangementLength lists with its copies, and
 * refuse the call when a list doesn't fit them or a length won't read.
 * @param values - The raw per-copy params
 * @param values.name - The raw name param
 * @param values.color - The raw color param
 * @param values.arrangementLength - The raw arrangementLength param
 * @param count - How many copies the call makes, skipped ones included: a list
 *   pairs with what the caller named, not with what could be made
 * @param lengthMeter - The song meter, when some copy reads arrangementLength.
 *   Without it the length is dropped, so its list can't refuse the call.
 * @returns What each copy is told, by its place in the call
 * @throws Error when a list doesn't match the copies
 */
export function pairCopyLabels(
  {
    name,
    color,
    arrangementLength,
  }: { name?: string; color?: string; arrangementLength?: string },
  count: number,
  lengthMeter: SongMeter | null,
): (index: number) => CopyLabel {
  const length = lengthMeter == null ? undefined : arrangementLength;

  validateListLengths([
    { param: "this call", count, noun: "copy" },
    { param: "name", value: name },
    { param: "color", value: color },
    { param: "arrangementLength", value: length },
  ]);

  const { parsedNames, parsedColors } = pairLabels({
    noun: "copy",
    count,
    name,
    color,
  });
  const lengths = splitList(length, count, "arrangementLength");

  refuseUnreadableLengths(length, lengths, lengthMeter);

  return (index) => ({
    name: getNameForIndex(name, index, parsedNames),
    color: getColorForIndex(color, index, parsedColors),
    length: valueForIndex(length, index, lengths),
  });
}

/**
 * The song meter arrangementLength is read in, when any clip or scene copy in
 * the call lands on the arrangement. It is read up front so every length can be
 * checked, even when a source's own copies go to clip slots.
 * @param type - What is being duplicated
 * @param destination - Where the call's copies go; "arrangement" when any does
 * @param arrangementLength - The raw arrangementLength param
 * @param meter - Reads the song meter, once for the call
 * @returns The song meter, or null when no copy reads a length
 */
export function arrangementLengthMeter(
  type: string,
  destination: string | undefined,
  arrangementLength: string | undefined,
  meter: () => SongMeter,
): SongMeter | null {
  if (!readsArrangementLength(type, destination) || arrangementLength == null) {
    return null;
  }

  return meter();
}

// --- Helpers below main exports ---

/**
 * Refuses the call when any copy's arrangementLength won't parse or isn't
 * positive. Checked per copy instead, a bad entry would strand the copies
 * before it. The song meter matters: "1bar-n/2d" is one beat in 4/4 and none
 * in 3/4.
 * @param length - The raw arrangementLength param, when some copy reads it
 * @param lengths - Its entries, when it is a list
 * @param meter - The song meter, when some copy reads a length
 */
function refuseUnreadableLengths(
  length: string | undefined,
  lengths: string[] | null,
  meter: SongMeter | null,
): void {
  if (meter == null || length == null) {
    return;
  }

  for (const entry of lengths ?? [length]) {
    parseArrangementLength(entry, meter.numerator, meter.denominator);
  }
}
