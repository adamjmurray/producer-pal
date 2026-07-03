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
 * A duration that isn't one of the ten grid note values (an eighth-note triplet
 * = 1/3 beat, a sample-derived 2.3-beat sustain — content Stark can't itself
 * produce) snaps its OWN sustain to the nearest grid value, but its onset and
 * every following onset are preserved: the walk advances by emitted grid-time, so
 * any shortfall is filled with a compensating rest rather than shifting the line.
 * (Dotted values ARE on the grid now — a dotted quarter round-trips exactly.)
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
  DRUM_DEFAULT,
  LINE_DEFAULT,
} from "#src/notation/stark/stark-config.ts";
import {
  classifyPitchedLine,
  type DurationGridEntry,
  drumChar,
  drumHeader,
  durationEntry,
  dynamicSuffix,
  groupNotesByPitch,
  groupSimultaneousNotes,
  octaveMarks,
  pitchParts,
  restNoteValues,
  snapDuration,
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
// optional pitched `dynamic` suffix, and the grid note value (its beats + `/N[.]`
// token) — beats is the duration identity the line-default factoring keys on.
interface LineToken {
  core: string;
  dynamic: string;
  duration: DurationGridEntry;
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
//
// The cursor tracks EMITTED (grid-snapped) time, not real time. A note whose
// real duration isn't a grid value (e.g. an eighth-note triplet = 1/3 beat) snaps
// its own sustain, but that error is NOT allowed to cascade into later onsets:
// the gap-fill below re-anchors each note to its true start_time, inserting a
// compensating rest when the previous emitted duration undershot.
function walkLine(
  notes: NoteEvent[],
  makeHit: (note: NoteEvent) => { core: string; dynamic: string },
): LineToken[] {
  const sorted = [...notes].sort((a, b) => a.start_time - b.start_time);
  const tokens: LineToken[] = [];
  let time = 0;

  for (const note of sorted) {
    if (note.start_time > time + SAME_TIME_EPSILON) {
      const rests = restTokens(note.start_time - time);

      tokens.push(...rests);
      time += emittedBeats(rests);
    }

    const { core, dynamic } = makeHit(note);
    const duration = snapDuration(note.duration);

    tokens.push({ core, dynamic, duration });
    time += duration.beats;
  }

  return tokens;
}

// Fill a gap with `z` rest tokens (greedy, largest grid note value first).
function restTokens(gapBeats: number): LineToken[] {
  return restNoteValues(gapBeats).map((duration) => ({
    core: "z",
    dynamic: "",
    duration,
  }));
}

// Total grid-snapped beat length a run of tokens actually emits; used to advance
// the cursor by what was written, not what was asked for, so onset re-anchoring
// stays exact.
function emittedBeats(tokens: LineToken[]): number {
  return tokens.reduce((sum, t) => sum + t.duration.beats, 0);
}

// Render one section line, factoring out the line default: a header `/N` only
// when the chosen default differs from the line-type default, and a token `/N`
// only when the token differs from the chosen default.
function renderLine(
  header: string,
  tokens: LineToken[],
  lineTypeDefault: DurationGridEntry,
): string {
  const lineDefault = chooseLineDefault(tokens, lineTypeDefault);
  const headerDur =
    lineDefault.token === lineTypeDefault.token ? "" : ` /${lineDefault.token}`;
  const body = tokens
    .map((t) => {
      const tokenDur =
        t.duration.token === lineDefault.token ? "" : `/${t.duration.token}`;

      return `${t.core}${tokenDur}${t.dynamic}`;
    })
    .join(" ");

  return `${header}${headerDur}: ${body}`;
}

// Pick the line default note value: the most common token duration, preferring
// the line-type default on ties (so the header can be omitted) then coarser
// (longer) values. Keyed by the token string; returns the winning grid entry.
function chooseLineDefault(
  tokens: LineToken[],
  lineTypeDefault: DurationGridEntry,
): DurationGridEntry {
  const counts = new Map<string, number>();
  const entries = new Map<string, DurationGridEntry>();

  for (const t of tokens) {
    counts.set(t.duration.token, (counts.get(t.duration.token) ?? 0) + 1);
    entries.set(t.duration.token, t.duration);
  }

  let best = lineTypeDefault;
  let bestCount = counts.get(lineTypeDefault.token) ?? 0;

  for (const [token, count] of counts) {
    // Every counted token was recorded in `entries` in the same loop above.
    const entry = entries.get(token) as DurationGridEntry;

    if (isBetterDefault(entry, count, best, bestCount, lineTypeDefault)) {
      best = entry;
      bestCount = count;
    }
  }

  return best;
}

// Tie-break for chooseLineDefault: higher count wins; on a tie the line-type
// default wins (lets the header drop), otherwise the coarser (longer) value.
function isBetterDefault(
  entry: DurationGridEntry,
  count: number,
  best: DurationGridEntry,
  bestCount: number,
  lineTypeDefault: DurationGridEntry,
): boolean {
  if (count !== bestCount) return count > bestCount;
  if (entry.token === lineTypeDefault.token) return true;
  if (best.token === lineTypeDefault.token) return false;

  return entry.beats > best.beats;
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
    durationEntry(LINE_DEFAULT[classified.lineType]),
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
      const rests = restTokens(rep.start_time - time);

      tokens.push(...rests);
      time += emittedBeats(rests);
    }

    const inner = group
      .map((note) => pitchCore(note.pitch, CHORDS_REGISTER_DEFAULT))
      .join(" ");
    const duration = snapDuration(rep.duration);

    tokens.push({
      core: `[${inner}]`,
      dynamic: dynamicSuffix(rep.velocity),
      duration,
    });
    time += duration.beats;
  }

  return renderLine("chords", tokens, durationEntry(LINE_DEFAULT.chords));
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

    lines.push(
      renderLine(drumHeader(pitch), tokens, durationEntry(DRUM_DEFAULT)),
    );
  }

  return lines;
}
