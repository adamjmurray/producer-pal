// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  firstWord,
  fixParses,
  type SyntaxFailure,
  zeroDenominatorHint,
} from "#src/notation/peggy-error-formatter.ts";
import { parse } from "../barbeat-parser.ts";
import { unmatchedBracket } from "./barbeat-brackets.ts";

/** A bar|beat line that failed to parse, split where the parse stopped. */
interface FailedLine {
  /** The failing line */
  line: string;
  /** The full notation text */
  source: string;
  /** 0-based offset in `source` where the parse stopped */
  offset: number;
  /** The whitespace-separated token the parse stopped in */
  token: string;
  /** Where that token starts in the line */
  tokenStart: number;
  /** The text of that token from the failure on */
  rest: string;
  /** The token's text before the failure */
  head: string;
  /** The token before it on the same line, or "" */
  previous: string;
}

// Runs only after a parse has already failed, so a hint can never change what
// parses. Each check returns a short fix, or null when it isn't sure — the
// generic error is better than a wrong fix. Every check looks at the token the
// parse stopped in, so it can't blame text elsewhere on the line. Regexes here
// must stay linear: notes have no length cap and this runs on the Max thread.
type MistakeCheck = (line: FailedLine) => string | null;

const CHECKS: MistakeCheck[] = [
  ({ token }) => zeroDenominatorHint(token),
  unclosedBracket,
  chordName,
  negativeBeat,
  missingBeat,
  badPositionSuffix,
  detachedToken,
  badBarCopy,
  commaBetweenItems,
  bareFraction,
  badValueToken,
];

// Checks for a failure at the start of an item, where Peggy only says which
// kinds of item could have started there.
const ITEM_CHECKS: MistakeCheck[] = [missingOctave, badBracket];

const CHORD_NAME =
  /^[A-G][#b♯♭]?(?:maj|min|dim|aug|sus|add|m|M|°|ø|\+|\d+(?:sus|add|maj|b\d|#\d)|\d*(?=\/))(?:maj|min|dim|aug|sus|add|m|M|[\d#♯♭b+°ø])*(?:\/[A-G][#b♯♭]?)?$/;

/**
 * Name the likely mistake on a bar|beat line that failed to parse.
 * @param failure - Where the parse stopped
 * @param atItemStart - Whether the parse failed where an item could start
 * @returns A short hint naming the fix, or null when no check is sure
 */
export function diagnoseBarbeatMistake(
  failure: SyntaxFailure,
  atItemStart: boolean,
): string | null {
  const failed = readFailedLine(failure);
  const checks = atItemStart ? [...CHECKS, ...ITEM_CHECKS] : CHECKS;

  for (const check of checks) {
    const hint = check(failed);

    if (hint != null) {
      return hint;
    }
  }

  return null;
}

/**
 * @param failure - Where the parse stopped
 * @returns The line's parts
 */
function readFailedLine(failure: SyntaxFailure): FailedLine {
  const { line, column, source, offset } = failure;
  const tokenStart = wordStart(line.slice(0, column));
  const previousStart = wordStart(line.slice(0, tokenStart).trimEnd());
  const head = line.slice(tokenStart, column);
  const rest = firstWord(line.slice(column));

  return {
    line,
    source,
    offset,
    token: head + rest,
    tokenStart,
    rest,
    head,
    previous: line.slice(previousStart, tokenStart).trim(),
  };
}

/**
 * @param text - A line up to some point
 * @returns Where the word it ends with starts
 */
function wordStart(text: string): number {
  return Math.max(text.lastIndexOf(" "), text.lastIndexOf("\t")) + 1;
}

/**
 * @param line - The failing line
 * @returns Hint for a `[` or `(` that is never closed, when the parse stopped
 *   at or after it
 */
function unclosedBracket(line: FailedLine): string | null {
  const unmatched = unmatchedBracket(line.source);

  if (unmatched == null || unmatched.offset > line.offset) {
    return null;
  }

  const close = unmatched.bracket === "[" ? "]" : ")";

  return `unclosed "${unmatched.bracket}" — add the missing "${close}".`;
}

/**
 * @param line - The failing line
 * @returns Hint for a negative beat (`1|-1`). Same text as the standalone
 *   position fields' error.
 */
function negativeBeat(line: FailedLine): string | null {
  const { token } = line;
  const beat = /^[1-9]\d*\|(-\d+(?:\.\d+)?)/.exec(token)?.[1];

  return beat == null
    ? null
    : `beats are 1-indexed: the downbeat is beat 1 (e.g. 1|1); for a pickup before it, offset from beat 1 (e.g. 1|1-n/4). Got beat ${beat}.`;
}

/**
 * @param line - The failing line
 * @returns Hint for a position with nothing after its pipe (`1|`)
 */
function missingBeat(line: FailedLine): string | null {
  const { token } = line;
  const bar = /^([1-9]\d*)\|(?!\d)/.exec(token)?.[1];

  return bar == null
    ? null
    : `a position needs a beat after the pipe, e.g. ${bar}|1.`;
}

/**
 * @param line - The failing line
 * @returns Hint for a malformed repeat (`1|1x`) or offset (`1|1+`)
 */
function badPositionSuffix(line: FailedLine): string | null {
  const { head, rest } = line;

  if (!/^[1-9]\d*\|/.test(head)) {
    return null;
  }

  if (/^[x@]/.test(rest)) {
    return "a repeat is <beat>x<count>@<step>, e.g. 1|1x4@n/4 = four notes a quarter note apart.";
  }

  return /^[+-]/.test(rest)
    ? "a beat offset is +n<fraction> or -n<fraction>, e.g. 1|1+n/12 = beat 1 + an eighth triplet."
    : null;
}

/**
 * @param line - The failing line
 * @returns Hint for a space inside one item (`n/4 d`, `1|1x4 @n/4`), when
 *   joining it to the item before makes the line parse. Not for a `-` or `.`
 *   fragment: joining can make a new range or decimal (`v100 -1` → v100-1).
 */
function detachedToken(line: FailedLine): string | null {
  const { line: text, token, tokenStart, head, previous } = line;

  if (head !== "" || previous === "" || /^[-.]/.test(token)) {
    return null;
  }

  const joined = previous + token;
  const fix = text.slice(0, tokenStart).trimEnd() + text.slice(tokenStart);

  return fixParses(parse, fix)
    ? `remove the space before "${token}": write "${joined}".`
    : null;
}

/**
 * @param line - The failing line
 * @returns Hint for a comma between notes or values (`C3,E3`)
 */
function commaBetweenItems(line: FailedLine): string | null {
  const { head, rest } = line;

  return !head.includes("|") && rest.startsWith(",")
    ? "separate notes and values with spaces — commas only join beats in a position (1|1,2,3)."
    : null;
}

/**
 * @param line - The failing line
 * @returns Hint for a note value without its `n` (`3/8`)
 */
function bareFraction(line: FailedLine): string | null {
  const { token } = line;
  const fix = `n${token}`;

  return /^\d*\/\d+[dt]?$/.test(token) && fixParses(parse, fix)
    ? `note values need the n prefix: ${fix}, not ${token}.`
    : null;
}

/**
 * @param line - The failing line
 * @returns Hint for a note with no octave (`C`, `Eb`). Not a `d`/`t` after a
 *   note value: that is a detached dotted or triplet suffix.
 */
function missingOctave(line: FailedLine): string | null {
  const { token, previous } = line;
  const fix = `${token}3`;

  if (/^[dt]$/.test(token) && /\/\d+$/.test(previous)) {
    return null;
  }

  return /^[A-Ga-g][#b♯♭]?$/.test(token) && fixParses(parse, fix)
    ? `a note needs an octave: ${fix}, not ${token} (C3 = middle C).`
    : null;
}

/**
 * @param line - The failing line
 * @returns Hint for a chord name (`Cmaj7`, `Am`, `G7/B`)
 */
function chordName(line: FailedLine): string | null {
  const { token } = line;

  return CHORD_NAME.test(token)
    ? `bar|beat has no chord names like ${token} — list the notes before a position, e.g. C3 E3 G3 1|1.`
    : null;
}

/**
 * @param line - The failing line
 * @returns Hint for a closed `[...]` or `(...)` whose contents don't parse
 */
function badBracket(line: FailedLine): string | null {
  const { rest } = line;

  if (rest.startsWith("[")) {
    return "a [ ] pattern holds one kind of value, space-separated: notes (C3 E3), velocities (v80 v100), durations (n/4 n/8) or probabilities (p0.5 p1).";
  }

  return rest.startsWith("(")
    ? "a ( ) chord holds notes with octaves, e.g. (C3 E3 G3)."
    : null;
}

/**
 * @param line - The failing line
 * @returns Hint for a malformed bar copy (`@`, `@x`)
 */
function badBarCopy(line: FailedLine): string | null {
  const { token } = line;

  return token.startsWith("@")
    ? "a bar copy is @<bar>= (copy the previous bar), @<bar>=<source bar>, or @clear, e.g. @2=1."
    : null;
}

/**
 * @param line - The failing line
 * @returns Hint for a malformed n/v/p value (`n4.5`, `v8.5`, `p-1`). A word
 *   that merely starts with n, v or p (`notes:`, `pp`) gets none.
 */
function badValueToken(line: FailedLine): string | null {
  const { token } = line;

  if (!/^[nvp][\d/.-]/.test(token)) {
    return null;
  }

  switch (token[0]) {
    case "n":
      return `a duration is n<fraction> or <count>bar: n/4 = quarter, n/8 = eighth, n3/8, 1bar. Got "${token}".`;
    case "v":
      return `a velocity is v<0-127> or a range like v80-100. Got "${token}".`;
    default:
      return `a probability is p<0-1>, e.g. p0.5. Got "${token}".`;
  }
}
