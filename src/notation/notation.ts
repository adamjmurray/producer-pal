// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Notation router: dispatches the interpret (string → notes) and format
 * (notes → string) seams to a specific notation. `barbeat` (the default) is the
 * bar|beat DSL; `midi-json` is a compact JS-literal array of note objects;
 * `stark` is a literal, round-trippable notation with a real serializer and an
 * event-based drum syntax.
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
import { formatNotation as formatStark } from "#src/notation/stark/stark-serializer.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { DEFAULT_NOTATION, type Notation } from "#src/shared/notation.ts";

/** Options for {@link interpretNotation}; `notation` selects the parser. */
export interface InterpretNotationOptions {
  /** Notation to use; defaults to {@link DEFAULT_NOTATION} when omitted. */
  notation?: Notation;
  beatsPerBar?: number;
  timeSigNumerator?: number;
  timeSigDenominator?: number;
  /**
   * Keep velocity-0 delete markers in the result instead of resolving them
   * within this string's own notes. Only MIDI JSON produces them (bar|beat
   * resolves its inline `v0` while parsing, stark has no delete syntax), and the
   * caller MUST run `applyV0Deletions` before writing — Live rejects velocity 0.
   */
  keepV0Deletes?: boolean;
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
  const { notation, ...rest } = options;
  const resolved = resolveNotation(notation);

  if (resolved === "midi-json") {
    return interpretMidiJson(input, rest);
  }

  if (resolved === "stark") {
    return interpretStark(input, rest);
  }

  return interpretBarbeat(input, rest);
}

/**
 * Serialize note events into a notation string, routing on the resolved
 * notation.
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

  if (resolved === "stark") {
    return formatStark(notes ?? [], { drumMode: rest.drumMode });
  }

  return formatBarbeat(notes, rest);
}
