// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  editDistance,
  firstWord,
  gluedAccidentalHint,
  fixParses,
  type ExpectedItem,
  formatSyntaxError,
  invisibleCharHint,
  isUnclosed,
  type SyntaxFailure,
} from "#src/notation/peggy-error-formatter.ts";
import { type PeggySyntaxError } from "#src/notation/peggy-parser-types.ts";
import { MIDI_TO_DRUM_NAME } from "#src/notation/stark/stark-config.ts";
import { parse } from "./stark-parser.ts";

/** Line types other than drums (grammar rules `MelodyBassLineType`, `ChordsSection`). */
export const STARK_LINE_TYPES = ["melody", "bass", "chords"];

// Long drum names; the grammar also takes two-letter aliases (bd, sd, hh, …).
const HEADERS = [...STARK_LINE_TYPES, ...Object.values(MIDI_TO_DRUM_NAME)];

const FIX_MAX_LENGTH = 32;

// A section header: a word, an optional /N default, then ":".
const SECTION_HEADER = /(?:^|\s)([^\s:/]+)[ \t]*(?:\/[^\s:]*)?[ \t]*:/g;

const LINE_CONTENT = {
  drum: "a drum line holds X (hit), ^ (accent), x (soft) and z (rest), each with an optional /N, plus | bar lines.",
  pitched:
    "a melody or bass line holds notes (C, Eb, C4, C'/8!), [chords], z (rest) and | bar lines.",
  chords:
    "a chords line holds chord symbols (Cm7, G7/B), [voicings], z (rest) and | bar lines.",
};

/** A Stark line that failed to parse, split where the parse stopped. */
interface FailedLine {
  line: string;
  /** The line up to where the parse failed */
  before: string;
  /** The whitespace-separated text where the parse failed */
  rest: string;
  /** Literal text Peggy would have accepted there */
  literals: Set<string>;
}

// Runs only after a parse has already failed, so a hint can never change what
// parses. Each check returns a short fix, or null when it isn't sure.
const CHECKS: Array<(failed: FailedLine) => string | null> = [
  gluedAccidental,
  unclosedChord,
  badDuration,
  badRepeat,
  missingColon,
  unknownHeader,
  badContent,
];

/**
 * Format a Stark parse failure: where it failed, the text there, and the
 * likely fix.
 * @param error - The Peggy SyntaxError
 * @param source - The full Stark string that failed
 * @returns A message naming the position and the fix
 */
export function formatStarkSyntaxError(
  error: PeggySyntaxError,
  source: string,
): string {
  return formatSyntaxError(
    "Stark notation parse error",
    error,
    source,
    describe,
  );
}

/**
 * @param failure - Where the parse stopped
 * @returns The likely fix, or what the grammar would have accepted
 */
function describe(failure: SyntaxFailure): string {
  const { line, column, expected } = failure;
  const failed: FailedLine = {
    line,
    before: line.slice(0, column),
    rest: firstWord(line.slice(column)),
    literals: literalsOf(expected),
  };

  for (const check of [
    () => invisibleCharHint(line.slice(column)),
    ...CHECKS,
  ]) {
    const hint = check(failed);

    if (hint != null) {
      return hint;
    }
  }

  return failed.rest === ""
    ? "the line ended too soon."
    : `unexpected "${failed.rest}".`;
}

/**
 * @param expected - Peggy's expected items
 * @returns The literal texts among them
 */
function literalsOf(expected: ExpectedItem[]): Set<string> {
  const literals = new Set<string>();

  for (const item of expected) {
    if (item.type === "literal" && item.text != null) {
      literals.add(item.text);
    }
  }

  return literals;
}

/**
 * @param failed - The failing line
 * @returns Hint for an accidental glued after an octave or octave mark, in a
 *   melody, bass or chords line or a drum pitch header (`A3b: X`) — not in a
 *   drum line, where no note could have parsed
 */
function gluedAccidental(failed: FailedLine): string | null {
  const { line, before } = failed;

  return gluedAccidentalHint(line, before.length, true, (start, end) => {
    // A drum pitch header: the pitch, an optional /N, then ":".
    if (/^(?:\/[^\s:]*)?[ \t]*:/.test(line.slice(end))) {
      return "header";
    }

    return STARK_LINE_TYPES.includes(lastHeader(line.slice(0, start)))
      ? "note"
      : null;
  });
}

/**
 * @param text - A line up to some point
 * @returns The last section header in it, lowercased, or ""
 */
function lastHeader(text: string): string {
  // One line can hold several sections (`melody: C D kick: X`).
  return [...text.matchAll(SECTION_HEADER)].at(-1)?.[1]?.toLowerCase() ?? "";
}

/**
 * @param failed - The failing line
 * @returns Hint for a `[` chord with no closing `]`
 */
function unclosedChord(failed: FailedLine): string | null {
  const { line, literals } = failed;

  return literals.has("]") && isUnclosed(line, "[", "]")
    ? `unclosed "[" — add the missing "]".`
    : null;
}

/**
 * @param failed - The failing line
 * @returns Hint for a duration that isn't a note value (`/3`) or has two
 *   modifiers (`/4..`)
 */
function badDuration(failed: FailedLine): string | null {
  const { before, rest, literals } = failed;

  if (literals.has("16")) {
    return `a duration is /1, /2, /4, /8 or /16, with an optional . (dotted) or t (triplet). Got "/${rest.replace(/:.*/, "")}".`;
  }

  return /\/(16|8|4|2|1)[.t]$/.test(before) && /^[.t]/.test(rest)
    ? "a duration takes one modifier at most: /4. (dotted) or /4t (triplet)."
    : null;
}

/**
 * @param failed - The failing line
 * @returns Hint for a repeat without a count (`X*`, `C*0`)
 */
function badRepeat(failed: FailedLine): string | null {
  const { before } = failed;

  return before.endsWith("*")
    ? "a repeat is *N with N of 1 or more, e.g. X*4."
    : null;
}

/**
 * @param failed - The failing line
 * @returns Hint for a line header with no `:` (`melody C D E`)
 */
function missingColon(failed: FailedLine): string | null {
  const { line, before, literals } = failed;

  if (!literals.has(":") || literals.has("|")) {
    return null;
  }

  const fix = `${before.trimEnd()}: ${line.slice(before.length).trimStart()}`;

  return fixParses(parse, fix)
    ? `missing ":" after the line header — write "${shorten(fix)}".`
    : `expected ":" after the line header.`;
}

/**
 * @param failed - The failing line
 * @returns Hint for an unknown line header (`melod:`, `drums:`)
 */
function unknownHeader(failed: FailedLine): string | null {
  const { line, before, rest, literals } = failed;

  if (!literals.has("melody") || literals.has("|")) {
    return null;
  }

  const word = firstWord(rest, /[\s:/]/);
  const suggestion = nearestHeader(word);

  if (suggestion != null) {
    const fix = before + suggestion + line.slice(before.length + word.length);

    if (fixParses(parse, fix)) {
      return `unknown line header "${word}" — did you mean "${suggestion}"?`;
    }
  }

  return `unknown line header "${word}" — start each line with melody:, bass:, chords:, a drum (kick:, snare:, hihat:, …) or a pitch (C1:).`;
}

/**
 * @param failed - The failing line
 * @returns What this kind of line holds, when the parse stopped inside it
 */
function badContent(failed: FailedLine): string | null {
  const { before, rest, literals } = failed;

  // The grammar refuses an accidental after an octave (`C7#9`) mid-token,
  // where it doesn't list `|` among what it would accept.
  const afterOctave = /\d$/.test(before) && /^[#b♯♭]/.test(rest);

  if (!literals.has("|") && !afterOctave) {
    return null;
  }

  const header = lastHeader(before);
  const kind =
    header === "chords"
      ? "chords"
      : STARK_LINE_TYPES.includes(header)
        ? "pitched"
        : "drum";

  // A line can always end, so the parse never stops inside one at its end.
  return `${LINE_CONTENT[kind]} Got "${rest}".`;
}

/**
 * @param word - A mistyped header
 * @returns The one header it is close to, or null
 */
function nearestHeader(word: string): string | null {
  const lower = word.toLowerCase();
  const limit = lower.length <= 4 ? 1 : 2;
  const close = HEADERS.filter(
    (header) => editDistance(lower, header) <= limit,
  );

  return lower.length >= 3 && close.length === 1 ? (close[0] as string) : null;
}

/**
 * @param fix - A suggested line
 * @returns The line, cut short when long
 */
function shorten(fix: string): string {
  return fix.length > FIX_MAX_LENGTH ? `${fix.slice(0, FIX_MAX_LENGTH)}…` : fix;
}
