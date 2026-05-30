// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared type declarations for peggy-generated parsers.
 * Import these in parser-specific .d.ts files.
 */

/** Parser options for peggy-generated parsers */
export interface ParseOptions {
  startRule?: string;
  grammarSource?: string;
  /**
   * Time signature denominator, used by the barbeat grammar to convert `±n`
   * beat-position offsets (whole-note fractions) into musical beats during the
   * parse. Defaults to 4 when omitted.
   */
  timeSigDenominator?: number;
  /**
   * Musical beats per bar (the time signature numerator). Used to borrow across
   * a bar line when a `-n` beat offset pulls a position earlier than beat 1
   * (e.g. `2|1-n/12` → bar 1, beat 4⅔ in 4/4). Defaults to 4 when omitted.
   */
  beatsPerBar?: number;
}

/** Location information for syntax errors */
export interface Location {
  source?: string;
  start: { offset: number; line: number; column: number };
  end: { offset: number; line: number; column: number };
}

/** Syntax error thrown by peggy parsers */
export class SyntaxError extends Error {
  message: string;
  expected: unknown[];
  found: string | null;
  location: Location;
  name: "SyntaxError";
}

/** Peggy SyntaxError with detailed expected items for error formatting */
export interface PeggySyntaxError extends Error {
  name: "SyntaxError";
  expected?: Array<{ type: string; value?: string; description?: string }>;
  found: string | null;
  location: {
    start: { offset: number; line: number; column: number };
    end: { offset: number; line: number; column: number };
  };
}

/** Allowed start rules */
export declare const StartRules: readonly string[];
