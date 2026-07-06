// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario for synced-LFO note-value period syntax.
 *
 * Requires Ableton (agentic — drives a live model against Live).
 *
 * The old synced-period syntax (`1t`, `4t`, `1:0t`) is removed; a timeline-
 * synced LFO is now `sin(n/4, sync)` — a note-value period plus the trailing
 * `sync` keyword. Because the period is an absolute note value, the SAME
 * expression produces the same musical cycle in any meter — that is the
 * meter-invariance claim.
 *
 * Metric: classify the LFO the model emits as `note-value-sync` (correct),
 * `removed-t-syntax` (the retired `Nt` form — a hard regression), `no-sync`
 * (a periodic function without the sync keyword), or `unrecognized`.
 *
 * A true cross-meter A/B (same expression, 4/4 vs 6/8 vs 5/4) would need
 * dedicated meter live sets; see the eval validation tracker. Here the
 * invariance is carried by asserting an absolute note-value period — the
 * property that makes the expression meter-independent.
 *
 * Fixture: the scenario first creates the lead melody as an ARRANGEMENT clip,
 * because `sync` is skipped (with a warning) on a session clip — it needs an
 * arrangement position to anchor phase to the timeline. Asking for a
 * timeline-synced LFO on a session clip would be self-contradictory.
 */

import { getToolCalls } from "../../../assertions/index.ts";
import {
  type EvalAssertion,
  type EvalScenario,
  type EvalTurnResult,
} from "../../../types.ts";
import {
  getTransforms,
  MSG_CONNECT,
  TOOL_CONNECT,
  TOOL_UPDATE_CLIP,
} from "../clip-scenario-helpers.ts";

const LIVE_SET = "basic-with-drum-and-lead-clips";

const WAVE = "(?:sin|cos|tri|saw|square)";

type LfoReach =
  "note-value-sync" | "removed-t-syntax" | "no-sync" | "unrecognized";

/**
 * Classify the synced-LFO expression in the update-clip transforms at `turn`.
 *
 * @param turns - All turn results
 * @param turn - Turn index that applied the LFO
 * @returns the LFO classification plus matched evidence
 */
function classifyLfoReach(
  turns: EvalTurnResult[],
  turn: number,
): { reach: LfoReach; evidence: string } {
  const transforms = getTransforms(turns, turn, TOOL_UPDATE_CLIP);

  // The retired synced-period glyph: a number immediately followed by `t`
  // (e.g. `4t`, `1:0t`). A hard regression if it reappears.
  if (/\b\d+(?::\d+(?:\.\d+)?)?t\b/.test(transforms)) {
    return { reach: "removed-t-syntax", evidence: transforms.slice(0, 100) };
  }

  // A waveform call carrying an absolute note-value period AND the trailing
  // sync keyword. The note-value period (n/<denom>) is what makes it
  // meter-invariant.
  const syncedNoteValue = new RegExp(
    `${WAVE}\\([^)]*n\\d*\\/\\d+[^)]*,\\s*sync\\s*\\)`,
  );

  if (syncedNoteValue.test(transforms)) {
    return {
      reach: "note-value-sync",
      evidence: (syncedNoteValue.exec(transforms)?.[0] ?? "").slice(0, 100),
    };
  }

  // A waveform with sync but the period isn't an obvious note value — still
  // not the regression, but flag separately for inspection.
  if (new RegExp(`${WAVE}\\([^)]*\\bsync\\b`).test(transforms)) {
    return { reach: "note-value-sync", evidence: transforms.slice(0, 100) };
  }

  if (new RegExp(`${WAVE}\\(`).test(transforms)) {
    return { reach: "no-sync", evidence: transforms.slice(0, 100) };
  }

  return { reach: "unrecognized", evidence: transforms.slice(0, 100) };
}

/**
 * Record the LFO classification. Fails only on the hard regression
 * (`removed-t-syntax`) or an unrecognized result; logs the path otherwise.
 *
 * @param turn - Turn index of the LFO application
 * @returns Custom assertion recording the LFO reach
 */
function recordLfoReach(turn: number): EvalAssertion {
  return {
    type: "custom",
    description: `classify synced-LFO syntax at turn ${turn}`,
    assert: (turns) => {
      const { reach, evidence } = classifyLfoReach(turns, turn);

      console.log(
        `    [lfo-reach@turn${turn}] reach=${reach} — ${evidence.slice(0, 80)}`,
      );

      if (reach === "removed-t-syntax") {
        throw new Error(
          `model used the REMOVED synced-period syntax (Nt): ${evidence}`,
        );
      }

      if (reach === "unrecognized") {
        throw new Error(`no recognizable LFO expression: ${evidence}`);
      }

      return true;
    },
  };
}

/**
 * Create the lead melody as an arrangement clip, then apply a timeline-synced
 * quarter-note LFO to its velocities and check the model reaches for
 * `sin(n/4, sync)` rather than the removed `Nt` form or a meter-relative
 * period. The clip must be in the arrangement, since `sync` is a no-op (skipped
 * with a warning) on a session clip.
 */
export const syncedLfoMeterInvariance: EvalScenario = {
  id: "synced-lfo-meter-invariance",
  description:
    "synced LFO → sin(n/4, sync) note-value period, not the removed Nt syntax",
  kind: "capability",
  requires: { transforms: true },
  liveSet: LIVE_SET,

  messages: [
    MSG_CONNECT,
    "Create a 2-bar lead melody on the Lead track in the arrangement starting at bar 1",
    "Add a sine-wave LFO to the note velocities that completes one full cycle every quarter note and stays locked to the song timeline (so the wave is continuous across the clip, not reset per note).",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    { type: "tool_called", tool: "ppal-create-clip", turn: 1 },
    {
      type: "custom",
      description: "lead melody created as an arrangement clip (sync needs it)",
      assert: (turns) => {
        const createCall = getToolCalls(turns, 1).find(
          (c) => c.name === "ppal-create-clip",
        );

        if (!createCall)
          throw new Error("ppal-create-clip not found in turn 1");

        if (!createCall.args.arrangementStart) {
          throw new Error(
            "clip must be created in the arrangement (arrangementStart) — sync is skipped on session clips",
          );
        }

        return true;
      },
    },

    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 2 },
    recordLfoReach(2),

    {
      type: "llm_judge",
      prompt: `Evaluate the LFO edit (turn 2):
1. A periodic waveform (sine or equivalent) modulates the velocities
2. The period is one quarter note, written as an absolute note value (e.g. "n/4") — NOT a meter-relative number and NOT the removed "Nt"/"1:0t" synced-period syntax
3. The "sync" keyword is present so the wave is locked to the timeline (continuous across the clip), not phase-reset per note
4. Because the period is an absolute note value, the same expression would behave identically in any meter`,
    },

    { type: "token_usage", metric: "inputTokens", maxTokens: 100_000 },
  ],
};
