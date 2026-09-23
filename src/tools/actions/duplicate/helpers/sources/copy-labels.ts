// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The names, colors and arrangement lengths one duplicate call hands out. With
// a list of sources the indices run across every copy the call makes, not
// across each source's own — so "a,b,c,d" over two sources of two copies names
// them a, b, c, d.

import { getColorForIndex } from "#src/tools/shared/validation/color-parsing.ts";
import {
  songMeter,
  type SongMeter,
} from "#src/tools/shared/validation/helpers/song-meter.ts";
import { labelNewTargets } from "#src/tools/shared/validation/lists/labeled-targets.ts";
import { getNameForIndex } from "#src/tools/shared/validation/name-parsing.ts";
import {
  type ListEntries,
  splitList,
  valueForIndex,
} from "#src/tools/shared/validation/lists/list-pairing.ts";
import { parseArrangementLength } from "../clip/arrangement-length.ts";

/** The per-copy values a call hands out, and where the current source is. */
export interface CopyLabels {
  name: string | undefined;
  color: string | undefined;
  arrangementLength: string | undefined;
  /** Sources this call copies. */
  sources: number;
  /** Copies the whole call asks for, once a source has reported its share. */
  total: number | null;
  names: ListEntries | null;
  colors: ListEntries | null;
  lengths: ListEntries | null;
  /** Where the current source's copies start in the call's copy list. */
  offset: number;
  /** The song meter, when some copy lands on the arrangement and reads a length. */
  lengthMeter: SongMeter | null;
}

/**
 * The label pool for one duplicate call, before any source has claimed a share.
 * @param values - The raw per-copy params
 * @param values.name - The raw name param
 * @param values.color - The raw color param
 * @param values.arrangementLength - The raw arrangementLength param
 * @param sources - How many sources the call copies
 * @param lengthMeter - The song meter, when some copy reads arrangementLength
 * @returns The pool
 */
export function copyLabels(
  {
    name,
    color,
    arrangementLength,
  }: { name?: string; color?: string; arrangementLength?: string },
  sources: number,
  lengthMeter: SongMeter | null = null,
): CopyLabels {
  return {
    name,
    color,
    arrangementLength,
    sources,
    total: null,
    names: null,
    colors: null,
    lengths: null,
    offset: 0,
    lengthMeter,
  };
}

/**
 * Claims this source's share of the labels. Copies are the same for every
 * source, so the first to report settles the batch total — and it must settle
 * before any name is handed out: it decides whether one value splits into many.
 * @param labels - The call's label pool
 * @param copies - Copies this source asks for
 */
export function claimLabels(labels: CopyLabels, copies: number): void {
  if (labels.total != null) {
    labels.offset += copies;

    return;
  }

  labels.total = labels.sources * copies;

  // The first source settles the total, and nothing has been copied yet, so a
  // name list that doesn't match the copies is still refusable up front.
  const { parsedNames, parsedColors } = labelNewTargets({
    noun: "copy",
    param: "this call",
    count: labels.total,
    name: labels.name,
    color: labels.color,
    extraLists: [
      { param: "arrangementLength", value: labels.arrangementLength },
    ],
  });

  labels.names = parsedNames;
  labels.colors = parsedColors;
  labels.lengths = splitList(
    labels.arrangementLength,
    labels.total,
    "arrangementLength",
  );
  refuseUnreadableLengths(labels);
}

/**
 * The song meter arrangementLength is read in, when any clip or scene copy in
 * the call lands on the arrangement. It is read up front so the first source's
 * claim can check every length, even when that source's own copies go to clip
 * slots.
 * @param type - What is being duplicated
 * @param destination - Where the call's copies go; "arrangement" when any does
 * @param arrangementLength - The raw arrangementLength param
 * @returns The song meter, or null when no copy reads a length
 */
export function arrangementLengthMeter(
  type: string,
  destination: string | undefined,
  arrangementLength: string | undefined,
): SongMeter | null {
  if (
    (type !== "clip" && type !== "scene") ||
    destination !== "arrangement" ||
    arrangementLength == null
  ) {
    return null;
  }

  return songMeter();
}

/**
 * The name for one copy of the source whose turn it is.
 * @param labels - The call's label pool
 * @param index - The copy's place in this source's requested copies
 * @returns The name, or undefined when the call named nothing for it
 */
export function labelName(
  labels: CopyLabels,
  index: number,
): string | undefined {
  return getNameForIndex(labels.name, labels.offset + index, labels.names);
}

/**
 * The color for one copy of the source whose turn it is.
 * @param labels - The call's label pool
 * @param index - The copy's place in this source's requested copies
 * @returns The color, or undefined when the call named none
 */
export function labelColor(
  labels: CopyLabels,
  index: number,
): string | undefined {
  return getColorForIndex(labels.color, labels.offset + index, labels.colors);
}

/**
 * The arrangement length for one copy of the source whose turn it is.
 * @param labels - The call's label pool
 * @param index - The copy's place in this source's requested copies
 * @returns The length, or undefined when the call named none
 */
export function labelLength(
  labels: CopyLabels,
  index: number,
): string | undefined {
  return valueForIndex(
    labels.arrangementLength,
    labels.offset + index,
    labels.lengths,
  );
}

/**
 * Refuses the call when any copy's arrangementLength won't parse or isn't
 * positive. Checked per copy instead, a bad entry would strand the copies
 * before it. The song meter matters: "1bar-n/2d" is one beat in 4/4 and none
 * in 3/4.
 * @param labels - The call's label pool, just claimed
 */
function refuseUnreadableLengths(labels: CopyLabels): void {
  const meter = labels.lengthMeter;

  if (meter == null || labels.arrangementLength == null) {
    return;
  }

  for (const length of labels.lengths ?? [labels.arrangementLength]) {
    parseArrangementLength(length, meter.numerator, meter.denominator);
  }
}
