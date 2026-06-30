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

/** Note value granularity derived from token spacing */
export type StarkDuration = "quarter" | "sixteenth";

/** Bar separator token */
export interface BarMarkerItem {
  barMarker: true;
}

/** A rest (advance time without a note) */
export interface RestItem {
  type: "rest";
  duration: StarkDuration;
}

/** A sustain (hold/extend the previous note) */
export interface SustainItem {
  type: "sustain";
  duration: StarkDuration;
}

/** A drum hit */
export interface DrumHitItem {
  type: "hit";
  velocity: "accent" | "loud" | "soft";
  duration: StarkDuration;
}

/** A pitched note (bass/melody mode) */
export interface NoteItem {
  type: "note";
  note: string;
  velocity: "loud" | "soft";
  duration: StarkDuration;
}

/** A chord (chords mode) */
export interface ChordItem {
  type: "chord";
  root: string;
  velocity: "loud" | "soft";
  hasSeventh: boolean;
  duration: StarkDuration;
}

export type DrumContentItem =
  | BarMarkerItem
  | RestItem
  | SustainItem
  | DrumHitItem;
export type NoteContentItem = BarMarkerItem | RestItem | SustainItem | NoteItem;
export type ChordContentItem =
  | BarMarkerItem
  | RestItem
  | SustainItem
  | ChordItem;

/** A single `drumname: pattern` line */
export interface DrumLine {
  type: string;
  midi: number;
  content: DrumContentItem[];
}

/** A `bass:` line */
export interface BassLine {
  type: "bass";
  content: NoteContentItem[];
}

/** A `melody:` line */
export interface MelodyLine {
  type: "melody";
  content: NoteContentItem[];
}

/** A `chords:` line */
export interface ChordLine {
  type: "chords";
  content: ChordContentItem[];
}

/** The parsed Stark AST: one or more drum lines, or a single mono/chord line */
export type StarkAst = DrumLine[] | BassLine | MelodyLine | ChordLine;

/** Parse a Stark expression string into an AST */
export function parse(input: string, options?: ParseOptions): StarkAst;
