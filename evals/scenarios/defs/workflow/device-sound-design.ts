// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Sound-design capability: can the model drive a specialized device's
 * modulation matrix via the `actions` function-call grammar?
 *
 * Requires Ableton (agentic — drives a live model against Live).
 *
 * Wavetable is the only specialized device exposing modulation `actions`
 * (`setModulation('<targetParamName>', '<source>', <amount -1..1>)`); Drift is
 * pseudo-param only. The model must discover the matrix (via read-device
 * `include: ["actions"]` / `["options"]`, which surfaces `modulatableParameters`
 * like "Flt 1 Freq" and the 13 `modulationSources` like "LFO 1"/"Env 2") and
 * emit a well-formed action with a REAL target + source.
 *
 * Grading is outcome-based but path-independent: an invalid target, source,
 * amount, or unparseable action all warn-and-skip, and `console.warn` is relayed
 * into the tool result as a `WARNING:` block (see v8-max-console). So an
 * ACCEPTED action = an update-device call carrying a `setModulation(...)` action
 * whose result has no `WARNING`. We don't pin the device path (the model names
 * its own track), we inspect what it sent and whether the engine took it.
 *
 * The LLM judge is ADVISORY here: it reads the transcript, not Live state, and
 * is fooled by a confident-but-false claim. (First run, 2026-06-02,
 * gemini-3.5-flash: for the LFO route the model set the global "LFO 1 Amount"
 * param yet narrated "LFO 1 is mapped to Flt 1 Freq at 0.7" — a confabulated
 * route the judge passed and the deterministic check caught.) The custom
 * assertions, which require an ACCEPTED setModulation per route, are
 * authoritative.
 */

import { getToolCalls } from "../../assertions/index.ts";
import {
  type EvalAssertion,
  type EvalScenario,
  type EvalTurnResult,
} from "../../types.ts";

const TOOL_UPDATE_DEVICE = "ppal-update-device";

export const deviceSoundDesign: EvalScenario = {
  id: "device-sound-design",
  description:
    "Route Wavetable modulation (LFO + envelope → filter) via the actions grammar",
  kind: "capability",
  liveSet: "basic-midi-4-track",
  judgeAdvisory: true,

  messages: [
    "Connect to Ableton Live",
    "Create a MIDI track called 'Wobble Bass' and add a Wavetable instrument to it.",
    "Make the filter wobble: route LFO 1 to the Wavetable's filter frequency with a strong modulation amount (around 0.7).",
    "Add some movement from an envelope too: route the second envelope (Env 2) to that same filter frequency at a gentle amount (around 0.3).",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0 },
    { type: "tool_called", tool: "ppal-create-track", turn: 1 },
    { type: "tool_called", tool: "ppal-create-device", turn: 1 },
    { type: "tool_called", tool: TOOL_UPDATE_DEVICE, turn: 2 },
    { type: "tool_called", tool: TOOL_UPDATE_DEVICE, turn: 3 },

    // The LFO route (turn 2) must be accepted by the matrix.
    acceptedModulationAssertion(2, "LFO 1 → filter (turn 2)"),
    // The envelope route (turn 3) must also be accepted.
    acceptedModulationAssertion(3, "Env 2 → filter (turn 3)"),

    {
      type: "response_contains",
      pattern: /lfo|filter|modulat|wobble/i,
      turn: 2,
    },

    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created a MIDI track named "Wobble Bass" and added a Wavetable instrument
2. Routed LFO 1 to the Wavetable's filter frequency with a strong amount (~0.7)
3. Routed the second envelope (Env 2) to the same filter frequency with a gentle amount (~0.3)
4. Used the modulation-matrix actions (setModulation) rather than claiming success without acting`,
    },

    {
      type: "token_usage",
      metric: "inputTokens",
      maxTokens: 100_000,
    },
  ],
};

/** Action-failure fragments the relay surfaces when setModulation is rejected. */
const MODULATION_FAILURE =
  /could not parse action|unknown action|requires 3 arguments|source ".*" is invalid|amount must be|is not a (valid )?modulation target|warning/i;

/**
 * Build a custom assertion that a `setModulation(...)` action emitted in `turn`
 * was ACCEPTED by the Wavetable matrix: at least one update-device call in that
 * turn carries a `setModulation` action AND its tool result has no failure
 * `WARNING` (an invalid target/source/amount or unparseable action would warn
 * and skip). Path-independent — grades the emitted call + its result, not a
 * hardcoded device location.
 *
 * @param turn - Turn index to inspect
 * @param label - Human-readable route label for failure messages
 * @returns Custom assertion
 */
function acceptedModulationAssertion(
  turn: number,
  label: string,
): EvalAssertion {
  return {
    type: "custom",
    description: `modulation route accepted: ${label}`,
    assert: (turns: EvalTurnResult[]) => {
      const modCalls = getToolCalls(turns, turn).filter(
        (c) =>
          c.name === TOOL_UPDATE_DEVICE &&
          Array.isArray(c.args.actions) &&
          (c.args.actions as unknown[]).some((a) =>
            /setmodulation\s*\(/i.test(String(a)),
          ),
      );

      if (modCalls.length === 0) {
        throw new Error(
          `${label}: no update-device call emitted a setModulation action`,
        );
      }

      const accepted = modCalls.some(
        (c) => !MODULATION_FAILURE.test(String(c.result ?? "")),
      );

      if (!accepted) {
        throw new Error(
          `${label}: setModulation was emitted but the engine rejected it (target/source/amount invalid — see WARNING in the tool result)`,
        );
      }

      return true;
    },
  };
}
