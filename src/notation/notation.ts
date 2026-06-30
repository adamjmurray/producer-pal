// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Notation router: dispatches the interpret (string → notes) and format
 * (notes → string) seams to a specific notation. `barbeat` (the default) is the
 * bar|beat DSL; `midi-json` is a JSON array of CodeNote objects; `stark` is an
 * ultra-minimal notation aimed at small/weak models (interpret-only — there is
 * no Stark serializer, so the read path falls back to bar|beat).
 *
 * Selection is a single global setting (`config.notation`, default `barbeat`),
 * controlled via the device UI / `POST /config` and threaded to the clip tools
 * as `context.notation`. {@link resolveNotation} just fills in the default when
 * no notation is supplied. The notation is fully independent of small-model
 * mode (which only trims tool schemas).
 */

import { formatNotation as formatBarbeat } from "#src/notation/barbeat/barbeat-format-notation.ts";
import { interpretNotation as interpretBarbeat } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";
import { type FormatOptions } from "#src/notation/barbeat/serializer/barbeat-serializer.ts";
import {
  formatMidiJson,
  interpretMidiJson,
} from "#src/notation/midi-json/midi-json-notation.ts";
import { interpretNotation as interpretStark } from "#src/notation/stark/stark-interpreter.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { DEFAULT_NOTATION, type Notation } from "#src/shared/notation.ts";

/** Options for {@link interpretNotation}; `notation` selects the parser. */
export interface InterpretNotationOptions {
  /** Notation to use; defaults to {@link DEFAULT_NOTATION} when omitted. */
  notation?: Notation;
  beatsPerBar?: number;
  timeSigNumerator?: number;
  timeSigDenominator?: number;
  /** Scale string like "C Major" (Stark only). */
  scale?: string;
}

/** Options for {@link formatNotation}; `notation` selects the serializer. */
export interface FormatNotationOptions extends FormatOptions {
  /** Notation to use; defaults to {@link DEFAULT_NOTATION} when omitted. */
  notation?: Notation;
}

/**
 * Resolve the effective notation, filling in the default (bar|beat) when no
 * notation is supplied.
 *
 * @param notation - The configured notation, if any
 * @returns The notation to use
 */
export function resolveNotation(notation: Notation | undefined): Notation {
  return notation ?? DEFAULT_NOTATION;
}

/**
 * Interpret a notation string into note events, routing on the resolved
 * notation (see {@link resolveNotation}).
 *
 * @param input - Notation string (bar|beat text, a MIDI JSON array, or Stark)
 * @param options - Interpretation options including the notation to use
 * @returns Array of note events
 */
export function interpretNotation(
  input: string,
  options: InterpretNotationOptions = {},
): NoteEvent[] {
  const { notation, scale, ...rest } = options;
  const resolved = resolveNotation(notation);

  if (resolved === "midi-json") {
    return interpretMidiJson(input, rest);
  }

  if (resolved === "stark") {
    return interpretStark(input, { ...rest, scale });
  }

  return interpretBarbeat(input, rest);
}

/**
 * Serialize note events into a notation string, routing on the resolved
 * notation. Stark has no serializer, so it falls back to bar|beat.
 *
 * @param notes - Note events to serialize
 * @param options - Format options including the notation to use
 * @returns Notation string, or "" when there are no notes
 */
export function formatNotation(
  notes: NoteEvent[] | null | undefined,
  options: FormatNotationOptions = {},
): string {
  const { notation, ...rest } = options;
  const resolved = resolveNotation(notation);

  if (resolved === "midi-json") {
    return formatMidiJson(notes ?? [], rest);
  }

  // bar|beat handles both barbeat and the stark fallback (no Stark serializer).
  return formatBarbeat(notes, rest);
}
