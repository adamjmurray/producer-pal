// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenarios for preTransforms reach-for in SMALL MODEL MODE.
 *
 * Requires Ableton (agentic — drives a live model against Live).
 *
 * In small-model mode `transforms` is excluded from update-clip but
 * `preTransforms` is KEPT, with a shorthand-only description (`1|1-2|1: v0`
 * clears a region, `v0` clears all, `C1: C4` remaps a drum lane). These
 * scenarios run with `config.smallModelMode = true` and measure whether a
 * model under the reduced schema reaches for the preTransforms shorthand
 * rather than contaminating the `notes` arg with clear/remap intent.
 *
 * The cross-contamination failure (both directions): putting the *clear* into
 * `notes` (e.g. emitting `v0` notes alongside new content) instead of
 * `preTransforms`, or putting *new content* into `preTransforms`. Classifier
 * tags `pretransforms-shorthand` (correct), `transforms-direct` (a model with
 * the full schema — i.e. not actually under small-model mode — using the
 * `transforms` param for the same remap/clear, equally valid), `two-call`,
 * `notes-contamination` (the failure), or `unrecognized`.
 *
 * Success signal for the broader effort: if SLM reliably reaches preTransforms
 * shorthand here, the small-model skill can shed its longhand clear/remap
 * guidance (net-shrink) — see the eval validation tracker.
 */

import { getToolCalls } from "../../../assertions/index.ts";
import {
  type EvalAssertion,
  type EvalScenario,
  type EvalTurnResult,
} from "../../../types.ts";
import {
  assertNotesRead,
  MSG_CONNECT,
  READ_DRUM_NOTES,
  TOOL_CONNECT,
  TOOL_UPDATE_CLIP,
} from "../clip-scenario-helpers.ts";

const LIVE_SET = "basic-with-drum-and-lead-clips";
const SLM_CONFIG = { smallModelMode: true };

type SlmPath =
  | "pretransforms-shorthand"
  | "transforms-direct"
  | "notes-contamination"
  | "two-call"
  | "unrecognized";

/**
 * Classify how a small model performed a clear/remap edit at `turn`.
 *
 * @param turns - All turn results
 * @param turn - Turn index of the edit
 * @returns the SLM path classification plus evidence
 */
function classifySlmPath(
  turns: EvalTurnResult[],
  turn: number,
): { path: SlmPath; evidence: string } {
  const calls = getToolCalls(turns, turn).filter(
    (c) => c.name === TOOL_UPDATE_CLIP,
  );

  if (calls.length === 0) {
    return { path: "unrecognized", evidence: "no update-clip calls" };
  }

  const reach = calls.find(
    (c) =>
      c.args.preTransforms != null &&
      String(c.args.preTransforms).trim() !== "",
  );

  if (reach) {
    return {
      path: "pretransforms-shorthand",
      evidence: `preTransforms: ${String(reach.args.preTransforms).slice(0, 80)}`,
    };
  }

  // A model that still has the full schema (the scenario run outside actual
  // small-model mode) reaches for the `transforms` param for the same
  // remap/clear. That is a correct, recognizable edit — just not the
  // SLM-specific preTransforms shorthand — so it must not be tagged
  // "unrecognized".
  const transformsEdit = calls.find(
    (c) => c.args.transforms != null && String(c.args.transforms).trim() !== "",
  );

  if (transformsEdit) {
    return {
      path: "transforms-direct",
      evidence: `transforms: ${String(transformsEdit.args.transforms).slice(0, 80)}`,
    };
  }

  // No preTransforms — did the model try to encode the clear inside notes
  // (the contamination failure)? A `v0` token in notes is the tell.
  const notesV0 = calls.find((c) =>
    /(^|\s)v0(\s|$)/.test(String(c.args.notes ?? "")),
  );

  if (notesV0) {
    return {
      path: "notes-contamination",
      evidence: `v0 in notes arg: ${String(notesV0.args.notes).slice(0, 80)}`,
    };
  }

  if (calls.length >= 2) {
    return {
      path: "two-call",
      evidence: `${calls.length} update-clip calls`,
    };
  }

  return {
    path: "unrecognized",
    evidence: `single call, no recognized clear strategy: ${String(
      calls[0]?.args.notes ?? "",
    ).slice(0, 80)}`,
  };
}

/**
 * Record the SLM path classification. Passes unless nothing recognizable
 * happened; the classification is the comparison signal.
 *
 * @param turn - Turn index of the edit
 * @returns Custom assertion recording the SLM path
 */
function recordSlmPath(turn: number): EvalAssertion {
  return {
    type: "custom",
    description: `classify SLM preTransforms reach at turn ${turn}`,
    assert: (turns) => {
      const { path, evidence } = classifySlmPath(turns, turn);

      console.log(`    [slm-path@turn${turn}] path=${path} — ${evidence}`);

      if (path === "unrecognized") {
        throw new Error(`SLM did not perform a recognizable edit: ${evidence}`);
      }

      return true;
    },
  };
}

/**
 * Build an SLM preTransforms scenario. The two SLM cases (region clear, drum
 * remap) share an identical scaffold — connect, read drum notes, edit, classify
 * the path, judge the outcome — and differ only in the edit instruction and the
 * judge criteria, so they are assembled from one builder.
 *
 * @param spec - the per-scenario fields
 * @param spec.id - unique scenario id
 * @param spec.description - human-readable description
 * @param spec.editInstruction - the turn-2 user message that triggers the edit
 * @param spec.judgePrompt - llm_judge criteria for the outcome
 * @returns the assembled SLM EvalScenario
 */
function buildSlmScenario(spec: {
  id: string;
  description: string;
  editInstruction: string;
  judgePrompt: string;
}): EvalScenario {
  return {
    id: spec.id,
    description: spec.description,
    kind: "capability",
    liveSet: LIVE_SET,
    config: SLM_CONFIG,

    messages: [MSG_CONNECT, READ_DRUM_NOTES, spec.editInstruction],

    assertions: [
      { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
      assertNotesRead(1),
      { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 2 },
      recordSlmPath(2),
      { type: "llm_judge", prompt: spec.judgePrompt },
      { type: "token_usage", metric: "inputTokens", maxTokens: 100_000 },
    ],
  };
}

/**
 * SLM region clear: clear bar 2 of the drum clip, leave bar 1 intact. The
 * preTransforms region shorthand (`2|1-3|1: v0`) is the target; the failure is
 * trying to express the clear through the notes arg.
 */
export const slmPretransformsRegionClear: EvalScenario = buildSlmScenario({
  id: "slm-pretransforms-region-clear",
  description:
    "SLM: clear bar 2 of a drum clip — preTransforms shorthand vs notes contamination",
  editInstruction:
    "Clear out everything in the second bar of the drum clip. Leave the first bar exactly as it is.",
  judgePrompt: `Evaluate ONLY the outcome (turn 2), under small-model mode:
1. Bar 2 of the drum clip is now empty (all notes removed)
2. Bar 1's drum content is completely unchanged
3. The clear was done via a preTransforms region clear (e.g. "2|1-3|1: v0"), NOT by stuffing v0 deletions into the notes argument and NOT by rewriting bar 1`,
});

/**
 * SLM drum-lane remap: turn the kicks into snares across the whole clip. The
 * `C1: E1` remap shorthand is the target — a one-liner that the longhand
 * read-rewrite would balloon. Tests whether SLM reaches it without leaking the
 * remap into notes.
 */
export const slmPretransformsDrumRemap: EvalScenario = buildSlmScenario({
  id: "slm-pretransforms-drum-remap",
  description:
    "SLM: remap kicks→snares — preTransforms `C1: E1` shorthand vs rewrite",
  editInstruction:
    "Turn every kick hit in the drum clip into a snare hit instead — same timing, same velocities, just move them from the kick to the snare. Leave the hats alone.",
  judgePrompt: `Evaluate ONLY the outcome (turn 2), under small-model mode. In this drum rack kick = C1, snare = E1, closed hat = Ab1:
1. Every note that was on the kick (C1) is now on the snare (E1), preserving timing and velocity
2. No kicks (C1) remain; the hats (Ab1) are untouched; the note count is unchanged
3. The model used a preTransforms drum-lane remap (e.g. "C1: E1"), NOT a full read-and-rewrite of the whole clip`,
});
