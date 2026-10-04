// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: create, rename and delete locators.
 *
 * `locator-navigation` only moves around locators that already exist. This one
 * builds them: a list of times and names makes every locator in ONE create call,
 * a rename and a delete each name a locator the model learned from a read or
 * from its own create result, and the ids it sends are Live's own (all digits),
 * never an invented `locator-1`.
 *
 * The Set read back after the run is what gates. The route is reported as
 * signals: one create call for all three (three calls end the same), a rename
 * (delete + create ends the same), a delete, and ids that are Live's own. How
 * the model addresses the locator it renames or deletes (name, time or id) is
 * its choice; the outcome says whether it hit the right one.
 *
 * Starts from basic-midi-4-track, which has no locators.
 *
 * Gated on `locatorOperation`: small-model mode hides every locator param.
 */

import { asSignal } from "../../assertions/index.ts";
import { type EvalScenario } from "../../types.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
} from "../clip/helpers/clip-tool-constants.ts";
import {
  TOOL_UPDATE_LIVE_SET,
  assertCreatedInOneCall,
  assertLocatorIdsAreLives,
  assertLocatorsAre,
  locatorCalls,
} from "./locator-readback.ts";

export const locatorLifecycle: EvalScenario = {
  id: "locator-lifecycle",
  tags: ["workflow"],
  description: "Create locators in one call, rename one, delete one",
  kind: "capability",
  liveSet: "basic-midi-4-track",
  // The Set starts with no locators and nothing here removes them, so a second
  // trial would inherit the first one's.

  requires: { params: ["locatorOperation"] },

  messages: [
    MSG_CONNECT,
    "Add locators named Verse, Chorus and Bridge at bars 1, 9 and 17.",
    "Rename the Bridge locator to Outro.",
    "Delete the Chorus locator.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    { type: "tool_called", tool: TOOL_UPDATE_LIVE_SET, turn: 1 },

    // Route signals: reported, never gating.
    asSignal(assertCreatedInOneCall(1, 3)),
    {
      type: "custom",
      signal: true,
      description: "turn 2: renamed the locator rather than recreating it",
      assert: (turns) => locatorCalls(turns, 2, "rename").length > 0,
    },
    {
      type: "custom",
      signal: true,
      description: "turn 3: deleted the locator with a delete operation",
      assert: (turns) => locatorCalls(turns, 3, "delete").length > 0,
    },
    asSignal(assertLocatorIdsAreLives()),

    assertLocatorsAre([
      { name: "Verse", time: "1|1" },
      { name: "Outro", time: "17|1" },
    ]),

    { type: "token_usage", maxTokens: 3_500 },
  ],
};
