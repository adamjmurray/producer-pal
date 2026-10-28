// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario: act on the rack macros that are connected to something.
 *
 * Needs the Producer Pal remote script. Without it a rack read says only that
 * the rack has some mapping (`hasMappings`); with it the read lists which
 * macros are mapped (`macros.mapped`), and no tool can make or remove a mapping.
 *
 * The Bass track's rack ("Electric Bass Open") shows 8 macros. Only 6, 7 and 8
 * are mapped, and 1 to 5 sit at zero. The user asks for every connected macro
 * all the way up and the rest left alone, so the model must know which are
 * which: raising all eight, or only the ones at zero, or none, each fails.
 * Graded on the macro values read back, not on how the model found out.
 */

import { type EvalScenario } from "../../types.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
} from "../clip/helpers/clip-tool-constants.ts";
import { macroProblem } from "./helpers/device-param-readback.ts";

/** basic-midi-4-track: the Bass track's instrument rack. */
const BASS_RACK = "t1/d0";

/** The macros the Set maps, out of the 8 the rack shows. */
const MAPPED = [6, 7, 8];
const VISIBLE_MACROS = 8;

export const deviceMappedMacros: EvalScenario = {
  id: "device-mapped-macros",
  tags: ["devices"],
  description:
    "Turn up only the rack macros that are mapped to something, leave the rest",
  kind: "capability",
  liveSet: "basic-midi-4-track",
  judgeAdvisory: true,
  requires: { tools: ["ppal-read-device", "ppal-update-device"] },

  messages: [
    MSG_CONNECT,
    "On the Bass track's instrument rack, turn every macro that's connected to something all the way up. Leave the macros that aren't connected to anything where they are.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    {
      type: "state",
      tool: "ppal-read-device",
      args: { path: BASS_RACK, include: ["params", "param-values"] },
      expect: (result) => macroProblem(result, MAPPED, VISIBLE_MACROS) == null,
      explain: (result) =>
        macroProblem(result, MAPPED, VISIBLE_MACROS) ?? "macros are as wanted",
    },

    { type: "token_usage", maxTokens: 4_000 },

    {
      type: "llm_judge",
      prompt: `The Bass rack has 8 macros. Macros 6, 7 and 8 (Note Off Volume, Shaper,
Velocity Sens) are connected to something; macros 1 to 5 are not. The user asked
to turn the connected macros all the way up and leave the others alone. Evaluate
the final reply: it says macros 6, 7 and 8 (or those names) were turned up, and
does not claim to have changed macros 1 to 5. If it says it could not tell which
macros are connected, that is a fail.`,
    },
  ],
};
