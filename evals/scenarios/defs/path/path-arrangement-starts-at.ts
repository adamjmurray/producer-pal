// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: `t3[5|1]` means STARTS at bar 5, not covers it.
 *
 * This is the decision ADR-0037 flags as most likely to need adjusting, and it
 * is the only way to find out. A 4-bar clip at bar 1 runs through bar 5, so a
 * model asked about "the clip playing at bar 3" may reach for `t3[3|1]` — which
 * names nothing, warns, and skips.
 *
 * What the warning is for is recovery. Aiming at the covered bar once and then
 * finding the real start is a Skills problem and a pass; aiming at the same
 * dead position again means the warning did not teach anything, and the address
 * needs rethinking rather than better wording.
 *
 * `kind: "capability"` — an improvement target, not a regression guard.
 */

import { getAllToolCalls } from "../../assertions/index.ts";
import { type EvalAssertion, type EvalScenario } from "../../types.ts";
import { argText } from "../arg-text.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
  TOOL_CREATE_CLIP,
  TOOL_UPDATE_CLIP,
} from "../clip/helpers/clip-scenario-helpers.ts";
import { assertArrangementClipNamed } from "./path-scenario-helpers.ts";

/** Lead is track 3 in basic-midi-4-track. */
const LEAD_TRACK_INDEX = 3;

const CLIP_NAME = "Long One";

/** Inside the clip, but not where it starts — the position that names nothing. */
const COVERED_POSITION = /\[\s*3\|1\s*\]/;

/**
 * The measurement ADR-0037 asks for: one wrong aim is fine, two is the finding.
 * @param turn - Turn index to grade
 * @returns A custom assertion over every path the turn wrote
 */
function assertLearnedFromTheWarning(turn: number): EvalAssertion {
  return {
    type: "custom",
    description: "did not aim at the same empty position twice",
    assert: (turns) => {
      const aimed = getAllToolCalls(turns, turn)
        .flatMap((call) => [argText(call.args.path), argText(call.args.toPath)])
        .filter((value) => COVERED_POSITION.test(value));

      if (aimed.length > 1) {
        throw new Error(
          `aimed at bar 3 ${String(aimed.length)} times (${aimed.join(", ")}): ` +
            `a clip that started earlier is not AT that bar, so the first ` +
            `warning should have sent it looking for the real start`,
        );
      }

      return true;
    },
  };
}

export const pathArrangementStartsAt: EvalScenario = {
  id: "path-arrangement-starts-at",
  description: "Recover when a coordinate names a bar the clip only covers",
  kind: "capability",
  liveSet: "basic-midi-4-track",

  messages: [
    MSG_CONNECT,
    "Create a 4-bar clip in the arrangement on the Lead track, starting at bar 1.",
    `Rename the arrangement clip that's playing at bar 3 to "${CLIP_NAME}".`,
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },
    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 2 },

    assertLearnedFromTheWarning(2),
    assertArrangementClipNamed({
      trackIndex: LEAD_TRACK_INDEX,
      name: CLIP_NAME,
    }),

    { type: "token_usage", metric: "inputTokens", maxTokens: 80_000 },
  ],
};
