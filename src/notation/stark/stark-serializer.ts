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
 * A duration that isn't one of the fifteen grid note values (a sample-derived
 * 2.3-beat sustain, a quintuplet — content Stark can't itself produce) snaps its
 * OWN sustain to the nearest grid value, but its onset and every following onset
 * are preserved: the walk advances by emitted grid-time, so any shortfall is
 * filled with a compensating rest rather than shifting the line. (Dotted AND
 * triplet values ARE on the grid now — a dotted quarter and an eighth-note
 * triplet each round-trip exactly.)
 *
 * The dual hazard — a note that OVERLAPS the next onset (a held bass under a
 * moving melody, a legato line with release tails) — is normalized the other
 * direction: its emitted sustain is trimmed to the coarsest grid value that ends
 * no later than the next note starts (see legatoDuration). Trimming an overlap's
 * tail is the single-line timing model's documented loss; without it a long note
 * would advance the cursor past every following onset and shift the whole line.
 * Onsets are exact for any input; only an overlapping note's own tail is lost.
 *
 * Every line is serialized the same way: walk the notes, fill gaps with `z`
 * rests, take each note's own duration as its absolute `/N`, then FACTOR OUT the
 * line default — emit a header `/N` only when it differs from the line-type
 * default and a token `/N` only when it differs from the line default — so the
 * common case reads clean (`kick: X X X X`, `hihat /8: z X z X …`). A final pass
 * collapses runs of 3+ identical tokens into `token*N` (`X*16` for a 16th roll).
 * Drums differ from pitched lines only in the token glyph (`^`/`X`/`x` vs a pitch
 * letter) and the header (a drum name vs melody/bass). Chord symbols are
 * input-only, so a chord serializes as a [..] bracket stack, never a `chords:` line.
 *
 * The leaf primitives (pitch spelling, velocity glyphs, rest decomposition, line
 * classification) live in stark-serializer-helpers.ts; the line-default
 * FACTORING below is what keeps the read-back clean.
 */

import {
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
  floorDuration,
  groupNotesByPitch,
  groupSimultaneousNotes,
  MAX_GRID_BEATS,
  octaveMarks,
  pitchParts,
  restNoteValues,
  snapDuration,
} from "#src/notation/stark/stark-serializer-helpers.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { SAME_TIME_EPSILON } from "#src/shared/config.ts";
import * as console from "#src/shared/v8-max-console.ts";

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

  warnOnOverlongNotes(notes);

  if (options.drumMode) {
    return serializeStarkDrums(notes).join("\n");
  }

  return serializeStarkPitched(notes);
}

// Stark's coarsest note value is a dotted whole note (MAX_GRID_BEATS = 6 beats),
// with no tie or multi-bar token, so a longer sustain snaps down to it and reads
// back short. Unlike an off-grid snap or an overlap trim, this loss can't be
// compensated by a rest (it's the note's OWN tail), so warn — the WARNING block
// is relayed to the LLM so a lossy read-back isn't silent. Onsets are unaffected.
function warnOnOverlongNotes(notes: NoteEvent[]): void {
  const overlong = notes.filter(
    (note) => note.duration > MAX_GRID_BEATS + SAME_TIME_EPSILON,
  ).length;

  if (overlong === 0) return;

  const noun = overlong === 1 ? "note" : "notes";
  const verb = overlong === 1 ? "is" : "are";

  console.warn(
    `Stark: ${overlong} ${noun} longer than ${MAX_GRID_BEATS} beats ${verb} ` +
      `shortened on read-back — Stark's longest note value is a dotted whole ` +
      `(${MAX_GRID_BEATS} beats). Use bar|beat or midi-json notation to ` +
      `preserve longer sustains.`,
  );
}

// ---- Shared line machinery (drums + pitched) ----

// Walk a monophonic note sequence into hit/rest tokens: legato timing, gaps
// filled with `z` rests. `makeHit` supplies each note's glyph + dynamic; the
// note's own duration becomes its /N (durations round-trip for legato input).
//
// The cursor tracks EMITTED (grid-snapped) time, not real time. Two error
// sources are prevented from cascading into later onsets: an UNDERSHOOT (a note
// shorter than the gap to the next onset, incl. a sample-derived off-grid sustain
// that snaps down) is re-anchored by a compensating rest; an OVERSHOOT (a note
// that overlaps the following onset) is trimmed to legato via {@link
// legatoDuration}, so its own tail is shortened rather than shoving every later
// onset rightward. Onsets are preserved in both cases.
function walkLine(
  notes: NoteEvent[],
  makeHit: (note: NoteEvent) => { core: string; dynamic: string },
): LineToken[] {
  const sorted = [...notes].sort((a, b) => a.start_time - b.start_time);
  const tokens: LineToken[] = [];
  let time = 0;

  for (let i = 0; i < sorted.length; i++) {
    // i is bounded by sorted.length, so this access is always present.
    const note = sorted[i] as NoteEvent;

    if (note.start_time > time + SAME_TIME_EPSILON) {
      const rests = restTokens(note.start_time - time);

      tokens.push(...rests);
      time += emittedBeats(rests);
    }

    const { core, dynamic } = makeHit(note);
    const next = sorted[i + 1];
    const duration = legatoDuration(
      note.duration,
      next != null ? next.start_time - note.start_time : Infinity,
    );

    tokens.push({ core, dynamic, duration });
    time += duration.beats;
  }

  return tokens;
}

// Choose the grid note value to emit for a note whose real sustain is
// `naturalBeats`, capped so it never runs past the next onset (`capBeats` beats
// away; Infinity for the final note). Within the cap this is the ordinary
// nearest-grid snap; an overlapping note (sustain past the next onset) is trimmed
// to the coarsest grid value that fits the gap. Trimming the overlap's tail is
// the documented monophonic-legato normalization — it keeps every onset exact,
// which a raw snapDuration of the full sustain would not.
function legatoDuration(
  naturalBeats: number,
  capBeats: number,
): DurationGridEntry {
  const snapped = snapDuration(naturalBeats);

  if (snapped.beats <= capBeats + SAME_TIME_EPSILON) return snapped;

  return floorDuration(capBeats);
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
// only when the token differs from the chosen default. Consecutive identical
// tokens then collapse into `token*N` (see collapseRepeats).
function renderLine(
  header: string,
  tokens: LineToken[],
  lineTypeDefault: DurationGridEntry,
): string {
  const lineDefault = chooseLineDefault(tokens, lineTypeDefault);
  const headerDur =
    lineDefault.token === lineTypeDefault.token ? "" : ` /${lineDefault.token}`;
  const rendered = tokens.map((t) => {
    const tokenDur =
      t.duration.token === lineDefault.token ? "" : `/${t.duration.token}`;

    return `${t.core}${tokenDur}${t.dynamic}`;
  });

  return `${header}${headerDur}: ${collapseRepeats(rendered).join(" ")}`;
}

// Emit `*N` only once a run reaches this many copies: `X*3` is shorter than
// `X X X`, but `X*2` is no shorter than `X X`, so runs of 1–2 stay literal.
const REPEAT_EMIT_THRESHOLD = 3;

// Collapse runs of identical rendered tokens into `token*N` (`X X X X` → `X*4`).
// `*N` round-trips as N independent copies (the interpreter's expansion), so a
// run of same-bucket hits/rests/chords compresses losslessly at the bucket level.
function collapseRepeats(rendered: string[]): string[] {
  const out: string[] = [];
  let i = 0;

  while (i < rendered.length) {
    // The while-guard guarantees index i is in range.
    const token = rendered[i] as string;
    let run = 1;

    while (rendered[i + run] === token) run++;

    if (run >= REPEAT_EMIT_THRESHOLD) {
      out.push(`${token}*${run}`);
    } else {
      for (let k = 0; k < run; k++) out.push(token);
    }

    i += run;
  }

  return out;
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

// ---- Pitched lines (bass / melody) ----

// Serialize a pitched line: bass or melody by median pitch, with any
// simultaneous notes rendered as a [..] bracket stack. Gaps become z rests.
// Chord SYMBOLS are input-only, so read-back is always literal notes here.
function serializeStarkPitched(notes: NoteEvent[]): string {
  const { lineType, registerDefault, sorted } = classifyPitchedLine(notes);
  const groups = groupSimultaneousNotes(sorted);
  const tokens: LineToken[] = [];
  let time = 0;

  for (let i = 0; i < groups.length; i++) {
    // groups are non-empty (groupSimultaneousNotes only emits matched groups),
    // and i is bounded by groups.length.
    const group = groups[i] as NoteEvent[];
    const rep = group[0] as NoteEvent;

    if (rep.start_time > time + SAME_TIME_EPSILON) {
      const rests = restTokens(rep.start_time - time);

      tokens.push(...rests);
      time += emittedBeats(rests);
    }

    // Cap the group's sustain at the next group's onset so a held note (e.g. a
    // sustained bass under a moving melody) is trimmed to legato instead of
    // shoving the melody's onsets later. The final group has no cap.
    const nextGroup = groups[i + 1];
    const duration = legatoDuration(
      rep.duration,
      nextGroup != null
        ? (nextGroup[0] as NoteEvent).start_time - rep.start_time
        : Infinity,
    );

    tokens.push({
      core: groupCore(group, registerDefault),
      dynamic: dynamicSuffix(rep.velocity),
      duration,
    });
    time += duration.beats;
  }

  return renderLine(lineType, tokens, durationEntry(LINE_DEFAULT[lineType]));
}

// Spell a simultaneous-note group: a lone note as its pitch, 2+ as a [..] stack.
function groupCore(group: NoteEvent[], registerDefault: number): string {
  if (group.length === 1) {
    // length 1 → index 0 is present.
    return pitchCore((group[0] as NoteEvent).pitch, registerDefault);
  }

  const inner = group
    .map((note) => pitchCore(note.pitch, registerDefault))
    .join(" ");

  return `[${inner}]`;
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
