// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario: addressing a device by its type — `t3/inst`, `t3/mfx0`, `t3/afx1`.
 *
 * On the Lead track the instrument is NOT the first device: a Pitch MIDI effect
 * sits in front of it, so a guessed `t3/d0` renames the wrong device. The
 * by-type paths skip that guess: `inst` is the instrument wherever it sits, and
 * `mfx<n>` / `afx<n>` count only MIDI / audio effects. Lead's chain is Pitch,
 * the instrument rack, Channel EQ, Utility, so its second audio effect is
 * `afx1` (the Utility), not `d2`.
 *
 * Renames, not parameter writes, so the grade doesn't lean on a device's
 * parameter names. The chain read back gates: each name on the right device,
 * the order untouched. Reading the chain first and writing `t3/d1`, `t3/d0` and
 * `t3/d3` is a route the docs teach too, so it passes. Two signals report the
 * route: whether all three by-type paths were sent, and whether the model wrote
 * without reading the chain first.
 *
 * Gated on `largeModel`: small-model mode ships no device paths skill, so the
 * by-type spellings are never taught there.
 */

import { getAllToolCalls } from "../../assertions/index.ts";
import { type EvalScenario } from "../../types.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
} from "../clip/helpers/clip-tool-constants.ts";
import {
  assertTrackChain,
  pathEntries,
} from "./helpers/device-chain-readback.ts";

const TOOL_UPDATE_DEVICE = "ppal-update-device";

/** Lead is track 3 in basic-midi-4-track. */
const LEAD_PATH = "t3";

/** Reads that show a track's devices. */
const READ_TOOLS = new Set(["ppal-read-track", "ppal-read-device"]);

/** The three by-type paths the prompt calls for, in the order it names them. */
const BY_TYPE_PATHS = ["t3/inst", "t3/mfx0", "t3/afx1"];

export const deviceTypePaths: EvalScenario = {
  id: "device-type-paths",
  tags: ["devices", "paths"],
  description: "Name Lead's instrument and effects with inst/mfx/afx paths",
  kind: "capability",
  liveSet: "basic-midi-4-track",

  requires: { largeModel: true },

  messages: [
    MSG_CONNECT,
    'On the Lead track\'s own device chain (not inside the instrument rack), rename the instrument to "Lead Synth", the MIDI effect to "Transposer", and the second audio effect to "Lead Gain".',
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    // Route signals: reported, never gating.
    {
      type: "custom",
      signal: true,
      description: `${TOOL_UPDATE_DEVICE} turn 1: addressed the devices as ${BY_TYPE_PATHS.join(", ")}`,
      assert: (turns) => {
        const sent = pathEntries(turns, {
          turn: 1,
          tool: TOOL_UPDATE_DEVICE,
          param: "path",
        });
        const missing = BY_TYPE_PATHS.filter((path) => !sent.includes(path));

        if (missing.length > 0) {
          throw new Error(
            `missing ${missing.join(", ")}; sent ${sent.join(", ") || "no paths"}`,
          );
        }

        return true;
      },
    },

    {
      type: "custom",
      signal: true,
      description: "turn 1: wrote the paths without reading the chain first",
      assert: (turns) => {
        const calls = getAllToolCalls(turns, 1);
        const firstWrite = calls.findIndex(
          (c) => c.name === TOOL_UPDATE_DEVICE,
        );
        const readBefore = calls
          .slice(0, Math.max(firstWrite, 0))
          .filter((c) => READ_TOOLS.has(c.name));

        if (readBefore.length > 0) {
          throw new Error(
            `read first: ${readBefore.map((c) => c.name).join(", ")}`,
          );
        }

        return true;
      },
    },

    // Same devices in the same order; only the three names change.
    assertTrackChain(LEAD_PATH, [
      { type: "Pitch", name: "Transposer" },
      { type: "instrument-rack", name: "Lead Synth" },
      { type: "Channel EQ", name: null },
      { type: "Utility", name: "Lead Gain" },
    ]),

    { type: "token_usage", maxTokens: 3_000 },
  ],
};
