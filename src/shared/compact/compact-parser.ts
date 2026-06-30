// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Parses the compact JS-literal syntax produced by `toCompactJSLiteral` back
 * into a value. The inverse of `compact-serializer.ts`.
 *
 * The format is JSON with exactly one extension: object keys may be unquoted
 * when they are JS identifiers or bare integers (e.g. `{a:1,0:"x"}`). Every
 * other token — string values, numbers, booleans, null, arrays — is plain JSON.
 *
 * Because the only deviation from JSON is unquoted keys, `JSON.parse` cannot
 * read compact output (it rejects the bare keys), and JSON5 cannot either (it
 * rejects bare *integer* keys like `{0:...}`, which the serializer emits). Hence
 * this small purpose-built recursive-descent parser. String and number tokens
 * are delegated to `JSON.parse`/`Number` so escape and numeric handling stay
 * exactly JSON-compatible.
 */

/** Mutable cursor over the input text, threaded through the parse helpers. */
interface ParseState {
  text: string;
  pos: number;
}

/**
 * Parse a compact JS-literal string into a value.
 *
 * @param text - Compact JS-literal text (the output of toCompactJSLiteral)
 * @returns The parsed value
 * @throws If the text is not well-formed compact JS-literal syntax
 */
export function parseCompactJSLiteral(text: string): unknown {
  const state: ParseState = { text, pos: 0 };
  const value = parseValue(state);

  skipWs(state);

  if (state.pos < text.length) {
    fail(state, "unexpected trailing content");
  }

  return value;
}

/**
 * Parse any value at the current position.
 *
 * @param s - Parse state
 * @returns The parsed value
 */
function parseValue(s: ParseState): unknown {
  skipWs(s);

  const ch = peek(s);

  if (ch === "{") return parseObject(s);
  if (ch === "[") return parseArray(s);
  if (ch === '"') return parseString(s);
  if (ch === "-" || /\d/.test(ch)) return parseNumber(s);

  return parseKeyword(s);
}

/**
 * Parse an object literal (`{...}`) with quoted or unquoted keys.
 *
 * @param s - Parse state
 * @returns The parsed object
 */
function parseObject(s: ParseState): Record<string, unknown> {
  s.pos++; // consume "{"

  const obj: Record<string, unknown> = {};

  skipWs(s);

  if (peek(s) === "}") {
    s.pos++;

    return obj;
  }

  for (;;) {
    skipWs(s);

    const key = parseKey(s);

    skipWs(s);

    if (peek(s) !== ":") fail(s, "expected ':' after object key");
    s.pos++;

    obj[key] = parseValue(s);

    skipWs(s);

    const ch = peek(s);

    if (ch === ",") {
      s.pos++;
      continue;
    }

    if (ch === "}") {
      s.pos++;

      return obj;
    }

    fail(s, "expected ',' or '}' in object");
  }
}

/**
 * Parse an array literal (`[...]`).
 *
 * @param s - Parse state
 * @returns The parsed array
 */
function parseArray(s: ParseState): unknown[] {
  s.pos++; // consume "["

  const arr: unknown[] = [];

  skipWs(s);

  if (peek(s) === "]") {
    s.pos++;

    return arr;
  }

  for (;;) {
    arr.push(parseValue(s));

    skipWs(s);

    const ch = peek(s);

    if (ch === ",") {
      s.pos++;
      continue;
    }

    if (ch === "]") {
      s.pos++;

      return arr;
    }

    fail(s, "expected ',' or ']' in array");
  }
}

/**
 * Parse an object key: a JSON string, a JS identifier, or a bare integer.
 *
 * @param s - Parse state
 * @returns The key as a string
 */
function parseKey(s: ParseState): string {
  const ch = peek(s);

  if (ch === '"') return parseString(s);

  const start = s.pos;

  if (/[$A-Z_a-z]/.test(ch)) {
    s.pos++;
    while (/[\w$]/.test(peek(s))) s.pos++;

    return s.text.slice(start, s.pos);
  }

  if (/\d/.test(ch)) {
    s.pos++;
    while (/\d/.test(peek(s))) s.pos++;

    return s.text.slice(start, s.pos);
  }

  return fail(s, "expected an object key");
}

/**
 * Parse a JSON string token, delegating escape handling to `JSON.parse`.
 *
 * @param s - Parse state
 * @returns The decoded string
 */
function parseString(s: ParseState): string {
  const start = s.pos;

  s.pos++; // consume opening quote

  while (s.pos < s.text.length) {
    const ch = s.text.charAt(s.pos);

    if (ch === "\\") {
      s.pos += 2; // skip the escaped character
      continue;
    }

    if (ch === '"') {
      s.pos++;

      return JSON.parse(s.text.slice(start, s.pos)) as string;
    }

    s.pos++;
  }

  return fail(s, "unterminated string");
}

/**
 * Parse a JSON number token, validating via `Number`.
 *
 * @param s - Parse state
 * @returns The numeric value
 */
function parseNumber(s: ParseState): number {
  const start = s.pos;

  while (/[\d+.Ee-]/.test(peek(s))) s.pos++;

  const slice = s.text.slice(start, s.pos);
  const value = Number(slice);

  if (Number.isNaN(value)) fail(s, `invalid number "${slice}"`);

  return value;
}

/**
 * Parse a bare keyword: `true`, `false`, or `null`.
 *
 * @param s - Parse state
 * @returns The keyword value
 */
function parseKeyword(s: ParseState): boolean | null {
  if (s.text.startsWith("true", s.pos)) {
    s.pos += 4;

    return true;
  }

  if (s.text.startsWith("false", s.pos)) {
    s.pos += 5;

    return false;
  }

  if (s.text.startsWith("null", s.pos)) {
    s.pos += 4;

    return null;
  }

  return fail(s, "unexpected token");
}

/**
 * Advance past any whitespace. Compact output has none, but tolerating it keeps
 * the parser usable on hand-written literals.
 *
 * @param s - Parse state
 */
function skipWs(s: ParseState): void {
  while (/\s/.test(peek(s))) s.pos++;
}

/**
 * The character at the cursor, or `""` past the end (avoids undefined handling).
 *
 * @param s - Parse state
 * @returns The current character, or an empty string at end of input
 */
function peek(s: ParseState): string {
  return s.text.charAt(s.pos);
}

/**
 * Throw a descriptive parse error anchored at the current position.
 *
 * @param s - Parse state
 * @param message - What went wrong
 * @returns Never returns (always throws)
 */
function fail(s: ParseState, message: string): never {
  throw new Error(`Invalid compact literal: ${message} at position ${s.pos}`);
}
