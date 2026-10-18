// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Reading a clip's notes back for grading, in midi-json so the check never
 * touches the notation the model happened to write in.
 */

import { interpretMidiJson } from "#src/notation/midi-json/midi-json-notation.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { type EvalAssertion } from "../../../types.ts";
import { TOOL_READ_CLIP } from "./clip-tool-constants.ts";

/**
 * Parse a read-clip result (read back in midi-json) into notes.
 * @param result - The ppal-read-clip result
 * @returns The clip's notes, or null when missing or unparseable
 */
export function readbackNotes(result: unknown): NoteEvent[] | null {
  const clip = result as { notes?: unknown };

  if (typeof clip.notes !== "string") {
    return null;
  }

  try {
    return interpretMidiJson(clip.notes);
  } catch {
    return null;
  }
}

/**
 * A state assertion that grades a clip's notes, read back as midi-json.
 * @param path - The clip's path
 * @param problem - What's wrong with the notes, or null when they're right
 * @param label - Prefix for the failure explanation
 * @returns State assertion over the clip's notes
 */
export function assertMidiJsonNotes(
  path: string,
  problem: (notes: NoteEvent[]) => string | null,
  label?: string,
): EvalAssertion {
  const prefix = label == null ? "" : `${label}: `;

  return {
    type: "state",
    tool: TOOL_READ_CLIP,
    args: { path, include: ["notes"] },
    notation: "midi-json",
    expect: (result: unknown): boolean => {
      const notes = readbackNotes(result);

      return notes != null && problem(notes) == null;
    },
    explain: (result: unknown): string => {
      const notes = readbackNotes(result);

      return notes == null
        ? `${prefix}clip notes missing or not parseable as midi-json`
        : `${prefix}${problem(notes) ?? "ok"}`;
    },
  };
}
