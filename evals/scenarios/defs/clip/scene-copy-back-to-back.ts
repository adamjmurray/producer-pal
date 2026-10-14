// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario: copy several scenes into the arrangement back to back.
 *
 * A scene is as long as its longest clip, so where the next scene starts
 * depends on the one before it. `read-scene` doesn't report a length, and
 * `ppal-duplicate` refuses one start for several scenes, so the model has to
 * work the lengths out and give each scene its own position.
 *
 * `setup` gives the scenes different lengths:
 *   - scene 1: Drums and Lead, 2 bars each (in the Set already)  -> 2 bars
 *   - scene 2: Bass, 4 bars                                      -> 4 bars
 *   - scene 3: Drums 1 bar, Lead 2 bars                          -> 2 bars
 * Starting at bar 17, the scenes begin at bars 17, 19 and 23.
 *
 * Graded on where clips end up on each track, however the model got them
 * there. A scene copy tiles a short clip to the scene's length, so Drums may
 * also carry a second 1-bar clip at bar 24.
 */

import { type Client } from "@modelcontextprotocol/sdk/client/index.js";
import { extractToolResultText } from "#evals/chat/mcp.ts";
import { type EvalAssertion, type EvalScenario } from "../../types.ts";
import { asArrangementTrack, clipStarts } from "../arrangement-readback.ts";
import {
  MSG_CONNECT,
  TOOL_CONNECT,
  TOOL_CREATE_CLIP,
} from "./helpers/clip-tool-constants.ts";
import { clearClipSlots } from "./helpers/clip-turn-readers.ts";

const DRUMS = 0;
const BASS = 1;
const LEAD = 3;

/** One clip `setup` adds: where it goes, what it plays, how long. */
interface SetupClip {
  path: string;
  notes: string;
  length: string;
}

/** Scene 2 holds a 4-bar clip; scene 3 a 1-bar and a 2-bar one. */
const SETUP_CLIPS: SetupClip[] = [
  { path: "t1/s1", notes: "C2 1|1,2|1,3|1,4|1", length: "4bar" },
  { path: "t0/s2", notes: "C1 1|1", length: "1bar" },
  { path: "t3/s2", notes: "C3 1|1 E3 2|1", length: "2bar" },
];

/**
 * Put the scene 2 and 3 clips in place, after clearing their slots so a re-run
 * against an open Set starts the same.
 *
 * @param mcpClient - MCP client for tool calls
 */
async function seedScenes(mcpClient: Client): Promise<void> {
  await clearClipSlots(mcpClient, ["1/1", "0/2", "3/2"]);

  for (const clip of SETUP_CLIPS) {
    const result = await mcpClient.callTool({
      name: TOOL_CREATE_CLIP,
      arguments: { ...clip },
    });

    if (result.isError === true) {
      throw new Error(
        `could not create ${clip.path}: ${extractToolResultText(result)}`,
      );
    }
  }
}

/**
 * Check one track's arrangement: every `required` start is there, and nothing
 * starts anywhere outside `required` plus `allowed`. A scene placed by the
 * wrong length (scene 3 at bar 21, say) shows up as a stray start.
 *
 * @param track - Track index
 * @param required - Bar|beat starts the track must have
 * @param allowed - Further starts that are fine
 * @returns A state assertion over the track's arrangement clips
 */
function assertStarts(
  track: number,
  required: string[],
  allowed: string[] = [],
): EvalAssertion {
  const problem = (result: unknown): string | null => {
    const starts = clipStarts(asArrangementTrack(result).arrangementClips);
    const missing = required.filter((start) => !starts.includes(start));
    const stray = starts.filter(
      (start) => !required.includes(start) && !allowed.includes(start),
    );

    if (missing.length === 0 && stray.length === 0) {
      return null;
    }

    return `clips at ${starts.join(", ") || "none"}; missing ${missing.join(", ") || "none"}, unexpected ${stray.join(", ") || "none"}`;
  };

  return {
    type: "state",
    tool: "ppal-read-track",
    args: { path: `t${track}`, include: ["arrangement-clips"] },
    expect: (result) => problem(result) == null,
    explain: (result) => `t${track}: ${problem(result) ?? "ok"}`,
  };
}

export const sceneCopyBackToBack: EvalScenario = {
  id: "scene-copy-back-to-back",
  tags: ["clips"],
  description:
    "Copy scenes of different lengths into the arrangement, back to back",
  kind: "capability",
  liveSet: "basic-with-drum-and-lead-clips",
  setup: seedScenes,

  messages: [
    MSG_CONNECT,
    "Copy scenes 1 to 3 into the arrangement back to back, starting at bar 17.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    // Scene 1 at 17, scene 2 at 19 (after 2 bars), scene 3 at 23 (after 4 more).
    assertStarts(DRUMS, ["17|1", "23|1"], ["24|1"]),
    assertStarts(BASS, ["19|1"]),
    assertStarts(LEAD, ["17|1", "23|1"]),

    { type: "token_usage", maxTokens: 4_000 },
  ],
};
