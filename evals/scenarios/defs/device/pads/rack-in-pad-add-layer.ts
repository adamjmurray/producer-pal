// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Adding a layer to a rack inside a drum pad. The snare pad holds an
 * Instrument Rack with layers "Body" and "Snap"; the user asks for a third one
 * with a Wavetable. The pad itself also takes layers (a second chain on the
 * pad), and that is the wrong one here: the new layer belongs in the rack, next
 * to the two it names. So the end state has to show:
 *   - three layers in the snare's rack, the new one holding a Wavetable;
 *   - Body and Snap as built;
 *   - the snare pad still with its one chain;
 *   - the kick's rack untouched.
 */

import { type EvalScenario } from "../../../types.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
} from "../../clip/helpers/clip-tool-constants.ts";
import {
  assertPadChains,
  assertRackLayers,
  holdsInstrument,
  isLayerUntouched,
  layersAreUntouched,
  rackChains,
} from "../helpers/rack-in-pad-readback.ts";
import {
  KICK_LAYERS,
  KICK_RACK,
  SNARE_LAYERS,
  SNARE_PAD,
  SNARE_RACK,
  seedRacksInPads,
} from "../helpers/rack-in-pad-setup.ts";

const NEW_INSTRUMENT = "Wavetable";

export const rackInPadAddLayer: EvalScenario = {
  id: "rack-in-pad-add-layer",
  tags: ["devices"],
  description:
    "Add a third layer (a Wavetable) to the rack inside the snare pad, next to the two it has",
  kind: "capability",
  liveSet: "basic-midi-4-track",

  setup: seedRacksInPads,

  messages: [
    MSG_CONNECT,
    `On the Drums track, the snare is built from two layers, Body and Snap. Add a third layer to it with a ${NEW_INSTRUMENT} synth.`,
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    assertRackLayers(
      SNARE_RACK,
      `Body and Snap as built, plus one new layer holding a ${NEW_INSTRUMENT}`,
      (result) => {
        const chains = rackChains(result);
        const added = chains.filter(
          (chain) => !SNARE_LAYERS.some((spec) => spec.name === chain.name),
        );

        return (
          chains.length === SNARE_LAYERS.length + 1 &&
          SNARE_LAYERS.every((spec) =>
            isLayerUntouched(
              chains.find((chain) => chain.name === spec.name),
              spec,
            ),
          ) &&
          added.length === 1 &&
          added[0] != null &&
          added[0].state == null &&
          holdsInstrument(added[0], NEW_INSTRUMENT)
        );
      },
    ),
    assertPadChains(
      SNARE_PAD,
      "the snare pad still with its one chain (the layer went into the rack)",
      (chains) => chains.length === 1,
    ),
    assertRackLayers(KICK_RACK, "kick layers untouched", (result) =>
      layersAreUntouched(result, KICK_LAYERS),
    ),

    { type: "token_usage", maxTokens: 8_000 },
  ],
};
