// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario: add a Transient Shaper (new in Live 13) and set a sidechain param
 * that does nothing while the sidechain is off.
 *
 * S/C Gain is inactive until S/C On is switched on, and the tool's entry says
 * so. The model has two good answers: switch the sidechain on and set the gain,
 * or leave it off and tell the user the gain does nothing yet. The state read
 * grades Attack and Dry/Wet, and the gain when the sidechain is on; the judge
 * grades the other branch. The device is found by the id the model's own
 * create-device call returned, since it may land anywhere on the track.
 */

import { type EvalScenario } from "../../../types.ts";
import { LIVE_13_TEST_SET } from "../../helpers/live-13-test-set.ts";
import {
  transientShaperArgs,
  transientShaperProblem,
} from "./helpers/transient-shaper-readback.ts";
import { TOOLS } from "#evals/shared/tool-names.ts";

export const transientShaperSidechain: EvalScenario = {
  id: "live-13-transient-shaper-sidechain",
  tags: ["devices", "results"],
  description:
    "Add a Transient Shaper and handle a sidechain gain that is inactive while the sidechain is off",
  kind: "capability",
  liveSet: LIVE_13_TEST_SET,
  requires: {
    liveVersion: 13,
    tools: [TOOLS.createDevice, TOOLS.updateDevice, TOOLS.readDevice],
  },

  messages: [
    "Connect to Ableton Live",
    "Add a Transient Shaper to the Racks track. Set its Attack to 40%, Dry/Wet to 50%, and the sidechain gain to +6 dB.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOLS.connect, turn: 0 },

    {
      type: "state",
      tool: TOOLS.readDevice,
      args: transientShaperArgs,
      expect: (result) => transientShaperProblem(result) == null,
      explain: (result) => transientShaperProblem(result) ?? "",
    },

    { type: "token_usage", maxTokens: 4_000 },

    {
      type: "llm_judge",
      prompt: `The user asked for a Transient Shaper with Attack 40%, Dry/Wet 50% and a
sidechain gain of +6 dB. S/C Gain is inactive while S/C On is Off, and the tool
flags it. Attack and Dry/Wet are graded elsewhere; judge the final reply on the
sidechain gain only. Either outcome passes:
(a) The assistant turned S/C On on, set S/C Gain to +6 dB, and says so.
(b) S/C On was left Off, and the reply tells the user the gain has no effect
    until the sidechain is switched on.
Fail it if it presents the gain as in effect while S/C On is still off.`,
    },
  ],
};
