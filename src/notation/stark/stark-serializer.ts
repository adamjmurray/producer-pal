// Producer Pal
// Copyright (C) 2025 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Stark serializer: converts NoteEvent[] into a Stark string. Round-trip
 * (interpret → serialize → interpret) is a fixed point on pitch / start_time /
 * duration for any LEGATO line (each note starts where the previous ends — i.e.
 * anything Stark itself produced), modulo velocity bucketing and the off-16th
 * snap. Overlapping notes on one line are normalized to legato exactly as a
 * melody line is, so drums and pitched lines share ONE timing model.
 *
 * Every line is serialized the same way: walk the notes, fill gaps with `z`
 * rests, take each note's own duration as its absolute `/N`, then FACTOR OUT the
 * line default — emit a header `/N` only when it differs from the line-type
 * default and a token `/N` only when it differs from the line default — so the
 * common case reads clean (`kick: X X X X`, `hihat /8: z X z X …`). Drums differ
 * from pitched lines only in the token glyph (`^`/`X`/`x` vs a pitch letter) and
 * the header (a drum name vs melody/bass/chords).
 *
 * The leaf primitives (pitch spelling, velocity glyphs, rest decomposition, line
 * classification) live in stark-serializer-helpers.ts; the line-default
 * FACTORING below is what keeps the read-back clean.
 */

import {
  CHORDS_REGISTER_DEFAULT,
  DRUM_DEFAULT_N,
  LINE_DEFAULT_N,
} from "#src/notation/stark/stark-config.ts";
import {
  classifyPitchedLine,
  drumChar,
  drumHeader,
  dynamicSuffix,
  groupNotesByPitch,
  groupSimultaneousNotes,
  octaveMarks,
  pitchParts,
  restNoteValues,
} from "#src/notation/stark/stark-serializer-helpers.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { SAME_TIME_EPSILON } from "#src/shared/config.ts";

/** Options for {@link formatNotation}. */
export interface StarkFormatOptions {
  /**
   * True when the clip's track has a Drum Rack instrument. It — not the MIDI
   * pitch — decides drum vs. pitched serialization, so a low bass note is not
   * mistaken for a kick.
   */
  drumMode?: boolean;
}

// One serialized token before line-default factoring: the glyph/pitch `core`, an
// optional pitched `dynamic` suffix, and the absolute note value `n` (an /N).
interface LineToken {
  core: string;
  dynamic: string;
  n: number;
}

/**
 * Serialize MIDI note events into a Stark notation string.
 * @param notes - Note events to serialize
 * @param options - Serialization options (notably `drumMode`)
 * @returns Stark string, or "" when there are no serializable notes
 */
export function formatNotation(
  notes: NoteEvent[],
  options: StarkFormatOptions = {},
): string {
  if (notes.length === 0) return "";

  if (options.drumMode) {
    return serializeStarkDrums(notes).join("\n");
  }

  return serializeStarkPitched(notes);
}

// ---- Shared line machinery (drums + pitched) ----

// Walk a monophonic note sequence into hit/rest tokens: legato timing, gaps
// filled with `z` rests. `makeHit` supplies each note's glyph + dynamic; the
// note's own duration becomes its /N (durations round-trip for legato input).
function walkLine(
  notes: NoteEvent[],
  makeHit: (note: NoteEvent) => { core: string; dynamic: string },
): LineToken[] {
  const sorted = [...notes].sort((a, b) => a.start_time - b.start_time);
  const tokens: LineToken[] = [];
  let time = 0;

  for (const note of sorted) {
    if (note.start_time > time + SAME_TIME_EPSILON) {
      tokens.push(...restTokens(note.start_time - time));
    }

    const { core, dynamic } = makeHit(note);

    tokens.push({ core, dynamic, n: durationToN(note.duration) });
    time = note.start_time + note.duration;
  }

  return tokens;
}

// Fill a gap with `z` rest tokens (greedy, largest note value first).
function restTokens(gapBeats: number): LineToken[] {
  return restNoteValues(gapBeats).map((n) => ({ core: "z", dynamic: "", n }));
}

// Absolute note value (/N) nearest a duration in beats: 4b→1 … 0.25b→16.
function durationToN(beats: number): number {
  const n = Math.round(4 / beats);

  if (n <= 1) return 1;
  if (n <= 2) return 2;
  if (n <= 4) return 4;
  if (n <= 8) return 8;

  return 16;
}

// Render one section line, factoring out the line default: a header `/N` only
// when the chosen default differs from the line-type default, and a token `/N`
// only when the token differs from the chosen default.
function renderLine(
  header: string,
  tokens: LineToken[],
  lineTypeDefaultN: number,
): string {
  const lineDefaultN = chooseLineDefaultN(tokens, lineTypeDefaultN);
  const headerDur =
    lineDefaultN === lineTypeDefaultN ? "" : ` /${lineDefaultN}`;
  const body = tokens
    .map((t) => {
      const tokenDur = t.n === lineDefaultN ? "" : `/${t.n}`;

      return `${t.core}${tokenDur}${t.dynamic}`;
    })
    .join(" ");

  return `${header}${headerDur}: ${body}`;
}

// Pick the line default /N: the most common token note value, preferring the
// line-type default on ties (so the header can be omitted) then coarser values.
function chooseLineDefaultN(
  tokens: LineToken[],
  lineTypeDefaultN: number,
): number {
  const counts = new Map<number, number>();

  for (const t of tokens) counts.set(t.n, (counts.get(t.n) ?? 0) + 1);

  let best = lineTypeDefaultN;
  let bestCount = counts.get(lineTypeDefaultN) ?? 0;

  for (const [n, count] of counts) {
    if (isBetterDefault(n, count, best, bestCount, lineTypeDefaultN)) {
      best = n;
      bestCount = count;
    }
  }

  return best;
}

// Tie-break for chooseLineDefaultN: higher count wins; on a tie the line-type
// default wins (lets the header drop), otherwise the coarser value (smaller N).
function isBetterDefault(
  n: number,
  count: number,
  best: number,
  bestCount: number,
  lineTypeDefaultN: number,
): boolean {
  if (count !== bestCount) return count > bestCount;
  if (n === lineTypeDefaultN) return true;
  if (best === lineTypeDefaultN) return false;

  return n < best;
}

// ---- Pitched lines (bass / melody / chords) ----

// Classify the notes, then serialize as a chords line or a mono bass/melody line.
function serializeStarkPitched(notes: NoteEvent[]): string {
  const classified = classifyPitchedLine(notes);

  if (classified.kind === "chords") {
    return serializeStarkChords(classified.sorted);
  }

  const tokens = walkLine(classified.sorted, (note) => ({
    core: pitchCore(note.pitch, classified.registerDefault),
    dynamic: dynamicSuffix(note.velocity),
  }));

  return renderLine(
    classified.lineType,
    tokens,
    LINE_DEFAULT_N[classified.lineType],
  );
}

// Serialize a chords line: one bracket per simultaneous group, gaps as rests.
function serializeStarkChords(sorted: NoteEvent[]): string {
  const tokens: LineToken[] = [];
  let time = 0;

  for (const group of groupSimultaneousNotes(sorted)) {
    // group is non-empty (groupSimultaneousNotes only emits matched groups).
    const rep = group[0] as NoteEvent;

    if (rep.start_time > time + SAME_TIME_EPSILON) {
      tokens.push(...restTokens(rep.start_time - time));
    }

    const inner = group
      .map((note) => pitchCore(note.pitch, CHORDS_REGISTER_DEFAULT))
      .join(" ");

    tokens.push({
      core: `[${inner}]`,
      dynamic: dynamicSuffix(rep.velocity),
      n: durationToN(rep.duration),
    });
    time = rep.start_time + rep.duration;
  }

  return renderLine("chords", tokens, LINE_DEFAULT_N.chords);
}

// Spell one pitch as letter + accidental + octave marks (no duration/dynamic).
function pitchCore(midi: number, registerDefault: number): string {
  const { letter, accidental, octaveShift } = pitchParts(midi, registerDefault);

  return `${letter}${accidental}${octaveMarks(octaveShift)}`;
}

// ---- Drum lines (event-based, one line per pitch) ----

// Serialize drum notes into one factored `<header> [/N]: <tokens>` line per pitch.
function serializeStarkDrums(notes: NoteEvent[]): string[] {
  const lines: string[] = [];

  for (const [pitch, pitchNotes] of groupNotesByPitch(notes)) {
    const tokens = walkLine(pitchNotes, (note) => ({
      core: drumChar(note.velocity),
      dynamic: "",
    }));

    lines.push(renderLine(drumHeader(pitch), tokens, DRUM_DEFAULT_N));
  }

  return lines;
}
