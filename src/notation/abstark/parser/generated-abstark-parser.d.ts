// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Type declarations for the peggy-generated Abstark parser.
 * The actual parser is generated from abstark-grammar.peggy.
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
export type AbstarkDurationN = 1 | 2 | 4 | 8 | 16;

// --- Dynamic ---

export type AbstarkDynamic = "accent" | "normal" | "soft";

// --- Shared items ---

/** Bar separator — visual/checking only; does not advance time in any line type */
export interface BarMarkerItem {
  barMarker: true;
}

// --- Drum items ---

/** A drum hit */
export interface DrumHitItem {
  type: "hit";
  velocity: AbstarkDynamic;
}

/** A drum rest (advances the 16th-note clock by one step) */
export interface DrumRestItem {
  type: "rest";
}

export type DrumContentItem = BarMarkerItem | DrumHitItem | DrumRestItem;

// --- Pitched items ---

/** A pitched note token (bass / melody / chords lines) */
export interface NoteItem {
  type: "note";
  /** Uppercase letter A–G */
  letter: string;
  /** "#" sharp, "b" flat, or null (natural) */
  accidental: "#" | "b" | null;
  /** Net octave displacement: positive = up, negative = down */
  octaveShift: number;
  /** Explicit /N duration, or null (use line default) */
  duration: AbstarkDurationN | null;
  dynamic: AbstarkDynamic;
}

/** A rest token (z with optional /N) */
export interface RestItem {
  type: "rest";
  /** Explicit /N duration, or null (use line default) */
  duration: AbstarkDurationN | null;
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
  duration: AbstarkDurationN | null;
  dynamic: AbstarkDynamic;
}

export type PitchedContentItem =
  | BarMarkerItem
  | NoteItem
  | RestItem
  | ChordItem;

// --- Sections ---

/** A `<drumname>: <hits>` section (positional 16th-note timing) */
export interface DrumSection {
  /** Drum instrument name */
  type: string;
  /** Fixed General MIDI pitch for this drum */
  midi: number;
  content: DrumContentItem[];
}

/** A `bass: / melody: / chords: <tokens>` section (event-based timing) */
export interface PitchedSection {
  type: "bass" | "melody" | "chords";
  /** /N from the line header (sets the line default), or null */
  defaultDuration: AbstarkDurationN | null;
  content: PitchedContentItem[];
}

export type AbstarkSection = DrumSection | PitchedSection;

/** The parsed Abstark AST: one or more sections (mixed sections are legal but warned) */
export type AbstarkAst = AbstarkSection[];

/** Parse an Abstark expression string into an AST */
export function parse(input: string, options?: ParseOptions): AbstarkAst;
