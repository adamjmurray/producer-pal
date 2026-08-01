// Producer Pal
// Copyright (C) 2025 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Type declarations for the peggy-generated Stark parser.
 * The actual parser is generated from stark-grammar.peggy.
 */

export {
  ParseOptions,
  Location,
  SyntaxError,
  StartRules,
} from "../../peggy-parser-types.ts";

import type { ParseOptions } from "../../peggy-parser-types.ts";

// --- Duration ---

/** Absolute note-value denominator: /1=whole, /2=half, /4=quarter, /8=eighth, /16=sixteenth */
export type StarkDurationN = 1 | 2 | 4 | 8 | 16;

/**
 * An absolute /N note value with an optional modifier. `dotted` multiplies the
 * value by 1.5 (a dotted quarter `/4.` = 1.5 beats); `triplet` multiplies by 2/3
 * (an eighth-note triplet `/8t` = 1/3 beat). The two are mutually exclusive and
 * don't stack.
 */
export interface StarkDuration {
  n: StarkDurationN;
  dotted: boolean;
  triplet: boolean;
}

// --- Dynamic ---

export type StarkDynamic = "accent" | "normal" | "soft";

// --- Shared items ---

/** Bar separator — visual/checking only; does not advance time in any line type */
export interface BarMarkerItem {
  barMarker: true;
}

/** A rest token (z with optional /N) */
export interface RestItem {
  type: "rest";
  /** Explicit /N duration, or null (use line default) */
  duration: StarkDuration | null;
  /** `*N` repeat count (expand into N copies), or null (once) */
  repeat: number | null;
}

// --- Drum items (event-based: a line of hits/rests at a fixed pitch) ---

/** A drum hit at the line's fixed pitch, with an optional glued /N override */
export interface DrumHitItem {
  type: "hit";
  /** ^ = accent, X = normal, x = soft */
  velocity: StarkDynamic;
  /** Explicit glued /N override, or null (use the line default) */
  duration: StarkDuration | null;
  /** `*N` repeat count (expand into N copies), or null (once) */
  repeat: number | null;
}

export type DrumContentItem = BarMarkerItem | DrumHitItem | RestItem;

// --- Pitched items (bass / melody / chords) ---

/** A pitched note token */
export interface NoteItem {
  type: "note";
  /** Uppercase letter A–G */
  letter: string;
  /** "#" sharp, "b" flat, or null (natural) */
  accidental: "#" | "b" | null;
  /** Absolute octave number (`C3` = MIDI 60), or null (use the line register) */
  octave: number | null;
  /** Net octave displacement: positive = up, negative = down */
  octaveShift: number;
  /** Explicit /N duration, or null (use line default) */
  duration: StarkDuration | null;
  dynamic: StarkDynamic;
  /** `*N` repeat count (expand into N copies), or null (once) */
  repeat: number | null;
}

/** A single note inside a bracket chord */
export interface ChordNoteItem {
  /** Uppercase letter A–G */
  letter: string;
  /** "#" sharp, "b" flat, or null (natural) */
  accidental: "#" | "b" | null;
  /** Absolute octave number (`C3` = MIDI 60), or null (use the line register) */
  octave: number | null;
  /** Net octave displacement */
  octaveShift: number;
}

/** A bracket chord: [<note> <note> ...] with duration/dynamic on the whole chord */
export interface ChordItem {
  type: "chord";
  notes: ChordNoteItem[];
  /** Explicit /N duration, or null (use line default) */
  duration: StarkDuration | null;
  dynamic: StarkDynamic;
  /** `*N` repeat count (expand into N copies), or null (once) */
  repeat: number | null;
}

export type PitchedContentItem =
  BarMarkerItem | NoteItem | RestItem | ChordItem;

// --- Chord-symbol items (symbolic: chords lines only) ---

/**
 * A chord symbol (`Cm7`, `G7/B`, `Fmaj9`) — INPUT-ONLY sugar the interpreter
 * realizes into concrete notes. The serializer never emits these (read-back is
 * literal notes on a melody/bass line), so there is no chord-symbol AST on the
 * way out.
 */
export interface ChordSymbolItem {
  type: "chordSymbol";
  /** Root pitch-class name with optional accidental (e.g. "C", "Eb", "F#") */
  root: string;
  /** Quality string as written ("" = major triad; "m7", "maj9", "7b9", …) */
  quality: string;
  /** Slash-bass pitch-class name (e.g. "B" in "G7/B"), or null */
  bass: string | null;
  /** Net octave displacement from octave marks (shifts the whole chord) */
  octaveShift: number;
  /** Explicit /N duration, or null (use line default) */
  duration: StarkDuration | null;
  dynamic: StarkDynamic;
  /** `*N` repeat count (expand into N copies), or null (once) */
  repeat: number | null;
  /**
   * Leftover non-separator chars after the token's grammar was consumed (up to
   * whitespace or a `|` bar), e.g. "/9" in "C6/9" or "-7" in "C-7". "" for a
   * well-formed token; when non-empty the interpreter rejects the whole token,
   * throwing "unknown chord symbol" with the full token in the message (rather
   * than realizing a partial chord from the part that did parse).
   */
  trailing: string;
}

/**
 * A chords-line content item: bar marker, rest, chord symbol, or an explicit
 * [..] bracket voicing (ChordItem, voiced in the chord register). No bare single
 * notes — a bare token is always a symbol.
 */
export type ChordsContentItem =
  BarMarkerItem | RestItem | ChordSymbolItem | ChordItem;

// --- Sections ---

/** A `<drumname>: <hits>` or `<pitch>: <hits>` section (event-based timing) */
export interface DrumSection {
  /** Drum instrument name (kick/snare/…) OR the verbatim pitch-name header (e.g. "C1") */
  type: string;
  /**
   * Fixed General MIDI pitch for a named drum, or null for a pitch-name header
   * (resolve via `noteName` + pitch.ts, Ableton C3 = MIDI 60).
   */
  midi: number | null;
  /** Verbatim pitch-name header (e.g. "C1", "Gb2") for pitch-led lines, else null */
  noteName: string | null;
  /** /N from the line header (sets the line default), or null */
  defaultDuration: StarkDuration | null;
  content: DrumContentItem[];
}

/** A `bass:` / `melody:` LITERAL section: single notes and [..] bracket stacks */
export interface MelodyBassSection {
  type: "bass" | "melody";
  /** /N from the line header (sets the line default), or null */
  defaultDuration: StarkDuration | null;
  content: PitchedContentItem[];
}

/** A `chords:` SYMBOLIC section: chord symbols the interpreter realizes to notes */
export interface ChordsSection {
  type: "chords";
  /** /N from the line header (sets the line default), or null */
  defaultDuration: StarkDuration | null;
  content: ChordsContentItem[];
}

/** A pitched (non-drum) section: literal melody/bass, or symbolic chords */
export type PitchedSection = MelodyBassSection | ChordsSection;

export type StarkSection = DrumSection | PitchedSection;

/** The parsed Stark AST: one or more sections (mixed sections are legal but warned) */
export type StarkAst = StarkSection[];

/** Parse a Stark expression string into an AST */
export function parse(input: string, options?: ParseOptions): StarkAst;
