// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario: a param that does nothing in the device's current mode (Live 13).
 *
 * The Drum Synth on the Drums track's C1 pad is set to the Kick sound type, so
 * Snare TR Snap is inactive: writing it has no effect, and the tool's entry
 * says so. The user asks for a live param and an inactive one together. Either
 * writing the inactive value and relaying the note, or declining and saying
 * why, passes; switching the sound type to make it live does not.
 */

import { type EvalScenario } from "../../../types.ts";
import { LIVE_13_TEST_SET } from "../../helpers/live-13-test-set.ts";
import { drumSynthProblem } from "./helpers/drum-synth-readback.ts";
import { TOOLS } from "#evals/shared/tool-names.ts";

export const drumSynthInactiveParam: EvalScenario = {
  id: "live-13-drum-synth-inactive-param",
  tags: ["devices", "results"],
  description:
    "Tell the user a Drum Synth param has no effect in the current sound type",
  kind: "capability",
  liveSet: LIVE_13_TEST_SET,
  requires: {
    liveVersion: 13,
    tools: [TOOLS.updateDevice, TOOLS.readDevice],
  },

  messages: [
    "Connect to Ableton Live",
    "On the kick's Drum Synth, set Decay to 60% and Snare TR Snap to 50%.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOLS.connect, turn: 0 },

    // Decay landed and the sound type is still Kick.
    {
      type: "state",
      tool: TOOLS.readDevice,
      args: { path: "t0/d0/pC1/d0", include: ["params", "param-values"] },
      expect: (result) => drumSynthProblem(result) == null,
      explain: (result) => drumSynthProblem(result) ?? "",
    },

    { type: "response_contains", pattern: /inactive|no effect/i, turn: 1 },
    { type: "token_usage", maxTokens: 3_000 },

    {
      type: "llm_judge",
      prompt: `The user asked to set a Drum Synth's Decay to 60% and Snare TR Snap to 50%.
The Drum Synth's sound type is Kick, so Snare TR Snap is inactive: it has no
effect until the sound type changes, and the tool flags it. Evaluate the final
reply:
1. It tells the user Snare TR Snap is inactive, or has no effect, while the
   sound type is Kick.
2. It does not present both changes as equally effective.
Either writing the inactive value and relaying the note, or declining to write
it and explaining, passes. Changing the sound type was not asked for.`,
    },
  ],
};
