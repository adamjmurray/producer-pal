// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Does the model reach the right section when asked for it by name?
 *
 * ppal-playback takes `loc:<name>` for `startTime` / `loopStart` / `loopEnd`,
 * but a computed bar lands in the same place, so only where the model lands is
 * graded, not how it spelled the position. The start turn reads the position
 * the call reported; the loop turn reads the loop back. A `loc:` naming the
 * wrong locator still fails, since it lands somewhere else. The copy is graded
 * on where it landed too. `path-locator-coordinate` is the check that a model
 * can write the `loc:` spelling.
 *
 * `kind: "capability"` — an improvement target, not a regression guard.
 *
 * Uses the arrangement-sections Set, the only one with named locators. It is
 * named by path because it lives under `e2e/live-sets/`; only bare names
 * default to `evals/live-sets/`.
 */

import { getToolCalls, parsedToolResult } from "../../../assertions/index.ts";
import {
  type EvalAssertion,
  type EvalScenario,
  type EvalTurnResult,
} from "../../../types.ts";
import { argText } from "../../arg-text.ts";
import { asArrangementTrack, clipStarts } from "../../arrangement-readback.ts";
import { TOOLS } from "#evals/shared/tool-names.ts";

const TOOL_PLAYBACK = TOOLS.playback;

/** The arrangement Set, named by path — it lives under e2e/live-sets/. */
const LIVE_SET =
  "e2e/live-sets/arrangement-sections Project/arrangement-sections.als";

/** Bass track index. Empty across the Bridge, which is where the copy lands. */
const BASS_TRACK_INDEX = 2;

/** Locator positions, from the Set's spec — verified against a real read. */
const CHORUS = "17|1";
const BRIDGE = "25|1";
const OUTRO = "33|1";

/** Bass clip starts after the copy: the three it ships with, plus the Bridge. */
const BASS_STARTS_AFTER_COPY = ["9|1", CHORUS, BRIDGE, OUTRO];

/** Reads the arrangement loop back: only play-arrangement reports it, so this
 *  restarts the transport. */
const LOOP_READ = { action: "play-arrangement" };

/**
 * The playback call in a turn, with its args and parsed result.
 *
 * @param turns - All turn results
 * @param turn - Turn index to read
 * @returns The call's args and result, or null when it made none
 */
function playbackCall(
  turns: EvalTurnResult[],
  turn: number,
): { args: Record<string, unknown>; result: Record<string, unknown> } | null {
  const call = getToolCalls(turns, turn).findLast(
    (c) => c.name === TOOL_PLAYBACK,
  );

  if (call == null) {
    return null;
  }

  return { args: call.args, result: parsedToolResult(call) ?? {} };
}

/**
 * Assert the start-playback call began at the chorus, however it was spelled.
 *
 * @param turn - Turn index to grade
 * @returns A custom assertion
 */
function assertStartedAtChorus(turn: number): EvalAssertion {
  return {
    type: "custom",
    description: `started playback at the chorus (${CHORUS})`,
    assert: (turns) => {
      const call = playbackCall(turns, turn);

      if (call == null) {
        throw new Error(`no ${TOOL_PLAYBACK} call in turn ${turn}`);
      }

      if (call.result.startTime !== CHORUS) {
        throw new Error(
          `expected the chorus (${CHORUS}), sent startTime=${argText(call.args.startTime) || "(unset)"}, got ${JSON.stringify(call.result)}`,
        );
      }

      return true;
    },
  };
}

export const locatorNavigation: EvalScenario = {
  id: "locator-navigation",
  tags: ["workflow"],
  description:
    "Navigate the arrangement to a named section (chorus, bridge, outro)",
  kind: "capability",
  liveSet: LIVE_SET,

  messages: [
    "Connect to Ableton Live",
    "Start playback from the chorus",
    "Now loop from the bridge to the outro",
    "Copy the bass part from the verse into the bridge",
    "Stop playback",
  ],

  assertions: [
    { type: "tool_called", tool: TOOLS.connect, turn: 0 },

    assertStartedAtChorus(1),

    // The loop read below grades where the loop landed, in either spelling.
    {
      type: "state",
      tool: TOOL_PLAYBACK,
      args: LOOP_READ,
      expect: (result) => {
        const loop = result as Record<string, unknown>;

        return (
          loop.loop === true &&
          loop.loopStart === BRIDGE &&
          loop.loopEnd === OUTRO
        );
      },
      explain: (result) =>
        `loop ${JSON.stringify(result)}, expected ${BRIDGE} to ${OUTRO}`,
    },

    {
      type: "state",
      tool: TOOLS.readTrack,
      args: { trackIndex: BASS_TRACK_INDEX, include: ["arrangement-clips"] },
      expect: (result) =>
        clipStarts(asArrangementTrack(result).arrangementClips).join(",") ===
        BASS_STARTS_AFTER_COPY.join(","),
      explain: (result) =>
        `bass clips at ${clipStarts(asArrangementTrack(result).arrangementClips).join(", ")}, expected ${BASS_STARTS_AFTER_COPY.join(", ")}`,
    },

    { type: "tool_called", tool: TOOL_PLAYBACK, turn: 4 },

    {
      type: "token_usage",
      maxTokens: 5_000,
    },
  ],
};
