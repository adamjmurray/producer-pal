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

/** Allowed start rules */
export declare const StartRules: readonly string[];
