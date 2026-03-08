// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type NoteEvent } from "#src/notation/types.ts";
import { formatDrumNotation } from "./helpers/barbeat-serializer-drum.ts";
import { formatBeatPosition } from "./helpers/barbeat-serializer-fractions.ts";
import {
  type FormatOptions,
  groupNotesByTime,
  resolveFormatConfig,
  sortNotes,
} from "./helpers/barbeat-serializer-grouping.ts";
import { findMergeBatches } from "./helpers/barbeat-serializer-merge.ts";
import {
  createInitialState,
  formatGroupNotes,
} from "./helpers/barbeat-serializer-state.ts";

export type { FormatOptions };

/**
 * Convert Live clip notes to compact bar|beat notation string.
 * Groups notes by start time, emits minimal state changes, and uses
 * comma merging for repeated pitch groups at different beats.
 * @param clipNotes - Array of note objects from the Live API
 * @param options - Formatting options (time signature, beats per bar)
 * @returns Compact bar|beat representation
 */
export function formatNotation(
  clipNotes: NoteEvent[] | null | undefined,
  options: FormatOptions = {},
): string {
  if (!clipNotes || clipNotes.length === 0) {
    return "";
  }

  const config = resolveFormatConfig(options);
  const sortedNotes = sortNotes(clipNotes);

  if (options.drumMode) {
    return formatDrumNotation(sortedNotes, config);
  }

  const timeGroups = groupNotesByTime(sortedNotes, config);
  const batches = findMergeBatches(timeGroups);
  const state = createInitialState();
  const elements: string[] = [];

  for (const batch of batches) {
    // Use the first group's notes for state changes and pitch names
    // Every batch has at least one group
    const firstGroup = batch.groups[0] as (typeof batch.groups)[0];
    const noteElements = formatGroupNotes(
      firstGroup,
      state,
      config.timeSigDenominator,
    );

    elements.push(...noteElements);

    // Emit time position(s) — comma-separated beats for merged groups
    const bar = firstGroup.bar;
    const beats = batch.groups.map((g) => formatBeatPosition(g.beat)).join(",");

    elements.push(`${bar}|${beats}`);
  }

  return elements.join(" ");
}
