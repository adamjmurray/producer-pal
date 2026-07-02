// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Notation-matrix scenario factory: expand ONE notation-neutral spec (a musical
 * intent + the exact notes it should produce) into an apples-to-apples scenario
 * per notation. Every variant sends the SAME prompt and grades against the SAME
 * expected notes; the only thing that differs per variant is `config.notation` —
 * which notation head the model is taught. That makes the pass rates directly
 * comparable across bar|beat / abstark / stark / midi-json (the point: is
 * abstark better than stark, and do the small-model notations beat bar|beat
 * under `--small-model`?).
 *
 * Grading is notation-INDEPENDENT and deterministic: after the model's turn the
 * grader flips the server to midi-json (a `notation` override on the state
 * assertion) and reads the clip back as raw `{p,t,d}` objects, then compares to
 * the expected notes. No grammar interpretation, no per-notation read-back
 * branch (the old stark→bar|beat fallback is gone) — every variant is graded by
 * the exact same code path regardless of which notation the model wrote in.
 * There is no LLM judge: the state assertion is the sole gate.
 *
 * A spec lists only the notations its target is exactly representable in. Stark
 * scale-snaps letters, has no accidentals or octave numbers, and no sub-quarter
 * durations, so specs needing exact chromatic pitch or eighth/sixteenth
 * durations omit it (see notation-matrix-scenarios.ts).
 */

import { parseToolResult } from "#evals/chat/mcp.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { NOTATIONS, type Notation } from "#src/shared/notation.ts";
import { type EvalAssertion, type EvalScenario } from "../../../types.ts";
import {
  clearSessionSlots,
  type ExpectedNote,
  MSG_CONNECT,
  notesMatch,
  TOOL_CONNECT,
  TOOL_READ_CLIP,
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
  /** Expected time signature, e.g. "6/8"; also the grading read-back meter. */
  meter: string;
  /** Exact notes the clip must contain (pitch + start, optional duration). */
  expected: ExpectedNote[];
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
      messages: [MSG_CONNECT, spec.prompt],
      setup: (mcpClient) => clearSessionSlots(mcpClient, [slot]),
      assertions: [
        { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
        { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },
        midiJsonClipStateAssertion(slot, spec.meter, spec.expected),
        { type: "token_usage", metric: "inputTokens", maxTokens: 80_000 },
      ],
    }),
  );
}

/**
 * Grade a clip deterministically by reading it back as midi-json and comparing
 * the raw `{p,t,d}` objects to `expected`. The `notation: "midi-json"` override
 * flips the server to midi-json before the read (via POST /config, which merges
 * — the scenario's finally-block resetConfig restores defaults), so the notes
 * come back as a plain array we parse directly — no notation grammar involved,
 * whatever the model wrote in. Fails closed: a wrong/absent time signature,
 * missing notes, or an unparseable payload all return false.
 *
 * @param slot - Session clip slot to read (trackIndex/sceneIndex)
 * @param meter - Expected time signature (e.g. "4/4"), also gates the read
 * @param expected - Exact notes the clip must contain (pitch + start, optional
 *   duration); midi-json `t`/`d` are musical beats (a quarter = 1 beat in x/4),
 *   which equal Ableton quarter beats in the 4/4 matrix scenarios
 * @returns State assertion
 */
function midiJsonClipStateAssertion(
  slot: string,
  meter: string,
  expected: ExpectedNote[],
): EvalAssertion {
  return {
    type: "state",
    tool: TOOL_READ_CLIP,
    args: { slot, include: ["notes", "timing"] },
    notation: "midi-json",
    expect: (result: unknown): boolean => {
      const clip = result as { notes?: unknown; timeSignature?: string };

      if (clip.timeSignature !== meter || clip.notes == null) return false;

      let raw: unknown = clip.notes;

      if (typeof raw === "string") {
        try {
          raw = parseToolResult(raw);
        } catch {
          return false; // unparseable midi-json payload
        }
      }

      if (!Array.isArray(raw)) return false;

      const events: NoteEvent[] = raw.map((n) => {
        const o = (n ?? {}) as { p?: number; t?: number; d?: number };

        return {
          pitch: Number(o.p),
          start_time: Number(o.t),
          duration: Number(o.d),
          velocity: 0,
        };
      });

      return notesMatch(events, expected);
    },
  };
}
