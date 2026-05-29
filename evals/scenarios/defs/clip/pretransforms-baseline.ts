// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * preTransforms reach-for measurement scenarios.
 *
 * Each scenario asks the model to clear-and-rewrite a region without naming
 * the API. `classifyFallback` tags which path the model took:
 *
 *   - **preTransforms-reach**: single update-clip with preTransforms (clear)
 *     + notes (rewrite) — the path preTransforms is meant to enable
 *   - **replace-rebuild**: single call with noteUpdateMode "replace" + the
 *     full new contents
 *   - **two-call**: separate clear call followed by an add call
 *   - **v0-per-note**: merge mode with v0 deletes inline with new notes
 *   - **unrecognized**: model produced no recognizable rewrite (fails)
 *
 * Baseline: run on `main` (or on `dev` with preTransforms excluded from the
 * tool list) to capture fallback distribution before the model can
 * discover preTransforms. Reach-for: run on `dev` and compare. The metric
 * is path distribution, NOT outcome quality — preTransforms is gated on
 * discoverability, not capability.
 *
 * Prompts are deliberately underspecified: no mention of "replace",
 * "preTransforms", or "noteUpdateMode".
 */

import { getToolCalls } from "../../assertions/index.ts";
import {
  type EvalAssertion,
  type EvalScenario,
  type EvalTurnResult,
} from "../../types.ts";
import { assertNotesRead } from "./clip-scenario-helpers.ts";

const TOOL_UPDATE_CLIP = "ppal-update-clip";
const TOOL_CONNECT = "ppal-connect";
const LIVE_SET = "basic-with-drum-and-lead-clips";
const MSG_CONNECT = "Connect to Ableton Live";
const READ_DRUM_NOTES =
  "Find the drum clip in the first scene and read its notes";

interface FallbackClassification {
  path:
    | "preTransforms-reach"
    | "replace-rebuild"
    | "v0-per-note"
    | "two-call"
    | "unrecognized";
  updateCalls: number;
  evidence: string;
}

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
): FallbackClassification {
  const calls = getToolCalls(turns, turn).filter(
    (c) => c.name === TOOL_UPDATE_CLIP,
  );

  if (calls.length === 0) {
    return {
      path: "unrecognized",
      updateCalls: 0,
      evidence: "no ppal-update-clip calls in turn",
    };
  }

  // preTransforms reach is the future winner: single call carrying both
  // preTransforms (region clear) and notes (rewrite). The arg may not exist
  // yet on `main` — record the reach attempt anyway so post-449 runs can
  // surface it.
  const reachCall = calls.find(
    (c) =>
      c.args.preTransforms != null &&
      String(c.args.preTransforms).trim() !== "",
  );

  if (reachCall) {
    return {
      path: "preTransforms-reach",
      updateCalls: calls.length,
      evidence: `preTransforms arg present: ${String(
        reachCall.args.preTransforms,
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

  if (onlyCall.args.noteUpdateMode === "replace") {
    return {
      path: "replace-rebuild",
      updateCalls: 1,
      evidence: `single call, noteUpdateMode="replace"`,
    };
  }

  const notes = String(onlyCall.args.notes ?? "");

  if (/(^|\s)v0(\s|$)/.test(notes)) {
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

/**
 * Custom assertion that always passes but records the classified fallback in
 * its thrown-message-style description. The classification is the result we
 * actually care about; pass/fail is just the "did the model attempt the
 * edit at all" gate.
 *
 * @param turn - Turn index of the rewrite attempt
 * @returns Assertion that records the fallback classification in its message
 */
function recordFallbackPath(turn: number): EvalAssertion {
  return {
    type: "custom",
    description: `classify region-rewrite fallback at turn ${turn}`,
    assert: (turns) => {
      const c = classifyFallback(turns, turn);

      // Use console.log so the classification surfaces in eval output even
      // though the assertion itself is pass-only. The JSON results file
      // captures the assertion description; pair the description with
      // tool_called counts when comparing baseline vs post-449.
      console.log(
        `    [fallback@turn${turn}] path=${c.path} updateCalls=${c.updateCalls} — ${c.evidence}`,
      );

      if (c.path === "unrecognized") {
        throw new Error(
          `model did not attempt a recognized rewrite path: ${c.evidence}`,
        );
      }

      return true;
    },
  };
}

/**
 * Replace the lead melody in bars 1–2. The lead clip in
 * basic-with-drum-and-lead-clips is a 2-bar melody — the entire clip is the
 * "region" being rewritten, which simplifies the test (a clean replace works
 * as well as preTransforms here).
 */
export const pretransformsMelodyReplaceBaseline: EvalScenario = {
  id: "pretransforms-melody-replace-baseline",
  description:
    "Baseline: how the model rewrites a melody clip without preTransforms",
  kind: "capability",
  liveSet: LIVE_SET,

  messages: [
    MSG_CONNECT,
    "Find the lead melody in the first scene and read its notes",
    "Replace the melody in bars 1–2 with this phrase: C4 D4 Eb4 F4 G4 Ab4 G4 F4 (one note per quarter beat starting at bar 1 beat 1)",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    assertNotesRead(1),

    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 2 },
    recordFallbackPath(2),

    {
      type: "llm_judge",
      prompt: `Evaluate ONLY the rewrite outcome (turn 2), not how the model framed it:
1. The lead clip in bars 1–2 contains exactly the new phrase (C4 D4 Eb4 F4 G4 Ab4 G4 F4 on consecutive beats)
2. None of the original melody notes remain in bars 1–2
3. The work was done — pass even if the model used multiple tool calls`,
    },

    { type: "token_usage", metric: "inputTokens", maxTokens: 100_000 },
  ],
};

/**
 * Clear-and-rewrite a sub-region (second bar's hats, not the whole clip).
 * Sub-region replacement is the case preTransforms targets specifically:
 * replace-rebuild forces the model to retype the FIRST bar's hats just to
 * preserve them. The reach-for question is whether the model recognizes
 * this asymmetry.
 */
export const pretransformsHatFillsBaseline: EvalScenario = {
  id: "pretransforms-hat-fills-baseline",
  description:
    "Baseline: clear-and-rewrite a sub-region (bar-2 hats) without preTransforms",
  kind: "capability",
  liveSet: LIVE_SET,

  messages: [
    MSG_CONNECT,
    READ_DRUM_NOTES,
    "Clear the hat fills in the second bar of the drum clip and replace them with steady 16th notes on the hat for the whole second bar (16 hats).",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    assertNotesRead(1),

    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 2 },
    recordFallbackPath(2),

    {
      type: "llm_judge",
      prompt: `Evaluate ONLY the rewrite outcome (turn 2):
1. Bar 2 of the drum clip now has exactly 16 evenly-spaced hat hits on the closed-hat pitch (Ab1 in this drum rack)
2. Bar 1's drum content is unchanged (kick, snare, hats from the original — none lost, none added)
3. Any earlier hat fills that were in bar 2 are gone`,
    },

    { type: "token_usage", metric: "inputTokens", maxTokens: 100_000 },
  ],
};

/**
 * Snare-only sub-region swap. Pitch-scoped clear: the cleanest reach-for
 * case, since preTransforms `E1 1|1-2|4.75: v0` is dramatically simpler than
 * the replace-rebuild equivalent.
 */
export const pretransformsSnareSwapBaseline: EvalScenario = {
  id: "pretransforms-snare-swap-baseline",
  description:
    "Baseline: swap snare pattern across whole clip without preTransforms",
  kind: "capability",
  liveSet: LIVE_SET,

  messages: [
    MSG_CONNECT,
    READ_DRUM_NOTES,
    "Swap out the snare pattern. Keep the kicks and hats exactly as they are. The new snare pattern: snare hits on beats 2, 2.5, 4, and 4.5 of each bar.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    assertNotesRead(1),

    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 2 },
    recordFallbackPath(2),

    {
      type: "llm_judge",
      prompt: `Evaluate ONLY the rewrite outcome (turn 2):
1. Snare (E1) hits land on beats 2, 2.5, 4, 4.5 of EACH bar of the 2-bar drum clip (8 snares total)
2. Original kicks (C1) and hats (Ab1) are unchanged in count and position
3. No previous snare hits remain (the original snare on beats 2 and 4 has been cleared)`,
    },

    { type: "token_usage", metric: "inputTokens", maxTokens: 100_000 },
  ],
};
