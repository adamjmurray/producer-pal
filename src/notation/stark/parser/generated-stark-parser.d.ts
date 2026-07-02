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
  duration: StarkDurationN | null;
}

// --- Drum items (event-based: a line of hits/rests at a fixed pitch) ---

/** A drum hit at the line's fixed pitch, with an optional glued /N override */
export interface DrumHitItem {
  type: "hit";
  /** ^ = accent, X = normal, x = soft */
  velocity: StarkDynamic;
  /** Explicit glued /N override, or null (use the line default) */
  duration: StarkDurationN | null;
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
  /** Net octave displacement: positive = up, negative = down */
  octaveShift: number;
  /** Explicit /N duration, or null (use line default) */
  duration: StarkDurationN | null;
  dynamic: StarkDynamic;
}

/** A single note inside a bracket chord */
export interface ChordNoteItem {
  /** Uppercase letter A–G */
  letter: string;
  /** "#" sharp, "b" flat, or null (natural) */
  accidental: "#" | "b" | null;
  /** Net octave displacement */
  octaveShift: number;
}

/** A bracket chord: [<note> <note> ...] with duration/dynamic on the whole chord */
export interface ChordItem {
  type: "chord";
  notes: ChordNoteItem[];
  /** Explicit /N duration, or null (use line default) */
  duration: StarkDurationN | null;
  dynamic: StarkDynamic;
}

export type PitchedContentItem =
  | BarMarkerItem
  | NoteItem
  | RestItem
  | ChordItem;

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
  defaultDuration: StarkDurationN | null;
  content: DrumContentItem[];
}

/** A `bass: / melody: / chords: <tokens>` section (event-based timing) */
export interface PitchedSection {
  type: "bass" | "melody" | "chords";
  /** /N from the line header (sets the line default), or null */
  defaultDuration: StarkDurationN | null;
  content: PitchedContentItem[];
}

export type StarkSection = DrumSection | PitchedSection;

/** The parsed Stark AST: one or more sections (mixed sections are legal but warned) */
export type StarkAst = StarkSection[];

/** Parse a Stark expression string into an AST */
export function parse(input: string, options?: ParseOptions): StarkAst;
