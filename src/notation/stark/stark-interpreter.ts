// Producer Pal
// Copyright (C) 2025 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Stark notation interpreter: converts a Stark expression into MIDI note events.
 * Stark is a literal, round-trippable notation. Its pitched (bass/melody/chords)
 * lines are identical to abstark's, so this interpreter reuses abstark's
 * `processPitchedSection` / `velocityFor` directly (A/B scaffolding — collapses
 * when abstark is deleted post-eval). Stark's ONLY divergence is drums: they are
 * EVENT-BASED (each token is a hit or rest with a /N duration, like a melody line
 * of drum hits), not abstark's positional 16th-note grid.
 *
 * See parser/stark-grammar.peggy for the syntax.
 */

import { durationBeats } from "#src/notation/abstark/abstark-config.ts";
import {
  processPitchedSection,
  velocityFor,
} from "#src/notation/abstark/abstark-interpreter.ts";
import { dedupeNotesKeepingLast, sortNotes } from "#src/notation/note-sort.ts";
import {
  type DrumSection,
  type StarkSection,
} from "#src/notation/stark/parser/stark-parser.ts";
import * as parser from "#src/notation/stark/parser/stark-parser.ts";
import { DRUM_DEFAULT_N } from "#src/notation/stark/stark-config.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { noteNameToMidi } from "#src/shared/pitch.ts";
import * as console from "#src/shared/v8-max-console.ts";

export interface StarkInterpretOptions {
  /** Time signature numerator (beats per bar). Accepted for parity; unused (timing is explicit). */
  timeSigNumerator?: number;
}

/**
 * Convert a Stark notation string into MIDI note events.
 * @param starkExpression - Stark notation string
 * @param _options - Interpretation options (timeSigNumerator accepted but unused)
 * @returns Array of note events sorted by start_time
 */
export function interpretNotation(
  starkExpression: string,
  _options: StarkInterpretOptions = {},
): NoteEvent[] {
  if (!starkExpression || starkExpression.trim() === "") {
    return [];
  }

  let ast;

  try {
    ast = parser.parse(starkExpression);
  } catch (error) {
    throw new Error(`Stark notation parse error: ${(error as Error).message}`, {
      cause: error,
    });
  }

  // Warn on mixed section types (drums + melody etc in one clip is unusual).
  const sectionKinds = new Set(
    ast.map((s) => ("midi" in s ? "drums" : s.type)),
  );

  if (sectionKinds.size > 1) {
    console.warn(
      `Stark: mixed section types (${[...sectionKinds].join(", ")}) in one clip`,
    );
  }

  const notes: NoteEvent[] = [];

  for (const section of ast) {
    if (isDrumSection(section)) {
      processDrumSection(section, notes);
    } else {
      processPitchedSection(section, notes);
    }
  }

  // Resolve same-pitch+start collisions (can arise from mixed sections).
  const deduped = dedupeNotesKeepingLast(notes);
  const collisions = notes.length - deduped.length;

  if (collisions > 0) {
    console.warn(
      `Stark: ${collisions} same-pitch+start ${collisions === 1 ? "collision" : "collisions"} from mixed sections; keeping last note`,
    );
  }

  return sortNotes(deduped);
}

// Drum sections carry a `midi`/`noteName` header; pitched sections do not.
function isDrumSection(section: StarkSection): section is DrumSection {
  return "midi" in section;
}

// Process an event-based drum section: each token is a hit or rest whose
// duration is its glued /N, else the line default (header /N, else /4). The
// pitch is fixed — the named drum's GM pitch (section.midi) or a pitch-name
// header resolved via pitch.ts (Ableton C3=60).
function processDrumSection(section: DrumSection, notes: NoteEvent[]): void {
  const pitch =
    section.midi ??
    (section.noteName ? noteNameToMidi(section.noteName) : null);

  if (pitch == null) {
    console.warn(
      `Stark: drum line "${section.type}" has no resolvable pitch — skipping`,
    );

    return;
  }

  const lineDefaultN = section.defaultDuration ?? DRUM_DEFAULT_N;

  let time = 0;

  for (const item of section.content) {
    if ("barMarker" in item) continue;

    const beats = durationBeats(item.duration ?? lineDefaultN);

    if (item.type === "rest") {
      time += beats;
      continue;
    }

    notes.push({
      pitch,
      start_time: time,
      duration: beats,
      velocity: velocityFor(item.velocity),
      probability: 1.0,
    });
    time += beats;
  }
}
