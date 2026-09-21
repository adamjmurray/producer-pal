// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Reading the `envelopes` param: one "<target>: <notation>" line per parameter.
// Every line is checked before the call touches anything, because a half-written
// batch of envelopes can't be cleaned up (ADR-0035).

import { parseEnvelopeNotation } from "#src/notation/barbeat/envelope/envelope-notation.ts";
import { errorMessage } from "#src/shared/error-message.ts";

/** A mixer parameter, as the remote script names it. */
const MIXER_TARGET = /^(?:volume|pan|send\d+)$/;

/** A Live object id, which is how a device parameter is named. */
const ID_TARGET = /^\d+$/;

/** Any meter parses the same syntax, so the check up front picks one. */
const SYNTAX_METER = { timeSigNumerator: 4, timeSigDenominator: 4 };

/** One line of the `envelopes` param. */
export interface EnvelopeLine {
  /** The parameter, as the call named it: an id, or volume/pan/send0.. */
  target: string;
  /** The points to write, or "" to clear the envelope */
  notation: string;
}

/**
 * Read the `envelopes` param into one line per parameter, refusing the whole
 * call if any line is malformed.
 * @param envelopes - The param as the caller wrote it
 * @returns One line per parameter, in the order they were written
 * @throws Error naming the bad line, before anything has been written
 */
export function parseEnvelopeLines(envelopes: string): EnvelopeLine[] {
  const lines = envelopes
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "")
    .map(readLine);

  if (lines.length === 0) {
    throw new Error(
      'envelopes is blank: write one "<target>: <notation>" line per parameter, or leave it out',
    );
  }

  const seen = new Set<string>();

  for (const { target } of lines) {
    if (seen.has(target)) {
      throw new Error(
        `envelopes names "${target}" twice: one line per parameter, since each replaces that parameter's whole envelope`,
      );
    }

    seen.add(target);
  }

  return lines;
}

// --- Helpers below main exports ---

/**
 * Read one line, checking its target and its notation.
 * @param line - The line, already trimmed
 * @returns The target and the notation it carries
 * @throws Error naming the line when either half is malformed
 */
function readLine(line: string): EnvelopeLine {
  const colon = line.indexOf(":");

  if (colon < 0) {
    throw new Error(
      `Invalid envelopes line "${line}": expected "<target>: <notation>", like "472: 1|1 0 ~ 3|1 1"`,
    );
  }

  const target = line.slice(0, colon).trim();
  const notation = line.slice(colon + 1).trim();

  if (!ID_TARGET.test(target) && !MIXER_TARGET.test(target)) {
    throw new Error(
      `Invalid envelopes target "${target}" in "${line}": expected a parameter id, or volume, pan, send0..`,
    );
  }

  if (notation !== "") {
    checkNotation(line, notation);
  }

  return { target, notation };
}

/**
 * Check a line's notation parses, in a meter of its own: the syntax is the same
 * in every meter, and the clip whose meter counts hasn't been reached yet.
 * @param line - The whole line, for the error
 * @param notation - The notation half of it
 * @throws Error naming the line when the notation is malformed
 */
function checkNotation(line: string, notation: string): void {
  try {
    parseEnvelopeNotation(notation, SYNTAX_METER);
  } catch (error) {
    throw new Error(
      `Invalid envelopes line "${line}": ${errorMessage(error)}`,
      { cause: error },
    );
  }
}
