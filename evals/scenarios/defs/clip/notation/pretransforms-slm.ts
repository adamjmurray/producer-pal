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
 * clears a region, `v0` clears all, `C1: C4` remaps a drum lane). Run these
 * under the `--small-model` run environment to measure whether a model under
 * the reduced schema reaches for the preTransforms shorthand rather than
 * contaminating the `notes` arg with clear/remap intent. (Run without
 * `--small-model`, they exercise the full schema instead — the classifier still
 * recognizes the equivalent `transforms`-param edit; see `transforms-direct`.)
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

import { argText } from "../../arg-text.ts";
import { type EvalScenario, type EvalTurnResult } from "../../../types.ts";
import { READ_DRUM_NOTES } from "../helpers/clip-tool-constants.ts";
import {
  type ClassifiedPath,
  NOTES_V0,
  type PathGrade,
  pretransformsScenario,
  readRewriteEdit,
} from "./pretransforms-classification.ts";

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
): ClassifiedPath {
  const { calls, reach } = readRewriteEdit(turns, turn);

  if (calls.length === 0) {
    return { path: "unrecognized", evidence: "no update-clip calls" };
  }

  if (reach) {
    return {
      path: "pretransforms-shorthand",
      evidence: `preTransforms: ${argText(reach.args.preTransforms).slice(0, 80)}`,
    };
  }

  // A model that still has the full schema (the scenario run outside actual
  // small-model mode) reaches for the `transforms` param for the same
  // remap/clear. That is a correct, recognizable edit — just not the
  // SLM-specific preTransforms shorthand — so it must not be tagged
  // "unrecognized".
  const transformsEdit = calls.find(
    (c) =>
      c.args.transforms != null && argText(c.args.transforms).trim() !== "",
  );

  if (transformsEdit) {
    return {
      path: "transforms-direct",
      evidence: `transforms: ${argText(transformsEdit.args.transforms).slice(0, 80)}`,
    };
  }

  // No preTransforms — did the model try to encode the clear inside notes
  // (the contamination failure)? A `v0` token in notes is the tell.
  const notesV0 = calls.find((c) => NOTES_V0.test(argText(c.args.notes)));

  if (notesV0) {
    return {
      path: "notes-contamination",
      evidence: `v0 in notes arg: ${argText(notesV0.args.notes).slice(0, 80)}`,
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
    evidence: `single call, no recognized clear strategy: ${argText(calls[0]?.args.notes).slice(0, 80)}`,
  };
}

/** The grade shared by both SLM scenarios. */
const SLM_GRADE: PathGrade = {
  label: "SLM preTransforms reach",
  classify: classifySlmPath,
  failure: "SLM did not perform a recognizable edit",
};

// The two SLM cases share a scaffold and differ only in the edit instruction.
function buildSlmScenario(spec: {
  id: string;
  description: string;
  editInstruction: string;
}): EvalScenario {
  return pretransformsScenario({
    ...spec,
    readMessage: READ_DRUM_NOTES,
    grade: SLM_GRADE,
    maxTokens: 2_500,
  });
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
});
