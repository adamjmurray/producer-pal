// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Changing one layer of a rack inside a drum pad. The kick pad holds an
 * Instrument Rack with layers "Top" (-2 dB) and "Sub" (-4 dB); the user asks
 * for Top down by 6 dB. Three wrong turns are visible in the end state:
 *   - **the pad's fader** (the pad chain's gain) is not the layer's. The pad
 *     must still read 0 dB.
 *   - **the instrument's own volume** is not the layer's either: Top's chain
 *     must have moved.
 *   - **"down by 6"** is relative, so the new level is -8 dB, not -6: the model
 *     has to read the layer before writing it.
 * The other layer and the snare's rack must read back as built.
 */

import { type EvalScenario } from "../../../types.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
} from "../../clip/helpers/clip-tool-constants.ts";
import { TOOLS } from "#evals/shared/tool-names.ts";
import {
  DB_TOLERANCE,
  assertPadChains,
  assertRackLayers,
  holdsInstrument,
  isLayerUntouched,
  layersAreUntouched,
  rackChains,
} from "../helpers/rack-in-pad-readback.ts";
import {
  KICK_PAD,
  KICK_RACK,
  KICK_SUB,
  KICK_TOP,
  SNARE_LAYERS,
  SNARE_RACK,
  seedRacksInPads,
} from "../helpers/rack-in-pad-setup.ts";

const DROP_DB = 6;
const TOP_TARGET_DB = KICK_TOP.gainDb - DROP_DB;
/** "Down by 6" is a request, not a measurement: a dB either way is fine. */
const REQUEST_SLACK_DB = 1;

export const rackInPadLayerGain: EvalScenario = {
  id: "rack-in-pad-layer-gain",
  tags: ["devices"],
  description:
    "Turn one layer of a rack inside the kick pad down by 6 dB, leaving the other layer, the pad and the snare alone",
  kind: "capability",
  liveSet: "basic-midi-4-track",
  // The chain mixer params are hidden from small-model mode, so a small model
  // is never given the fader this scenario is about.
  requires: { params: ["gainDb"] },

  setup: seedRacksInPads,

  messages: [
    MSG_CONNECT,
    "On the Drums track, turn the kick's Top layer down by 6 dB.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    { type: "tool_called", tool: TOOLS.updateDevice, turn: 1 },

    assertRackLayers(
      KICK_RACK,
      `Top at ${TOP_TARGET_DB} dB (±${REQUEST_SLACK_DB}), Sub untouched`,
      (result) => {
        const chains = rackChains(result);
        const top = chains.find((chain) => chain.name === KICK_TOP.name);
        const sub = chains.find((chain) => chain.name === KICK_SUB.name);

        return (
          chains.length === 2 &&
          top != null &&
          top.state == null &&
          holdsInstrument(top, KICK_TOP.device) &&
          Math.abs((top.gainDb ?? 0) - TOP_TARGET_DB) <= REQUEST_SLACK_DB &&
          isLayerUntouched(sub, KICK_SUB)
        );
      },
    ),
    assertPadChains(
      KICK_PAD,
      "the kick pad's own fader still at 0 dB",
      (chains) =>
        chains.length === 1 && Math.abs(chains[0]?.gainDb ?? 0) <= DB_TOLERANCE,
    ),
    assertRackLayers(SNARE_RACK, "snare layers untouched", (result) =>
      layersAreUntouched(result, SNARE_LAYERS),
    ),

    { type: "token_usage", maxTokens: 8_000 },
  ],
};
