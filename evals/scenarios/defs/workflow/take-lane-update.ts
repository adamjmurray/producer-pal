// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: take lanes belong to `ppal-update-track`.
 *
 * `t1/l+` appends a lane, `t1/l<n>` names an existing one (making the lanes up
 * to it), and a lane takes only `name`. A model that doesn't know this reaches
 * for a clip write, which makes a lane only as a side effect and leaves it
 * unnamed. `ppal-read-track` lists the lanes by name and path.
 *
 * Only the lane names read back after the run gate: any route that ends with
 * the right lanes passes, including a clip path that makes the lanes and a
 * later rename. The route is reported as signals: lane paths on update-track
 * (any `l+` or `l<n>` form is the same tool and the same result), no clip tool,
 * what the model's own read showed, and the rename of the first lane.
 *
 * `path-take-lane-first` covers the other direction: a clip placed on a lane.
 */

import {
  getToolCalls,
  requireSuccessfulToolCall,
} from "../../assertions/index.ts";
import { type EvalAssertion, type EvalScenario } from "../../types.ts";
import { takeLanes } from "../arrangement-readback.ts";
import { argText } from "../arg-text.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
} from "../clip/helpers/clip-tool-constants.ts";
import { listEntries } from "../path/path-assertions.ts";

const TOOL_UPDATE_TRACK = "ppal-update-track";
const TOOL_READ_TRACK = "ppal-read-track";

/** Bass is track 1 in basic-midi-4-track, and starts with no take lanes. */
const LANE_PATH = /^t1\/l(\+|\d+)$/;

/** Tools that write clips. A lane made through one is the wrong route. */
const CLIP_WRITERS = new Set([
  "ppal-create-clip",
  "ppal-update-clip",
  "ppal-duplicate",
]);

/**
 * Lane names on the Bass track, in lane order.
 *
 * @param result - Parsed ppal-read-track result
 * @returns Each lane's name, an unnamed one reading as "?"
 */
function laneNames(result: unknown): string[] {
  return takeLanes(result).map((lane) => lane.name ?? "?");
}

/**
 * Turn 1 added the lanes through update-track, with lane paths, and no clip
 * tool made them.
 *
 * @returns A custom assertion
 */
function assertLanesAddedByUpdateTrack(): EvalAssertion {
  return {
    type: "custom",
    signal: true,
    description: "turn 1: lanes added with ppal-update-track lane paths",
    assert: (turns) => {
      const clipWrites = getToolCalls(turns, 1).filter((call) =>
        CLIP_WRITERS.has(call.name),
      );

      if (clipWrites.length > 0) {
        throw new Error(`used ${clipWrites.map((c) => c.name).join(", ")}`);
      }

      const paths = getToolCalls(turns, 1)
        .filter((call) => call.name === TOOL_UPDATE_TRACK)
        .flatMap((call) => listEntries(call.args.path));

      if (paths.length < 2) {
        throw new Error(`${paths.length} lane path(s) sent, expected 2`);
      }

      const bad = paths.filter((path) => !LANE_PATH.test(path));

      if (bad.length > 0) {
        throw new Error(`not a Bass lane path: ${bad.join(", ")}`);
      }

      return true;
    },
  };
}

/**
 * Turn 2's own read of the Bass track showed both lanes by name.
 *
 * @returns A custom assertion
 */
function assertReadListsLanes(): EvalAssertion {
  return {
    type: "custom",
    signal: true,
    description: "turn 2: ppal-read-track listed the Take A and Take B lanes",
    assert: (turns) => {
      const call = requireSuccessfulToolCall(turns, 2, TOOL_READ_TRACK);
      const shown = argText(call.result);

      if (!shown.includes("Take A") || !shown.includes("Take B")) {
        throw new Error(`read showed ${shown.slice(0, 240)}`);
      }

      return true;
    },
  };
}

/**
 * Turn 3 renamed the first lane with update-track, by its path or its id.
 *
 * @returns A custom assertion
 */
function assertRenamedFirstLane(): EvalAssertion {
  return {
    type: "custom",
    signal: true,
    description: "turn 3: renamed the first lane with ppal-update-track",
    assert: (turns) => {
      const call = requireSuccessfulToolCall(turns, 3, TOOL_UPDATE_TRACK);
      const target = argText(call.args.path) || argText(call.args.id);

      if (argText(call.args.path) !== "" && target !== "t1/l0") {
        throw new Error(`renamed '${target}', expected t1/l0 or a lane id`);
      }

      if (argText(call.args.name) !== "Keeper") {
        throw new Error(`name is '${argText(call.args.name)}'`);
      }

      return true;
    },
  };
}

export const takeLaneUpdate: EvalScenario = {
  id: "take-lane-update",
  tags: ["paths"],
  description: "Add, list and rename take lanes through update-track",
  kind: "capability",
  liveSet: "basic-midi-4-track",
  // No reuseLiveSet: nothing removes a take lane, so a second trial would
  // inherit the first one's lanes and the count check would be meaningless.

  messages: [
    MSG_CONNECT,
    "Add two take lanes to the Bass track and name them Take A and Take B.",
    "What take lanes does the Bass track have now?",
    "Rename the first one to Keeper.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    // Route signals: reported, never gating.
    assertLanesAddedByUpdateTrack(),
    assertReadListsLanes(),
    assertRenamedFirstLane(),

    {
      type: "state",
      tool: TOOL_READ_TRACK,
      args: { path: "t1", include: ["arrangement-clips"] },
      expect: (result) => laneNames(result).join(",") === "Keeper,Take B",
      explain: (result) =>
        `expected lanes Keeper, Take B, got ${laneNames(result).join(", ") || "none"}`,
    },

    { type: "token_usage", maxTokens: 3_500 },
  ],
};
