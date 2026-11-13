// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario: report where a rack's macro count really landed (Live 13).
 *
 * Live can't show 16 macros on the Mid-Side Rack: asked for 16, it lands on
 * 32, and the tool says so in the call's entry. The state read can't tell what
 * the model told the user, so the judge gates. The model may try one nearby
 * count afterwards, so the read only rules out 16; the judge checks the final
 * report matches what the tool answered.
 */

import { type EvalScenario } from "../../../types.ts";
import { LIVE_13_TEST_SET } from "../../helpers/live-13-test-set.ts";
import { macroCountRequests } from "./helpers/macro-count-requests.ts";
import { TOOLS } from "#evals/shared/tool-names.ts";

/** What the user asks for, and what Live can't land on. */
const ASKED = 16;

export const macroCountLanding: EvalScenario = {
  id: "live-13-macro-count-landing",
  tags: ["devices", "results"],
  description:
    "Report the macro count Live landed on when it can't show the one asked for",
  kind: "capability",
  liveSet: LIVE_13_TEST_SET,
  requires: {
    liveVersion: 13,
    tools: [TOOLS.updateDevice, TOOLS.readDevice],
    params: ["macroCount"],
  },

  messages: [
    "Connect to Ableton Live",
    "Give the Mid-Side Rack on the Racks track 16 macros.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOLS.connect, turn: 0 },

    {
      type: "custom",
      description: `a macroCount of ${ASKED} was sent and answered`,
      assert: (turns) => macroCountRequests(turns, ASKED).length > 0,
    },

    // The rack does not show 16.
    {
      type: "state",
      tool: TOOLS.readDevice,
      args: { path: "t1/d0", include: ["params"] },
      expect: (result) => {
        const count = (result as { macros?: { count?: number } }).macros?.count;

        return typeof count === "number" && count !== ASKED;
      },
      explain: (result) =>
        `the rack should not show ${ASKED} macros, it reads ${JSON.stringify((result as { macros?: unknown }).macros)}`,
    },

    { type: "response_contains", pattern: /\b32\b/, turn: 1 },
    { type: "token_usage", maxTokens: 3_000 },

    {
      type: "llm_judge",
      prompt: `The user asked for 16 macros on the Mid-Side Rack. Live couldn't land on 16:
the tool answered that the rack landed at 32 macros. Evaluate the final reply:
1. It says the rack now shows 32 macros (or, if the assistant tried another
   count afterwards, the count that call reported).
2. It does NOT claim the rack shows 16 macros.
Trying one nearby count afterwards is fine, as long as the final report matches
what the tool answered.`,
    },
  ],
};
