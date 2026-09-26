// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * preTransforms reach-for measurement scenarios.
 *
 * Each scenario asks the model to clear-and-rewrite a region without naming
 * the API; `classifyFallback` below tags which path it took.
 *
 * Baseline: run with preTransforms excluded from the tool list to capture the
 * fallback distribution before a model can discover it; then run with it and
 * compare. The metric is path distribution, NOT outcome quality.
 *
 * Prompts are deliberately underspecified: no mention of "replace", "clear",
 * or "preTransforms".
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
 * Inspect the rewrite turn's update-clip calls and classify which fallback
 * the model took. Encoded as a single classification so the post-449
 * comparison is a head-to-head between paths.
 *
 * @param turns - All turn results
 * @param turn - Turn index that performed the rewrite
 * @returns Classification of the path taken
 */
function classifyFallback(
  turns: EvalTurnResult[],
  turn: number,
): ClassifiedPath {
  const { calls, reach } = readRewriteEdit(turns, turn);

  if (calls.length === 0) {
    return {
      path: "unrecognized",
      updateCalls: 0,
      evidence: "no ppal-update-clip calls in turn",
    };
  }

  // preTransforms reach is the future winner: single call carrying both
  // preTransforms (region clear) and notes (rewrite).
  if (reach) {
    return {
      path: "preTransforms-reach",
      updateCalls: calls.length,
      evidence: `preTransforms arg present: ${String(
        reach.args.preTransforms,
      ).slice(0, 80)}`,
    };
  }

  if (calls.length >= 2) {
    return {
      path: "two-call",
      updateCalls: calls.length,
      evidence: `${calls.length} update-clip calls in turn ${turn}`,
    };
  }

  const onlyCall = calls[0] as (typeof calls)[number];
  const notes = argText(onlyCall.args.notes);

  if (NOTES_V0.test(notes)) {
    return {
      path: "v0-per-note",
      updateCalls: 1,
      evidence: `single call with v0 in notes: ${notes.slice(0, 80)}`,
    };
  }

  return {
    path: "unrecognized",
    updateCalls: calls.length,
    evidence: `single call, no recognized clear strategy. notes: ${notes.slice(0, 80)}`,
  };
}

/** The grade shared by every scenario below. */
const FALLBACK_GRADE: PathGrade = {
  label: "region-rewrite fallback",
  classify: classifyFallback,
  failure: "model did not attempt a recognized rewrite path",
};

/**
 * Replace the lead melody in bars 1–2. The lead clip in
 * basic-with-drum-and-lead-clips is a 2-bar melody — the entire clip is the
 * "region" being rewritten, which simplifies the test (a clean replace works
 * as well as preTransforms here).
 */
export const pretransformsMelodyReplaceBaseline: EvalScenario =
  pretransformsScenario({
    id: "pretransforms-melody-replace-baseline",
    description:
      "Baseline: how the model rewrites a melody clip without preTransforms",
    readMessage: "Find the lead melody in the first scene and read its notes",
    editInstruction:
      "Replace the melody in bars 1–2 with this phrase: C4 D4 Eb4 F4 G4 Ab4 G4 F4 (one note per quarter beat starting at bar 1 beat 1)",
    grade: FALLBACK_GRADE,
    maxTokens: 2_500,
  });

/**
 * Clear-and-rewrite a sub-region (second bar's hats, not the whole clip).
 * Sub-region replacement is the case preTransforms targets specifically:
 * replace-rebuild forces the model to retype the FIRST bar's hats just to
 * preserve them. The reach-for question is whether the model recognizes
 * this asymmetry.
 */
export const pretransformsHatFillsBaseline: EvalScenario =
  pretransformsScenario({
    id: "pretransforms-hat-fills-baseline",
    description:
      "Baseline: clear-and-rewrite a sub-region (bar-2 hats) without preTransforms",
    readMessage: READ_DRUM_NOTES,
    editInstruction:
      "Clear the hat fills in the second bar of the drum clip and replace them with steady 16th notes on the hat for the whole second bar (16 hats).",
    grade: FALLBACK_GRADE,
    maxTokens: 2_000,
  });

/**
 * Snare-only sub-region swap. Pitch-scoped clear: the cleanest reach-for
 * case, since preTransforms `E1 1|1-2|4.75: v0` is dramatically simpler than
 * the replace-rebuild equivalent.
 */
export const pretransformsSnareSwapBaseline: EvalScenario =
  pretransformsScenario({
    id: "pretransforms-snare-swap-baseline",
    description:
      "Baseline: swap snare pattern across whole clip without preTransforms",
    readMessage: READ_DRUM_NOTES,
    editInstruction:
      "Swap out the snare pattern. Keep the kicks and hats exactly as they are. The new snare pattern: snare hits on beats 2, 2.5, 4, and 4.5 of each bar.",
    grade: FALLBACK_GRADE,
    maxTokens: 3_000,
  });
