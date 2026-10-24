// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * The clips the note-count edit scenarios start from, and the outcome checks
 * that go with them. The drum and lead notes are copied from
 * `evals/live-sets/basic-with-drum-and-lead-clips-spec.md`; keep them in step.
 */

import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";
import { type EvalAssertion } from "../../../../types.ts";
import { getCreatedClip, slotToPath } from "../../helpers/clip-turn-readers.ts";
import {
  mergeProblem,
  repeatProblem,
  rollProblem,
  splitProblem,
} from "./note-ops-problems.ts";
import { noteOpOutcome } from "./note-ops-assertions.ts";

/** Live Set with a drum clip (t0/s0) and a lead clip (t3/s0) already in it. */
export const LIVE_SET = "basic-with-drum-and-lead-clips";

/** Empty 4-track Live Set for scenarios that create the clip they edit. */
export const SPLIT_LIVE_SET = "basic-midi-4-track";

export const DRUM_CLIP = interpretNotation(`v100 n/16 C1 1|1x8@n/4
n/8 Ab1 1|1x12 n/16 Ab1 2|3x8
E1 1|2x4@n/2`);

export const LEAD_CLIP = interpretNotation(`v100 n/4 A2 1|1
C3 1|2
D3 1|3
E3 1|4
n/8 F3 2|1
D3 2|1.5,3
E3 2|2
C3 2|2.5,3.5
B2 2|4
G2 2|4.5`);

/** The four quarter notes the repeat scenario has the model create. */
const REPEAT_CLIP = interpretNotation("n/4 C3 1|1 E3 1|2 G3 1|3 B3 1|4");

/** A held note to cut: its name, length in beats, and the cuts (clip beats). */
interface HeldNote {
  note: string;
  length: number;
  cuts: number[];
}

/** 4-bar arrangement clip: cut at arrangement bars 7 and 8 (clip bar 3 and 4). */
export const ARRANGEMENT_HELD: HeldNote = {
  note: "C2",
  length: 16,
  cuts: [8, 12],
};

/** 2-bar session clip: cut at bar 1 beat 3 and bar 2 beat 1. */
export const SESSION_HELD: HeldNote = { note: "C3", length: 8, cuts: [2, 4] };

/**
 * Gate on the drum clip ending as one sustained note per lane.
 *
 * @returns The outcome assertion
 */
export function drumLanesMerged(): EvalAssertion {
  return noteOpOutcome({
    target: () => ({ path: slotToPath("0/0") }),
    check: (after) => mergeProblem(DRUM_CLIP, after),
  });
}

/**
 * Gate on every lead note having become four equal sub-notes.
 *
 * @returns The outcome assertion
 */
export function leadNotesRolled(): EvalAssertion {
  return noteOpOutcome({
    target: () => ({ path: slotToPath("3/0") }),
    check: (after) => rollProblem(LEAD_CLIP, after, 4),
  });
}

/**
 * Gate on the created 2-bar clip holding each note plus a copy an eighth later,
 * with the clip no longer.
 *
 * @param createTurn - Turn whose create-clip call made the clip
 * @returns The outcome assertion
 */
export function notesEchoedAnEighthLater(createTurn: number): EvalAssertion {
  return noteOpOutcome({
    target: (turns) => ({ id: getCreatedClip(turns, createTurn).id ?? "" }),
    check: (after) => repeatProblem(REPEAT_CLIP, after, 0.5),
    length: "2bar",
  });
}

/**
 * Gate on a created clip's held note ending up cut at exactly the asked places.
 *
 * @param createTurn - Turn whose create-clip call made the clip
 * @param held - The held note and where it should be cut
 * @returns The outcome assertion
 */
export function heldNoteCut(createTurn: number, held: HeldNote): EvalAssertion {
  const pitch = interpretNotation(`${held.note} 1|1`)[0]?.pitch ?? -1;

  return noteOpOutcome({
    target: (turns) => ({ id: getCreatedClip(turns, createTurn).id ?? "" }),
    check: (after) => splitProblem(after, { pitch, ...held }),
  });
}
