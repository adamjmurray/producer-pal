// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario: naming a track or scene by where it is.
 *
 * The whole weight of a track's role now sits on its path. `type` stopped
 * saying "return" or "master", and `trackType`/`trackIndex` are retired, so
 * `rt1` and `mt` are the only published way to reach a return track or the
 * main one. This is the run that says whether models reach for them unaided —
 * if they don't, that decision is the first to revisit.
 *
 * Creating is graded too, since `t+`/`rt+`/`s+` are the same bet: "at the end"
 * used to be an omitted index, and is now something you spell.
 *
 * Writes and creates, so it can't reuse an open Set.
 */

import { type EvalScenario } from "../../types.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
} from "../clip/helpers/clip-tool-constants.ts";
import { assertCallResult, assertPathArg } from "./path-assertions.ts";
import { TOOLS } from "#evals/shared/tool-names.ts";

const TOOL_READ_TRACK = TOOLS.readTrack;

/**
 * Read a result's path, whichever shape the tool returned it in.
 * @param result - A parsed tool result
 * @returns The path, or ""
 */
function resultPath(result: Record<string, unknown>): string {
  return typeof result.path === "string" ? result.path : "";
}

export const pathTrackSceneAddress: EvalScenario = {
  id: "path-track-scene-address",
  tags: ["paths"],
  description: "Reach a return track, the main track, and the end of the Set",
  kind: "capability",
  liveSet: "basic-midi-4-track",

  messages: [
    MSG_CONNECT,
    "What devices are on the B-Reverb return track?",
    "Turn the main track down 3 dB.",
    "Add a return track called Tape Delay.",
    "Add an empty scene at the end called Outro.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    { type: "tool_called", tool: TOOL_READ_TRACK, turn: 1 },
    assertPathArg({
      turn: 1,
      tool: TOOL_READ_TRACK,
      param: "path",
      expected: "rt1",
      allowList: true,
    }),

    { type: "tool_called", tool: TOOLS.updateTrack, turn: 2 },
    assertPathArg({
      turn: 2,
      tool: TOOLS.updateTrack,
      param: "path",
      expected: "mt",
    }),

    { type: "tool_called", tool: TOOLS.createTrack, turn: 3 },
    assertPathArg({
      turn: 3,
      tool: TOOLS.createTrack,
      param: "path",
      expected: "rt+",
    }),
    // The Set has two returns, so a third lands at rt2.
    assertCallResult({
      turn: 3,
      tool: TOOLS.createTrack,
      what: "added the return track after the existing two",
      check: (result) => resultPath(result) === "rt2",
    }),

    { type: "tool_called", tool: TOOLS.createScene, turn: 4 },
    assertPathArg({
      turn: 4,
      tool: TOOLS.createScene,
      param: "path",
      expected: "s+",
    }),
    // Eight scenes to start with, so "at the end" is s8. An off-by-one here
    // means the model counted rather than spelling the append.
    assertCallResult({
      turn: 4,
      tool: TOOLS.createScene,
      what: "added the scene after the existing eight",
      check: (result) => resultPath(result) === "s8",
    }),

    { type: "token_usage", maxTokens: 3_500 },
  ],
};
