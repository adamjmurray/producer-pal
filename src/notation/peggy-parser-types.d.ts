// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Shared type declarations for peggy-generated parsers.
 * Import these in parser-specific .d.ts files.
 */

/** Parser options for peggy-generated parsers */
export interface ParseOptions {
  startRule?: string;
  grammarSource?: string;
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
