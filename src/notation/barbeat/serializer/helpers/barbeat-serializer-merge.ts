// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type NoteEvent } from "#src/notation/types.ts";
import {
  DEFAULT_PROBABILITY,
  DEFAULT_VELOCITY_DEVIATION,
} from "../../barbeat-config.ts";
import { type TimeGroup } from "./barbeat-serializer-grouping.ts";

/** A batch of time groups that can be merged with comma notation */
export interface MergeBatch {
  groups: TimeGroup[];
}

/**
 * Find batches of time groups that can be comma-merged.
 * Within each bar, groups with identical pitch sets and per-note state
 * are merged (even if non-consecutive), ordered by first occurrence.
 * Cross-bar groups are never merged (syntax requires same bar number).
 * @param groups - Time groups in chronological order
 * @returns Array of merge batches (each with 1+ groups)
 */
export function findMergeBatches(groups: TimeGroup[]): MergeBatch[] {
  const batches: MergeBatch[] = [];
  const merged = new Set<number>();

  for (let i = 0; i < groups.length; i++) {
    if (merged.has(i)) continue;

    const current = groups[i] as TimeGroup;
    const batch: MergeBatch = { groups: [current] };

    merged.add(i);

    // Look ahead for matching groups in the same bar
    for (let j = i + 1; j < groups.length; j++) {
      if (merged.has(j)) continue;

      const candidate = groups[j] as TimeGroup;

      // Stop looking once we're past this bar
      if (candidate.bar !== current.bar) break;

      if (groupsMatch(current, candidate)) {
        batch.groups.push(candidate);
        merged.add(j);
      }
    }

    batches.push(batch);
  }

  return batches;
}

/**
 * Check if two time groups have identical pitch sets and per-note state
 * @param a - First time group
 * @param b - Second time group
 * @returns True if groups can be merged
 */
function groupsMatch(a: TimeGroup, b: TimeGroup): boolean {
  if (a.notes.length !== b.notes.length) return false;

  for (let i = 0; i < a.notes.length; i++) {
    const noteA = a.notes[i] as NoteEvent;
    const noteB = b.notes[i] as NoteEvent;

    if (!notesMatch(noteA, noteB)) return false;
  }

  return true;
}

/**
 * Check if two notes have the same pitch and state (ignoring start_time)
 * @param a - First note
 * @param b - Second note
 * @returns True if pitch and all state values match
 */
function notesMatch(a: NoteEvent, b: NoteEvent): boolean {
  return (
    a.pitch === b.pitch &&
    Math.round(a.velocity) === Math.round(b.velocity) &&
    Math.abs(a.duration - b.duration) <= 0.001 &&
    Math.abs(
      (a.probability ?? DEFAULT_PROBABILITY) -
        (b.probability ?? DEFAULT_PROBABILITY),
    ) <= 0.001 &&
    Math.round(a.velocity_deviation ?? DEFAULT_VELOCITY_DEVIATION) ===
      Math.round(b.velocity_deviation ?? DEFAULT_VELOCITY_DEVIATION)
  );
}
