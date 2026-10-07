// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Assertions for the note-count edit scenarios. The outcome is read back from
 * the clip and gates; whether the model used a transform is a separate check
 * (a signal, unless the prompt asked for one).
 */

import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { type EvalAssertion, type EvalTurnResult } from "../../../../types.ts";
import {
  TOOL_READ_CLIP,
  TOOL_UPDATE_CLIP,
} from "../../helpers/clip-tool-constants.ts";
import { getTransforms } from "../../helpers/clip-turn-readers.ts";

/** What to read back: the clip, and (optionally) the length it must keep. */
interface OutcomeSpec {
  /** read-clip args that pick the clip, given the finished run. */
  target: (turns: EvalTurnResult[]) => Record<string, unknown>;
  /** Verdict over the clip's notes: null when right, else the reason. */
  check: (after: NoteEvent[]) => string | null;
  /** Length string the clip must still have (e.g. "2bar"). */
  length?: string;
}

/**
 * Gate on the clip's notes after the edit, read back by the grader.
 *
 * @param spec - Which clip to read and what its notes must be
 * @returns A state assertion that explains a failure
 */
export function noteOpOutcome(spec: OutcomeSpec): EvalAssertion {
  return {
    type: "state",
    tool: TOOL_READ_CLIP,
    args: (turns) => ({ ...spec.target(turns), include: ["notes", "timing"] }),
    notation: "barbeat",
    expect: (result) => outcomeProblem(result, spec) == null,
    explain: (result) => outcomeProblem(result, spec) ?? "",
  };
}

/**
 * Why a read-back clip is wrong, or null when it is right.
 *
 * @param result - Parsed read-clip result
 * @param spec - The expectations
 * @returns The reason, or null
 */
function outcomeProblem(result: unknown, spec: OutcomeSpec): string | null {
  const clip = result as {
    notes?: string;
    timeSignature?: string;
    length?: string;
  };

  if (!clip.notes) {
    return "the clip has no notes";
  }

  if (spec.length != null && clip.length !== spec.length) {
    return `clip length should stay ${spec.length}, is ${clip.length}`;
  }

  const [num, den] = (clip.timeSignature ?? "4/4").split("/").map(Number);

  try {
    return spec.check(
      interpretNotation(clip.notes, {
        timeSigNumerator: num ?? 4,
        timeSigDenominator: den ?? 4,
      }),
    );
  } catch {
    return "the clip's notes did not parse";
  }
}

/**
 * Check the update-clip call in `turn` passed a transform matching `pattern`.
 * Gates unless wrapped with `asSignal`.
 *
 * @param turn - Turn that edited the clip
 * @param pattern - What the transforms string must contain
 * @param label - Short name for the report (e.g. "split()")
 * @returns A custom assertion
 */
export function usedTransform(
  turn: number,
  pattern: RegExp,
  label: string,
): EvalAssertion {
  return {
    type: "custom",
    description: `used a ${label} transform`,
    assert: (turns) => {
      const transforms = getTransforms(turns, turn, TOOL_UPDATE_CLIP);

      if (!pattern.test(transforms)) {
        throw new Error(`expected ${label}: ${transforms.slice(0, 120)}`);
      }

      return true;
    },
  };
}
