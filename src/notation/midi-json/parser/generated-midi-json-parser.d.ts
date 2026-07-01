// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Type declarations for the peggy-generated MIDI JSON parser.
 * The actual parser is generated from midi-json-grammar.peggy.
 */

export {
  ParseOptions,
  Location,
  SyntaxError,
  StartRules,
} from "../../peggy-parser-types.ts";

import type { ParseOptions } from "../../peggy-parser-types.ts";

/**
 * A raw parsed note object: a map of the literal keys found in the input (short
 * or long form) to their numeric values. Key normalization to the CodeNote
 * shape happens in the TS interpret layer.
 */
export type MidiJsonRawNote = Record<string, number>;

/** The parsed MIDI JSON AST: an array of raw note objects. */
export type MidiJsonAst = MidiJsonRawNote[];

/** Parse a MIDI JSON string into an array of raw note objects. */
export function parse(input: string, options?: ParseOptions): MidiJsonAst;
