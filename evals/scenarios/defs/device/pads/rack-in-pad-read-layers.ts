// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Reading what is layered inside a drum pad. The kick pad holds an Instrument
 * Rack with two layers (`setup` builds it), so the answer sits four levels
 * below the Drums track: pad, the pad's chain, the rack, its chains. The model
 * has to walk down to it; the layer names and instruments can't be guessed.
 *
 * Read-only: nothing may be written, and the rack must read back as built.
 */

import { getAllToolCalls } from "../../../assertions/index.ts";
import { type EvalScenario, type EvalTurnResult } from "../../../types.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
} from "../../clip/helpers/clip-tool-constants.ts";
import { TOOLS } from "#evals/shared/tool-names.ts";
import {
  assertRackLayers,
  layersAreUntouched,
} from "../helpers/rack-in-pad-readback.ts";
import {
  KICK_LAYERS,
  KICK_RACK,
  seedRacksInPads,
} from "../helpers/rack-in-pad-setup.ts";

const WRITE_TOOLS = new Set<string>([
  TOOLS.createDevice,
  TOOLS.updateDevice,
  TOOLS.delete,
  TOOLS.duplicate,
]);

/** Each layer's name and instrument, which only a read of the rack can give. */
const ANSWER_WORDS = [/\btop\b/i, /\bsub\b/i, /operator/i, /drift/i];

export const rackInPadReadLayers: EvalScenario = {
  id: "rack-in-pad-read-layers",
  tags: ["devices"],
  description:
    "Read the layers of an Instrument Rack inside the kick pad, without changing anything",
  kind: "capability",
  liveSet: "basic-midi-4-track",

  setup: seedRacksInPads,

  messages: [
    MSG_CONNECT,
    "On the Drums track, what is the kick made of? Tell me each of its layers by name and which instrument is in it.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    {
      type: "custom",
      description: "turn 1: the answer names both layers and both instruments",
      assert: (turns: EvalTurnResult[]) => {
        const answer = turns[1]?.assistantResponse ?? "";
        const missing = ANSWER_WORDS.filter((word) => !word.test(answer));

        if (missing.length > 0) {
          throw new Error(`answer is missing ${missing.join(", ")}`);
        }

        return true;
      },
    },
    {
      type: "custom",
      description: "turn 1: wrote nothing",
      assert: (turns: EvalTurnResult[]) => {
        const writes = getAllToolCalls(turns, 1).filter((call) =>
          WRITE_TOOLS.has(call.name),
        );

        if (writes.length > 0) {
          throw new Error(
            `a read-only question made ${writes.map((c) => c.name).join(", ")} calls`,
          );
        }

        return true;
      },
    },
    assertRackLayers(KICK_RACK, "both kick layers untouched", (result) =>
      layersAreUntouched(result, KICK_LAYERS),
    ),

    { type: "token_usage", maxTokens: 5_000 },
  ],
};
