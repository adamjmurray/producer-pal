// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Notation-matrix scenario factory: expand ONE notation-neutral spec (a musical
 * intent + the exact notes it should produce) into an apples-to-apples scenario
 * per notation. Every variant sends the SAME prompt and grades against the SAME
 * expected notes; only two things differ per variant — `config.notation` (which
 * head the model is taught and which notation read-clip returns) and the
 * interpreter used to re-read the clip. That makes the pass rates directly
 * comparable across bar|beat / abstark / stark / midi-json (the point: is
 * abstark better than stark, and do the small-model notations beat bar|beat
 * under `--small-model`?).
 *
 * Deliberately notation-AGNOSTIC grading: the prompt is pure musical intent (no
 * notation syntax), and the check runs on re-interpreted `NoteEvent`s
 * (pitch/start[/duration]), never on the notation string. Variants carry NO
 * `requires`, so they run at BOTH skill tiers — the whole point is to measure
 * each notation under `--small-model` as well as standard.
 *
 * A spec lists only the notations its target is exactly representable in. Stark
 * scale-snaps letters, has no accidentals or octave numbers, and no sub-quarter
 * durations, so specs needing exact chromatic pitch or eighth/sixteenth
 * durations omit it (see notation-matrix-scenarios.ts).
 */

import { interpretNotation } from "#src/notation/notation.ts";
import { NOTATIONS, type Notation } from "#src/shared/notation.ts";
import { type EvalScenario } from "../../../types.ts";
import {
  clearSessionSlots,
  clipStateAssertion,
  type ExpectedNote,
  MSG_CONNECT,
  type NotationInterpreter,
  notesMatch,
  TOOL_CONNECT,
} from "../clip-scenario-helpers.ts";

/** create-clip tool name (turn-1 create assertion). */
const TOOL_CREATE_CLIP = "ppal-create-clip";

/** Shared 4-track set: track 0 = Drums (Drum Rack), track 3 = Lead (melodic). */
export const MATRIX_LIVE_SET = "basic-midi-4-track";

/** Lead track index in basic-midi-4-track (melodic → pitched serialization). */
export const LEAD_TRACK = 3;

/** Drums track index in basic-midi-4-track (Drum Rack → drum serialization). */
export const DRUMS_TRACK = 0;

/** A notation-neutral scenario definition, expanded per notation by the factory. */
export interface NotationNeutralSpec {
  /** Base id; each variant becomes `${baseId}-${notation}`. */
  baseId: string;
  /** Base description; the notation is appended per variant. */
  description: string;
  /** Notation-neutral user turn — pure musical intent, no notation syntax. */
  prompt: string;
  /** Track to create the clip on (LEAD_TRACK or DRUMS_TRACK). */
  track: number;
  /** Expected time signature, e.g. "4/4"; also the interpret meter. */
  meter: string;
  /** Exact notes the clip must contain (pitch + start, optional duration). */
  expected: ExpectedNote[];
  /** Advisory LLM-judge prompt (notation-neutral). */
  judgePrompt: string;
  /** Notations to emit a variant for. Defaults to every notation. Pass a subset
   *  when the target isn't exactly representable in some notation (e.g. omit
   *  "stark" for chromatic pitch or sub-quarter durations). */
  notations?: Notation[];
  /** Live Set (defaults to basic-midi-4-track). */
  liveSet?: string;
}

/**
 * Expand a notation-neutral spec into one create-clip scenario per notation.
 *
 * @param spec - The notation-neutral scenario definition
 * @returns One eval scenario per listed notation (id `${baseId}-${notation}`)
 */
export function notationNeutralScenarios(
  spec: NotationNeutralSpec,
): EvalScenario[] {
  const notations = spec.notations ?? [...NOTATIONS];
  const slot = `${spec.track}/0`;

  return notations.map(
    (notation): EvalScenario => ({
      id: `${spec.baseId}-${notation}`,
      description: `${spec.description} (${notation})`,
      kind: "capability",
      liveSet: spec.liveSet ?? MATRIX_LIVE_SET,
      config: { notation },
      judgeAdvisory: true,
      messages: [MSG_CONNECT, spec.prompt],
      setup: (mcpClient) => clearSessionSlots(mcpClient, [slot]),
      assertions: [
        { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
        { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },
        clipStateAssertion(
          slot,
          spec.meter,
          (events) => notesMatch(events, spec.expected),
          gradingInterpreter(notation),
        ),
        { type: "llm_judge", prompt: spec.judgePrompt },
        { type: "token_usage", metric: "inputTokens", maxTokens: 80_000 },
      ],
    }),
  );
}

/**
 * The interpreter that matches what read-clip EMITS for a notation. read-clip
 * serializes via the same notation, so it round-trips through that notation's
 * interpreter — EXCEPT stark, which has no serializer and reads back as bar|beat
 * (see notation.ts `formatNotation` fallback), so stark read-backs are graded
 * with the bar|beat interpreter.
 *
 * @param notation - The notation the scenario ran under
 * @returns A {@link NotationInterpreter} for the read-back notes
 */
function gradingInterpreter(notation: Notation): NotationInterpreter {
  const readback: Notation = notation === "stark" ? "barbeat" : notation;

  return (notes, opts) =>
    interpretNotation(notes, { ...opts, notation: readback });
}
