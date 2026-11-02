// Producer Pal
// Copyright (C) 2025 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Stark notation interpreter: converts a Stark expression into MIDI note events.
 * Stark is a literal, round-trippable notation — pitches are exact (no scale
 * snapping), accidentals are explicit, durations are absolute /N note values.
 *
 * Three line types coexist, all event-based (duration is explicit /N):
 *   Drums:         a line of hit/rest tokens at a fixed pitch.
 *   Melody / bass: literal pitched tokens (notes and [..] bracket stacks).
 *   Chords:        chord SYMBOLS (Cm7, G7/B) realized into notes on input.
 *
 * See parser/stark-grammar.peggy for the syntax.
 */

import { chordSymbolPitches } from "#src/notation/chords/chord-symbols.ts";
import { checkNotationLimit } from "#src/notation/helpers/notation-limit.ts";
import { sortNotes } from "#src/notation/helpers/note-sort.ts";
import { type PeggySyntaxError } from "#src/notation/peggy-parser-types.ts";
import {
  drumHeaderPitch,
  noteLabel,
  notePitch,
} from "#src/notation/stark/helpers/stark-interpreter-pitch.ts";
import {
  type BarMarkerItem,
  type ChordItem,
  type ChordsContentItem,
  type ChordsSection,
  type DrumSection,
  type PitchedContentItem,
  type PitchedSection,
  type RestItem,
  type StarkDuration,
  type StarkDynamic,
  type StarkSection,
} from "#src/notation/stark/parser/stark-parser.ts";
import * as parser from "#src/notation/stark/parser/stark-parser.ts";
import { formatStarkSyntaxError } from "#src/notation/stark/parser/stark-syntax-error.ts";
import {
  BASS_REGISTER_DEFAULT,
  CHORDS_REGISTER_DEFAULT,
  DRUM_DEFAULT,
  durationBeats,
  LINE_DEFAULT,
  MELODY_REGISTER_DEFAULT,
  randomVelocity,
  VELOCITY_ACCENT_MAX,
  VELOCITY_ACCENT_MIN,
  VELOCITY_NORMAL_MAX,
  VELOCITY_NORMAL_MIN,
  VELOCITY_SOFT_MAX,
  VELOCITY_SOFT_MIN,
} from "#src/notation/stark/stark-config.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { assertDefined } from "#src/shared/error-message.ts";
import { emitWarning } from "#src/shared/max/v8-max-console.ts";

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
  const ast = parseNotation(starkExpression);

  // Warn only when drum and pitched lines share a clip — that crosses the
  // Drum-Rack/instrument track boundary and is usually a mistake. Mixing pitched
  // registers (bass:+melody:, melody:+chords:) is normal multi-part writing, so
  // it must NOT warn (that was noise). Same-pitch overlaps are dropped by the
  // write path, which says so on the clip's entry.
  const hasDrums = ast.some((s) => "midi" in s);
  const hasPitched = ast.some((s) => !("midi" in s));

  if (hasDrums && hasPitched) {
    emitWarning("Stark: mixed drum and pitched sections in one clip");
  }

  const notes: NoteEvent[] = [];

  for (const section of ast) {
    if (isDrumSection(section)) {
      processDrumSection(section, notes);
    } else {
      processPitchedSection(section, notes);
    }
  }

  // Same-pitch+start collisions (from mixed sections) are left for the write
  // path to drop and count: it says so on the clip's entry.
  return sortNotes(notes);
}

/**
 * Parse a Stark string without interpreting it, so it warns nothing. An
 * unknown chord symbol still parses.
 * @param starkExpression - Stark notation string
 * @returns The parsed sections
 */
export function parseNotation(starkExpression: string): StarkSection[] {
  if (!starkExpression || starkExpression.trim() === "") {
    return [];
  }

  let ast: StarkSection[];

  try {
    ast = parser.parse(starkExpression);
  } catch (error) {
    const message =
      error instanceof Error && error.name === "SyntaxError"
        ? formatStarkSyntaxError(error as PeggySyntaxError, starkExpression)
        : `Stark notation parse error: ${(error as Error).message}`;

    throw new Error(message, { cause: error });
  }

  // Refuse a `*N` too large to expand, before any note is made.
  for (const section of ast) {
    for (const item of section.content) {
      if ("repeat" in item && item.repeat != null) {
        checkNotationLimit(item.repeat, `Repeat *${item.repeat}`);
      }
    }
  }

  return ast;
}

// Drum sections carry a `midi`/`noteName` header; pitched sections do not.
function isDrumSection(section: StarkSection): section is DrumSection {
  return "midi" in section;
}

// Process an event-based drum section: each token is a hit or rest whose
// duration is its glued /N, else the line default (header /N, else /4). The
// pitch is fixed — the named drum's GM pitch (section.midi) or a pitch-name
// header resolved arithmetically (Ableton C3=60).
function processDrumSection(section: DrumSection, notes: NoteEvent[]): void {
  // DrumHeader sets exactly one of midi (a named drum's fixed GM pitch) or
  // noteName (a pitch-name header), so the fallback always has a name to resolve.
  const pitch =
    section.midi ??
    drumHeaderPitch(assertDefined(section.noteName, "drum header note name"));

  if (pitch == null) {
    emitWarning(
      `Stark: drum line "${section.type}" has no resolvable pitch — skipping`,
    );

    return;
  }

  const lineDefault = section.defaultDuration ?? DRUM_DEFAULT;

  // Each copy of a `*N` hit re-rolls its velocity.
  runLine(section.content, lineDefault, notes, (hit, time) => {
    const beats = durationBeats(hit.duration ?? lineDefault);

    notes.push({
      pitch,
      start_time: time,
      duration: beats,
      velocity: velocityFor(hit.velocity),
      probability: 1.0,
    });

    return time + beats;
  });
}

// Convert a dynamic level to a random velocity within its range.
function velocityFor(dynamic: StarkDynamic): number {
  if (dynamic === "accent") {
    return randomVelocity(VELOCITY_ACCENT_MIN, VELOCITY_ACCENT_MAX);
  }

  if (dynamic === "soft") {
    return randomVelocity(VELOCITY_SOFT_MIN, VELOCITY_SOFT_MAX);
  }

  return randomVelocity(VELOCITY_NORMAL_MIN, VELOCITY_NORMAL_MAX);
}

// Process a pitched section. Chords are symbolic (realized from chord symbols);
// melody/bass are literal pitches. Both are event-based with /N durations.
function processPitchedSection(
  section: PitchedSection,
  notes: NoteEvent[],
): void {
  if (section.type === "chords") {
    processChordsSection(section, notes);

    return;
  }

  const registerDefault =
    section.type === "bass" ? BASS_REGISTER_DEFAULT : MELODY_REGISTER_DEFAULT;

  const lineDefault = section.defaultDuration ?? LINE_DEFAULT[section.type];

  runLine(section.content, lineDefault, notes, (item, time) =>
    processItem(item, time, registerDefault, lineDefault, notes),
  );
}

// Process a chords section: each token is a chord symbol realized into concrete
// notes (closed, root-position voicing stacked from C2). Event-based timing.
function processChordsSection(
  section: ChordsSection,
  notes: NoteEvent[],
): void {
  const lineDefault = section.defaultDuration ?? LINE_DEFAULT.chords;

  runLine(section.content, lineDefault, notes, (item, time) =>
    processChordItem(item, time, lineDefault, notes),
  );
}

// Walk one line's content from time 0. A bar marker doesn't move the cursor, a
// rest moves it by its duration, and every other token moves it by whatever
// `step` returns. `*N` expands one token into N copies.
function runLine<T extends BarMarkerItem | { repeat?: number | null }>(
  content: T[],
  lineDefault: StarkDuration,
  notes: NoteEvent[],
  step: (item: Exclude<T, BarMarkerItem | RestItem>, time: number) => number,
): void {
  let time = 0;

  for (const item of content) {
    if ("barMarker" in item) {
      continue;
    }

    const count = item.repeat ?? 1;

    for (let i = 0; i < count; i++) {
      time = isRest(item)
        ? time + durationBeats(item.duration ?? lineDefault)
        : step(item as Exclude<T, BarMarkerItem | RestItem>, time);
      checkNotationLimit(notes.length, "Note count");
    }
  }
}

function isRest(item: object): item is RestItem {
  return "type" in item && item.type === "rest";
}

// Process one chords-line item; returns the updated time cursor. Tokens are chord
// symbols (realized from the vocab) or explicit [..] bracket voicings (voiced in
// the chord register). An unknown symbol quality is a hard error — like any other
// invalid Stark token — so a missing space (`CG` = root C, quality "G") can't
// silently drop chords and desync the rest of the line.
function processChordItem(
  item: Exclude<ChordsContentItem, BarMarkerItem | RestItem>,
  time: number,
  lineDefault: StarkDuration,
  notes: NoteEvent[],
): number {
  if (item.type === "chord") {
    return pushBracketChord(
      item,
      time,
      lineDefault,
      CHORDS_REGISTER_DEFAULT,
      notes,
    );
  }

  const beats = durationBeats(item.duration ?? lineDefault);
  // Leftover chars the grammar couldn't lex (e.g. `/9` in `C6/9`, `-7` in `C-7`)
  // mark the whole token as malformed — reject it rather than realize a partial
  // chord from the part that did parse.
  const pitches = item.trailing
    ? null
    : chordSymbolPitches(
        item.root,
        item.quality,
        item.bass,
        CHORDS_REGISTER_DEFAULT,
        item.octaveShift,
      );

  if (pitches == null) {
    const slash = item.bass == null ? "" : `/${item.bass}`;
    const label = `${item.root}${item.quality}${slash}${item.trailing}`;

    throw new Error(
      `Stark: unknown chord symbol "${label}" — separate chords with spaces ` +
        `and use a known quality (m, maj7, m7, 7, dim, aug, sus2, sus4, add9, 7b9, ...)`,
    );
  }

  const velocity = velocityFor(item.dynamic);

  for (const pitch of pitches) {
    notes.push({
      pitch,
      start_time: time,
      duration: beats,
      velocity,
      probability: 1.0,
    });
  }

  return time + beats;
}

// Process one pitched content item; returns updated time cursor.
function processItem(
  item: Exclude<PitchedContentItem, BarMarkerItem | RestItem>,
  time: number,
  registerDefault: number,
  lineDefault: StarkDuration,
  notes: NoteEvent[],
): number {
  if (item.type === "note") {
    const beats = durationBeats(item.duration ?? lineDefault);
    const midi = notePitch(item, registerDefault);

    // Time still advances, so one bad token can't desync the rest of the line.
    if (midi == null) {
      emitWarning(
        `Stark: note "${noteLabel(item)}" is out of MIDI range — skipping`,
      );

      return time + beats;
    }

    notes.push({
      pitch: midi,
      start_time: time,
      duration: beats,
      velocity: velocityFor(item.dynamic),
      probability: 1.0,
    });

    return time + beats;
  }

  // type === "chord"
  return pushBracketChord(item, time, lineDefault, registerDefault, notes);
}

// Voice an explicit [..] bracket chord at `registerDefault`; every note shares
// one velocity roll. Returns the advanced time cursor. Shared by melody/bass
// (their line register) and chords lines (the chord register).
function pushBracketChord(
  item: ChordItem,
  time: number,
  lineDefault: StarkDuration,
  registerDefault: number,
  notes: NoteEvent[],
): number {
  const beats = durationBeats(item.duration ?? lineDefault);
  const velocity = velocityFor(item.dynamic);

  for (const chordNote of item.notes) {
    const pitch = notePitch(chordNote, registerDefault);

    if (pitch == null) {
      emitWarning(
        `Stark: note "${noteLabel(chordNote)}" is out of MIDI range — skipping`,
      );

      continue;
    }

    notes.push({
      pitch,
      start_time: time,
      duration: beats,
      velocity,
      probability: 1.0,
    });
  }

  return time + beats;
}
