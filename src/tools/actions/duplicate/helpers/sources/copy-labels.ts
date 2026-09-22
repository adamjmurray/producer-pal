// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The names and colors one duplicate call hands out. With a list of sources the
// indices run across every copy the call makes, not across each source's own —
// so "a,b,c,d" over two sources of two copies names them a, b, c, d.

import { getColorForIndex } from "#src/tools/shared/validation/color-parsing.ts";
import { labelNewTargets } from "#src/tools/shared/validation/lists/labeled-targets.ts";
import { getNameForIndex } from "#src/tools/shared/validation/name-parsing.ts";
import { type ListEntries } from "#src/tools/shared/validation/lists/list-pairing.ts";

/** The names and colors a call hands out, and where the current source is. */
export interface CopyLabels {
  name: string | undefined;
  color: string | undefined;
  /** Sources this call copies. */
  sources: number;
  /** Copies the whole call asks for, once a source has reported its share. */
  total: number | null;
  names: ListEntries | null;
  colors: ListEntries | null;
  /** Where the current source's copies start in the call's copy list. */
  offset: number;
}

/**
 * The label pool for one duplicate call, before any source has claimed a share.
 * @param name - The raw name param
 * @param color - The raw color param
 * @param sources - How many sources the call copies
 * @returns The pool
 */
export function copyLabels(
  name: string | undefined,
  color: string | undefined,
  sources: number,
): CopyLabels {
  return {
    name,
    color,
    sources,
    total: null,
    names: null,
    colors: null,
    offset: 0,
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
  });

  labels.names = parsedNames;
  labels.colors = parsedColors;
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
