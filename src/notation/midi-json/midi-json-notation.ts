// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * MIDI JSON notation: a compact array of note objects (musical beats) — close to
 * the raw Live API note interface but shaped for the REST/MCP surface.
 *
 * The serialized form is a JS object-literal (unquoted keys, no inner escaping)
 * with short keys and defaults omitted, e.g.
 * `[{p:60,t:0,d:4,v:100},{p:62,t:1,d:1,v:90,vd:10,c:0.75}]`. Keys: `p` pitch,
 * `t` start, `d` duration, `v` velocity, `vd` velocity-deviation (omitted at 0),
 * `c` probability/chance (omitted at 1). interpret parses via a small Peggy
 * grammar (not eval) into the interpreter's internal `NoteEvent`; format
 * serializes back to the literal. Both are the MIDI JSON counterparts to
 * barbeat's interpret/format seams.
 */

import { applyV0Deletions } from "#src/notation/apply-v0-deletions.ts";
import { NOTE_VALUE_DENOMINATORS } from "#src/notation/barbeat/barbeat-config.ts";
import {
  codeNoteToNoteEvent,
  noteEventToCodeNote,
  validateAndSanitizeNote,
} from "#src/notation/midi-json/midi-json-note.ts";
import {
  type MidiJsonRawNote,
  parse as parseMidiJson,
} from "#src/notation/midi-json/parser/midi-json-parser.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { SAME_TIME_EPSILON } from "#src/shared/config.ts";
import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/max/v8-max-console.ts";

const DEFAULT_DENOMINATOR = 4;

/** Options for the MIDI JSON interpret/format seams. */
export interface MidiJsonOptions {
  /** Clip time-signature denominator (musical-beat scaling). Defaults to 4. */
  timeSigDenominator?: number;
}

/** Options for the interpret seam only. */
export interface MidiJsonInterpretOptions extends MidiJsonOptions {
  /**
   * Keep `v:0` delete markers in the result instead of resolving them against
   * this string's own notes. For update-clip's merge, which resolves them
   * against the existing clip notes too.
   */
  keepV0Deletes?: boolean;
}

/**
 * Parse a MIDI JSON string into note events. The string must be an array of note
 * objects (short or long keys, quoted or bare); each is normalized, validated,
 * and clamped, then scaled from musical beats to Ableton (quarter-note) beats.
 *
 * `v:0` (any velocity <= 0) is a delete marker rather than a note: it removes
 * the note at the same pitch and start (see {@link applyV0Deletions}) and is
 * resolved away before returning, since Live cannot take velocity 0 — unless
 * `keepV0Deletes` defers that to the caller. Unlike bar|beat's inline `v0` it is
 * per-note; nothing in MIDI JSON is sticky.
 *
 * A malformed note is skipped rather than thrown on (matching the update tools'
 * warn-and-keep-going rule), but never silently: {@link warnDroppedNotes}
 * reports the count and reasons so the caller can fix its input.
 *
 * @param input - MIDI JSON array string
 * @param options - Interpretation options
 * @returns Array of note events
 * @throws If the string is not a valid MIDI JSON array
 */
export function interpretMidiJson(
  input: string,
  options: MidiJsonInterpretOptions = {},
): NoteEvent[] {
  if (!input.trim()) {
    return [];
  }

  let parsed: MidiJsonRawNote[];

  try {
    parsed = parseMidiJson(input);
  } catch (error) {
    throw new Error(`Invalid MIDI JSON: ${errorMessage(error)}`, {
      cause: error,
    });
  }

  const timeSigDenominator = options.timeSigDenominator ?? DEFAULT_DENOMINATOR;
  const events: NoteEvent[] = [];
  const dropped: string[] = [];

  for (const raw of parsed) {
    const validated = validateAndSanitizeNote(normalizeMidiJsonNote(raw), {
      allowVelocityZero: true,
    });

    if (validated.valid) {
      events.push(codeNoteToNoteEvent(validated.note, timeSigDenominator));
    } else {
      dropped.push(validated.reason);
    }
  }

  warnDroppedNotes(dropped);

  return options.keepV0Deletes === true ? events : applyV0Deletions(events);
}

// At most this many distinct reasons are named; the rest collapse into a count.
// A model only needs to see what KIND of thing it got wrong, and the warning
// spends the user's context window.
const MAX_REPORTED_REASONS = 3;

/**
 * Warn once about notes dropped during interpretation, naming each distinct
 * reason with its count. Silence here is the failure mode worth avoiding: a
 * dropped note used to leave the tool reporting plain success, so a model that
 * wrote 8 notes and got 7 had nothing to notice, let alone correct.
 *
 * @param reasons - One reason per dropped note, in input order
 */
function warnDroppedNotes(reasons: string[]): void {
  if (reasons.length === 0) {
    return;
  }

  const counts = new Map<string, number>();

  for (const reason of reasons) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }

  // Biggest first. In input order the reason behind most of the drops gets
  // collapsed into "and N more" behind whatever happened to fail first, which
  // steers the model at the wrong mistake.
  const listed = [...counts.entries()]
    .toSorted(([, a], [, b]) => b - a)
    .slice(0, MAX_REPORTED_REASONS)
    .map(([reason, count]) => (count > 1 ? `${reason} (${count})` : reason));

  const hidden = counts.size - listed.length;
  const detail =
    hidden > 0 ? `${listed.join(", ")}, and ${hidden} more` : listed.join(", ");

  console.warn(
    `ignoring ${reasons.length} invalid MIDI JSON ${
      reasons.length === 1 ? "note" : "notes"
    }: ${detail}`,
  );
}

/**
 * Serialize note events into a MIDI JSON string (a JS object-literal array in
 * musical beats). Inverse of {@link interpretMidiJson}: uses short keys, omits
 * `vd`/`c` at their defaults (0/1), and trims floats to at most 4 decimals.
 *
 * @param notes - Note events to serialize
 * @param options - Format options
 * @returns MIDI JSON string, or "" when there are no notes
 */
export function formatMidiJson(
  notes: NoteEvent[],
  options: MidiJsonOptions = {},
): string {
  if (notes.length === 0) {
    return "";
  }

  const timeSigDenominator = options.timeSigDenominator ?? DEFAULT_DENOMINATOR;

  const objects = notes.map((note) => {
    const codeNote = noteEventToCodeNote(note, timeSigDenominator);

    const fields = [
      `p:${codeNote.pitch}`,
      `t:${formatBeats(codeNote.start)}`,
      `d:${formatBeats(codeNote.duration)}`,
      `v:${codeNote.velocity}`,
    ];

    if (codeNote.velocityDeviation !== 0) {
      fields.push(`vd:${codeNote.velocityDeviation}`);
    }

    if (codeNote.probability !== 1) {
      fields.push(`c:${trimFloat(codeNote.probability)}`);
    }

    return `{${fields.join(",")}}`;
  });

  return `[${objects.join(",")}]`;
}

/**
 * Map a raw parsed note (short or long keys) to the CodeNote-shaped object
 * expected by {@link validateAndSanitizeNote}. Short keys win over long keys;
 * both the new `deviation` long key and the legacy `velocityDeviation` are
 * accepted. Missing keys stay undefined so downstream defaulting applies.
 *
 * @param raw - Raw note object from the parser
 * @returns CodeNote-shaped object (values may be undefined)
 */
function normalizeMidiJsonNote(
  raw: MidiJsonRawNote,
): Record<string, number | undefined> {
  return {
    pitch: raw.p ?? raw.pitch,
    start: raw.t ?? raw.start,
    duration: raw.d ?? raw.duration,
    velocity: raw.v ?? raw.velocity,
    velocityDeviation: raw.vd ?? raw.velocityDeviation ?? raw.deviation,
    probability: raw.c ?? raw.probability,
  };
}

/**
 * Format a number with at most 4 decimals, trimming trailing zeros. 4 decimals
 * is 10× under the 0.001 same-time tolerance, so it never introduces
 * round-trip drift collisions.
 *
 * @param value - Number to format
 * @returns Compact string form
 */
function trimFloat(value: number): string {
  return String(Number.parseFloat(value.toFixed(4)));
}

/**
 * Format a timing value (start or duration, in musical beats), preferring an
 * exact `p/q` ratio for tuplets. When the 4-decimal form is already exact (every
 * integer, half, quarter, 0.1, …) it is kept — so ordinary values never change.
 * Only a value whose decimal is LOSSY (a repeating tuplet like 1/3) is spelled
 * as a fraction, and only when a small exact one exists — so a triplet round-trips
 * exactly instead of drifting through `d:0.3333`.
 *
 * @param value - Timing value in musical beats
 * @returns The decimal string, or an exact `p/q` ratio for tuplets
 */
function formatBeats(value: number): string {
  const decimal = trimFloat(value);

  if (Number.parseFloat(decimal) === value) {
    return decimal;
  }

  return findExactRatio(value) ?? decimal;
}

// Candidate denominators {@link findExactRatio} will spell, in two bands scanned
// simplest-first so the reduced fraction wins (a value equal to 1/3 matches den 3
// before 6 or 9). First every denominator 2..16 for dense small-tuplet fidelity —
// including 9/11/13/15, which barbeat's canonical set omits — then the finer
// members of NOTE_VALUE_DENOMINATORS (> 16: 32nd/64th triplets etc.) so those
// round-trip exactly too. Deliberately NOT a dense 2..256 range, which would emit
// spurious high-prime ratios for ordinary lossy decimals.
const SMALL_TUPLET_DENOMINATORS = [
  2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
];
const RATIO_DENOMINATORS = [
  ...SMALL_TUPLET_DENOMINATORS,
  ...NOTE_VALUE_DENOMINATORS.filter((den) => den > 16),
];

/**
 * Find a ratio `p/q` that equals `value` within same-time tolerance, or null if
 * none does. Candidates ({@link RATIO_DENOMINATORS}) cover every denominator
 * 2..16 plus barbeat's finer canonical tuplets (> 16), scanned simplest-first so
 * the reduced fraction wins (1/3 before 6/18) and a device-jittered read-back
 * (e.g. 0.33333334) still snaps to `1/3`. Only reached for values whose 4-decimal
 * form is already lossy, so ordinary values never turn into fractions.
 *
 * @param value - Timing value in musical beats
 * @returns The exact ratio string, or null when no candidate fraction matches
 */
function findExactRatio(value: number): string | null {
  for (const den of RATIO_DENOMINATORS) {
    const num = value * den;

    if (Math.abs(num - Math.round(num)) < SAME_TIME_EPSILON) {
      return `${Math.round(num)}/${den}`;
    }
  }

  return null;
}
