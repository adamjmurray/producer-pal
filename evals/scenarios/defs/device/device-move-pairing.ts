// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario: a `ppal-update-device` move pairs one destination per device.
 *
 * `path="t3/d2,t3/d3" toPath="t1/d+,t1/d+"` moves two devices; one destination
 * for both is refused, since a destination holds one object. A bare track
 * (`t1`) is a destination too and lands the device last, so `t1,t1` is as right
 * as `t1/d+,t1/d+`.
 *
 * Moves Lead's two audio effects (Channel EQ, then Utility) to the end of
 * Bass's chain. Bass already has a Channel EQ and a Utility, so the ORDER is
 * what the read-back checks: the moved pair must be last, EQ before Utility,
 * and Lead must be left with just the Pitch and the instrument.
 *
 * The two chains read back gate. Everything about the route is a signal: that
 * update-device made the move, one destination per device, and where each
 * destination points. Copying with ppal-duplicate and deleting the originals
 * ends in the same chains, so it passes.
 *
 * Gated on `largeModel`: the one-per-target rule is taught by the devices skill
 * small-model mode doesn't ship.
 *
 * `path-topath-devices` covers the single-device copy.
 */

import { asSignal } from "../../assertions/index.ts";
import { type EvalScenario } from "../../types.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
} from "../clip/helpers/clip-tool-constants.ts";
import { assertDestinationCounts } from "../path/path-assertions.ts";
import {
  assertPathEntries,
  assertTrackChain,
  pathEntries,
} from "./device-chain-readback.ts";

const TOOL_UPDATE_DEVICE = "ppal-update-device";

export const deviceMovePairing: EvalScenario = {
  id: "device-move-pairing",
  tags: ["devices", "pairing", "paths"],
  description: "Move two devices to another track with one toPath per device",
  kind: "capability",
  liveSet: "basic-midi-4-track",

  requires: { largeModel: true },

  messages: [
    MSG_CONNECT,
    "Move the Lead track's two audio effects to the end of the Bass track's device chain.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    // Route signals: reported, never gating.
    {
      type: "custom",
      signal: true,
      description: `${TOOL_UPDATE_DEVICE} turn 1: moved the devices with toPath`,
      assert: (turns) =>
        pathEntries(turns, {
          turn: 1,
          tool: TOOL_UPDATE_DEVICE,
          param: "toPath",
        }).length > 0,
    },
    // Two calls of one-and-one pass as well as one call of two-and-two.
    asSignal(
      assertDestinationCounts({
        turn: 1,
        tool: TOOL_UPDATE_DEVICE,
        against: ["id", "path"],
        rule: "equal",
      }),
    ),
    // Bare track, append, or an index: any of them is a valid place on Bass.
    asSignal(
      assertPathEntries({
        turn: 1,
        tool: TOOL_UPDATE_DEVICE,
        param: "toPath",
        accepted: /^t1(\/d(\d+|\+))?$/,
        count: 2,
        what: "a place on the Bass track",
      }),
    ),

    assertTrackChain("t1", [
      { type: "instrument-rack" },
      { type: "Channel EQ" },
      { type: "Utility" },
      { type: "Channel EQ" },
      { type: "Utility" },
    ]),
    assertTrackChain("t3", [{ type: "Pitch" }, { type: "instrument-rack" }]),

    { type: "token_usage", maxTokens: 3_000 },
  ],
};
