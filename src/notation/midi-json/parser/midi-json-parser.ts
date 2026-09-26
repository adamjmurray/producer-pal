// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * MIDI JSON notation parser — a compact array of note objects.
 *
 * The canonical serialized form is a JS object-literal with unquoted short keys
 * and defaults omitted, e.g. `[{p:60,t:0,d:4,v:100},{p:62,t:1,d:1,v:90,c:0.75}]`.
 * Parsing is deliberately tolerant so whatever an LLM emits still parses: keys
 * may be quoted (valid JSON) or bare, and may use the short forms (p/t/d/v/vd/c)
 * or the long ones. Key normalization and range clamping happen in the interpret
 * layer, not here — this only turns the string into an array of `{key: number}`.
 *
 * Hand-written rather than generated: the language is 11 rules of JSON-ish
 * flat objects, which is cheaper to read here than as a grammar plus a ~28 KB
 * generated parser in the V8 bundle.
 */

/**
 * A raw parsed note object: a map of the literal keys found in the input (short
 * or long form) to their numeric values.
 */
export type MidiJsonRawNote = Record<string, number>;

/** The parsed MIDI JSON AST: an array of raw note objects. */
export type MidiJsonAst = MidiJsonRawNote[];

/** Parser position in the input string. */
interface Cursor {
  readonly input: string;
  pos: number;
}

/**
 * Parse a MIDI JSON string into an array of raw note objects.
 *
 * @param input - MIDI JSON array string
 * @returns Array of raw note objects
 * @throws If the input is not a well-formed MIDI JSON array
 */
export function parse(input: string): MidiJsonAst {
  const cursor: Cursor = { input, pos: 0 };

  skipWhitespace(cursor);

  const notes = parseNoteArray(cursor);

  skipWhitespace(cursor);

  if (cursor.pos < input.length) {
    throw syntaxError(cursor, "end of input");
  }

  return notes;
}

function parseNoteArray(cursor: Cursor): MidiJsonAst {
  expectChar(cursor, "[");
  skipWhitespace(cursor);

  const notes: MidiJsonAst = [];

  if (cursor.input[cursor.pos] === "]") {
    cursor.pos++;

    return notes;
  }

  notes.push(parseNoteObject(cursor));
  skipWhitespace(cursor);

  while (cursor.input[cursor.pos] === ",") {
    cursor.pos++;
    skipWhitespace(cursor);
    notes.push(parseNoteObject(cursor));
    skipWhitespace(cursor);
  }

  expectChar(cursor, "]");

  return notes;
}

function parseNoteObject(cursor: Cursor): MidiJsonRawNote {
  expectChar(cursor, "{");
  skipWhitespace(cursor);

  const note: MidiJsonRawNote = {};

  if (cursor.input[cursor.pos] === "}") {
    cursor.pos++;

    return note;
  }

  parseProp(cursor, note);

  while (cursor.input[cursor.pos] === ",") {
    cursor.pos++;
    parseProp(cursor, note);
  }

  expectChar(cursor, "}");

  return note;
}

// A duplicate key overwrites: last one wins.
function parseProp(cursor: Cursor, note: MidiJsonRawNote): void {
  skipWhitespace(cursor);

  const key = parseKey(cursor);

  skipWhitespace(cursor);
  expectChar(cursor, ":");
  skipWhitespace(cursor);

  note[key] = parseNumber(cursor);

  skipWhitespace(cursor);
}

function parseKey(cursor: Cursor): string {
  const quote = cursor.input[cursor.pos];

  if (quote === '"' || quote === "'") {
    cursor.pos++;

    const name = parseKeyName(cursor);

    expectChar(cursor, quote);

    return name;
  }

  return parseKeyName(cursor);
}

function parseKeyName(cursor: Cursor): string {
  const start = cursor.pos;

  if (!isLetter(cursor.input[cursor.pos])) {
    throw syntaxError(cursor, "a key");
  }

  cursor.pos++;

  while (isKeyChar(cursor.input[cursor.pos])) {
    cursor.pos++;
  }

  return cursor.input.slice(start, cursor.pos);
}

// A ratio (`d:2/3`, `t:1/3`) keeps tuplet timing exact instead of lossy and
// repeating. Division by zero is left to the interpret layer's clamping.
function parseNumber(cursor: Cursor): number {
  const value = parseDecimal(cursor);
  const denominator = scanDenominator(cursor);

  return denominator == null ? value : value / denominator;
}

function scanDenominator(cursor: Cursor): number | null {
  if (
    cursor.input[cursor.pos] !== "/" ||
    !isDigit(cursor.input[cursor.pos + 1])
  ) {
    return null;
  }

  cursor.pos++;

  const start = cursor.pos;

  skipDigits(cursor);

  return Number.parseInt(cursor.input.slice(start, cursor.pos), 10);
}

// Leading zeros (`007`) and a leading-dot decimal (`.5`, `-.75`) are accepted —
// both are common LLM habits and parseFloat normalizes them.
function parseDecimal(cursor: Cursor): number {
  const start = cursor.pos;

  if (cursor.input[cursor.pos] === "-") {
    cursor.pos++;
  }

  if (isDigit(cursor.input[cursor.pos])) {
    skipDigits(cursor);
    scanFraction(cursor);
  } else if (!scanFraction(cursor)) {
    throw syntaxError(cursor, "a number");
  }

  scanExponent(cursor);

  return Number.parseFloat(cursor.input.slice(start, cursor.pos));
}

// A `.` needs a digit after it, so `1.` is a number followed by junk, not `1.0`.
function scanFraction(cursor: Cursor): boolean {
  if (
    cursor.input[cursor.pos] !== "." ||
    !isDigit(cursor.input[cursor.pos + 1])
  ) {
    return false;
  }

  cursor.pos += 2;
  skipDigits(cursor);

  return true;
}

// Same deal: `1e` is `1` followed by junk, so leave the `e` for the caller.
function scanExponent(cursor: Cursor): void {
  const marker = cursor.input[cursor.pos];

  if (marker !== "e" && marker !== "E") {
    return;
  }

  let next = cursor.pos + 1;
  const sign = cursor.input[next];

  if (sign === "+" || sign === "-") {
    next++;
  }

  if (!isDigit(cursor.input[next])) {
    return;
  }

  cursor.pos = next;
  skipDigits(cursor);
}

function expectChar(cursor: Cursor, expected: string): void {
  if (cursor.input[cursor.pos] !== expected) {
    throw syntaxError(cursor, `\`${expected}\``);
  }

  cursor.pos++;
}

function syntaxError(cursor: Cursor, expected: string): Error {
  const found = cursor.input[cursor.pos];

  return new Error(
    `expected ${expected} at position ${cursor.pos}, found ${
      found == null ? "end of input" : `\`${found}\``
    }`,
  );
}

function skipWhitespace(cursor: Cursor): void {
  while (isWhitespace(cursor.input[cursor.pos])) {
    cursor.pos++;
  }
}

function skipDigits(cursor: Cursor): void {
  while (isDigit(cursor.input[cursor.pos])) {
    cursor.pos++;
  }
}

function isWhitespace(char: string | undefined): boolean {
  return char === " " || char === "\t" || char === "\n" || char === "\r";
}

function isDigit(char: string | undefined): boolean {
  return char != null && char >= "0" && char <= "9";
}

function isLetter(char: string | undefined): boolean {
  return (
    char != null &&
    ((char >= "a" && char <= "z") || (char >= "A" && char <= "Z"))
  );
}

function isKeyChar(char: string | undefined): boolean {
  return isLetter(char) || isDigit(char);
}
