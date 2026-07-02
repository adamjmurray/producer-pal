// Producer Pal
// Copyright (C) 2025 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Type declarations for the peggy-generated Stark parser.
 * The actual parser is generated from stark-grammar.peggy.
 *
 * A/B scaffolding: Stark's pitched (bass/melody/chords) AST is byte-for-byte
 * identical to abstark's, so those types are re-exported from the abstark parser
 * rather than redeclared here (avoids a .d.ts duplication clone). Only the
 * event-based drum AST — which genuinely differs from abstark's positional-grid
 * drum AST — is declared locally. Collapses when abstark is deleted post-eval.
 */

export {
  ParseOptions,
  Location,
  SyntaxError,
  StartRules,
} from "../../peggy-parser-types.ts";

import type { ParseOptions } from "../../peggy-parser-types.ts";

export type {
  AbstarkDurationN as StarkDurationN,
  AbstarkDynamic as StarkDynamic,
  BarMarkerItem,
  NoteItem,
  RestItem,
  ChordNoteItem,
  ChordItem,
  PitchedContentItem,
  PitchedSection,
} from "../../abstark/parser/abstark-parser.ts";

import type {
  AbstarkDurationN,
  AbstarkDynamic,
  BarMarkerItem,
  RestItem,
  PitchedSection,
} from "../../abstark/parser/abstark-parser.ts";

// --- Drum items (event-based; differs from abstark's positional-grid drums) ---

/** A drum hit at the line's fixed pitch, with an optional glued /N override */
export interface DrumHitItem {
  type: "hit";
  /** ^ = accent, X = normal, x = soft */
  velocity: AbstarkDynamic;
  /** Explicit glued /N override, or null (use the line default) */
  duration: AbstarkDurationN | null;
}

export type DrumContentItem = BarMarkerItem | DrumHitItem | RestItem;

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
  defaultDuration: AbstarkDurationN | null;
  content: DrumContentItem[];
}

export type StarkSection = DrumSection | PitchedSection;

/** The parsed Stark AST: one or more sections (mixed sections are legal but warned) */
export type StarkAst = StarkSection[];

/** Parse a Stark expression string into an AST */
export function parse(input: string, options?: ParseOptions): StarkAst;
