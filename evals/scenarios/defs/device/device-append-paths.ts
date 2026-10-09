// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario: append paths — `d+` for a device at the end of a chain, `c+` for a
 * new chain at the end of a rack.
 *
 * A model without them has to read the chain, count, and write `d4`. The count
 * goes wrong when anything changed since the read, and two inserts in one call
 * shift each other. `t3/d+` names "after whatever is there", so the call needs
 * no read and a list of them lands in order.
 *
 * The chain and rack read back after the run gate, so an explicit index
 * (`t3/d4`, `t3/d1/c2`) passes as well as `d+` and `c+`. The path entries are
 * reported as signals.
 *
 * Three turns on the Lead track (Pitch, instrument rack, Channel EQ, Utility):
 * one device appended, two appended in one call, and a Wavetable put in a new
 * chain of the instrument rack at `t3/d1`. The chain read back after the run
 * grades the order; the rack read grades that the new chain is the last one.
 *
 * Not gated: create-device's small-model description teaches both spellings.
 */

import { asSignal } from "../../assertions/index.ts";
import { type EvalAssertion, type EvalScenario } from "../../types.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
} from "../clip/helpers/clip-tool-constants.ts";
import {
  assertPathEntries,
  assertTrackChain,
} from "./helpers/device-chain-readback.ts";

const TOOL_CREATE_DEVICE = "ppal-create-device";

/** Lead is track 3 in basic-midi-4-track; its instrument rack is device 1. */
const LEAD_PATH = "t3";
const RACK_PATH = "t3/d1";

/** What the new rack chain's device is called, so the read can find it. */
const NEW_LAYER = "Layer 2";

/** The rack read back as the model left it. */
interface RackRead {
  chains?: { devices?: { name?: string; type?: string }[] }[];
}

/**
 * Whether a rack chain holds the Wavetable named `Layer 2`.
 *
 * @param chain - A chain read from the rack
 * @returns True when it holds that device
 */
function holds(chain: NonNullable<RackRead["chains"]>[number]): boolean {
  return (chain.devices ?? []).some(
    (d) => d.name === NEW_LAYER && (d.type ?? "").includes("Wavetable"),
  );
}

/**
 * The Wavetable named `Layer 2` is alone in the rack's LAST chain, which is
 * where `c+` puts a new chain.
 *
 * @returns A state assertion over the instrument rack
 */
function assertLayerInNewLastChain(): EvalAssertion {
  return {
    type: "state",
    tool: "ppal-read-device",
    args: { path: RACK_PATH, include: ["chains"], maxDepth: 1 },
    expect: (result) => {
      const chains = (result as RackRead).chains ?? [];

      return chains.filter(holds).length === 1 && holds(chains.at(-1) ?? {});
    },
    explain: (result) =>
      `expected one chain holding a Wavetable named "${NEW_LAYER}", and it last; got ${JSON.stringify(result).slice(0, 300)}`,
  };
}

export const deviceAppendPaths: EvalScenario = {
  id: "device-append-paths",
  tags: ["devices", "paths"],
  description: "Append devices with d+ and a rack chain with c+",
  kind: "capability",
  liveSet: "basic-midi-4-track",

  messages: [
    MSG_CONNECT,
    "Add a Reverb at the end of the Lead track's device chain.",
    "Now add a Compressor and then a Limiter to the end of that same chain.",
    'Add a Wavetable in a new chain in the Lead track\'s instrument rack, and name the Wavetable "Layer 2".',
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    asSignal(
      assertPathEntries({
        turn: 1,
        tool: TOOL_CREATE_DEVICE,
        param: "path",
        accepted: /^t3\/d\+$/,
        count: 1,
        what: "append paths (t3/d+)",
      }),
    ),

    asSignal(
      assertPathEntries({
        turn: 2,
        tool: TOOL_CREATE_DEVICE,
        param: "path",
        accepted: /^t3\/d\+$/,
        count: 2,
        what: "append paths (t3/d+)",
      }),
    ),

    asSignal(
      assertPathEntries({
        turn: 3,
        tool: TOOL_CREATE_DEVICE,
        param: "path",
        accepted: /^t3\/(d1|inst)\/c\+$/,
        count: 1,
        what: "append paths (t3/d1/c+)",
      }),
    ),

    // Appended in the order asked for, after the four that were there.
    assertTrackChain(LEAD_PATH, [
      { type: "Pitch" },
      { type: "instrument-rack" },
      { type: "Channel EQ" },
      { type: "Utility" },
      { type: "Reverb" },
      { type: "Compressor" },
      { type: "Limiter" },
    ]),
    assertLayerInNewLastChain(),

    { type: "token_usage", maxTokens: 5_000 },
  ],
};
