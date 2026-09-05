// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: `loc:<name>` works as a song position inside a path.
 *
 * `locator-navigation` asks whether a model REACHES for a locator when nothing
 * points it there, and it currently fails every trial — models compute the bar
 * instead. That leaves the form itself unproven from a model's hands: we know
 * `t2[loc:Bridge]` resolves in e2e, and nothing shows a model can write one.
 *
 * So this prompt asks for the locator spelling outright. Between the two, a
 * failure is attributable: fail here and the form is broken, fail only there
 * and the model just didn't think of it.
 *
 * No `requires` — a path coordinate is in every schema, small-model mode
 * included, unlike duplicate's `locator` param.
 */

import { argText } from "../arg-text.ts";
import { getToolCalls } from "../../assertions/index.ts";
import { type EvalAssertion, type EvalScenario } from "../../types.ts";
import { asArrangementTrack, clipStarts } from "../arrangement-helpers.ts";
import { assertCallResult } from "./path-scenario-helpers.ts";

/** The arrangement Set, named by path — it lives under e2e/live-sets/. */
const LIVE_SET =
  "e2e/live-sets/arrangement-sections Project/arrangement-sections.als";

/** Bass. It ships with clips at the Verse, Chorus and Outro. */
const BASS_TRACK_INDEX = 2;

/** Where the Bridge locator sits, for grading the create's own result. */
const BRIDGE_POSITION = "[25|1]";

/** Bass clip starts after the new clip has moved to the Intro. */
const AFTER_MOVE = ["1|1", "9|1", "17|1", "33|1"];

const TOOL_CREATE_CLIP = "ppal-create-clip";
const TOOL_UPDATE_CLIP = "ppal-update-clip";

/** A path whose song position names a locator instead of a bar. */
const LOCATOR_COORDINATE = /\[\s*loc(?:ator)?\s*:/i;

/**
 * Assert a call spelled its destination with a `loc:` coordinate.
 *
 * @param options - What to grade
 * @param options.turn - Turn index containing the call
 * @param options.tool - Tool name
 * @param options.param - Which path param carries the destination
 * @param options.locator - Locator name the coordinate should reference
 * @returns A custom assertion
 */
function assertLocatorCoordinate(options: {
  turn: number;
  tool: string;
  param: string;
  locator: string;
}): EvalAssertion {
  const { turn, tool, param, locator } = options;

  return {
    type: "custom",
    description: `${tool} turn ${turn}: ${param} names the ${locator} locator`,
    assert: (turns) => {
      const call = getToolCalls(turns, turn).find((c) => c.name === tool);

      if (call == null) throw new Error(`no ${tool} call in turn ${turn}`);

      const path = argText(call.args[param]);

      if (!LOCATOR_COORDINATE.test(path)) {
        throw new Error(
          `${param} '${path || "(unset)"}' computes a position instead of naming a locator`,
        );
      }

      if (!new RegExp(locator, "i").test(path)) {
        throw new Error(`${param} '${path}' names the wrong locator`);
      }

      return true;
    },
  };
}

/**
 * Assert the Bass track's arrangement holds exactly these clip starts.
 *
 * @param expected - Bar positions, in bar order
 * @returns A state assertion
 */
function assertBassClipsAt(expected: string[]): EvalAssertion {
  return {
    type: "state",
    tool: "ppal-read-track",
    args: { trackIndex: BASS_TRACK_INDEX, include: ["arrangement-clips"] },
    expect: (result) =>
      clipStarts(asArrangementTrack(result).arrangementClips).join(",") ===
      expected.join(","),
    explain: (result) =>
      `bass clips at ${clipStarts(asArrangementTrack(result).arrangementClips).join(", ")}, expected ${expected.join(", ")}`,
  };
}

export const pathLocatorCoordinate: EvalScenario = {
  id: "path-locator-coordinate",
  description: "Use loc:<name> as the song position inside a path",
  kind: "capability",
  liveSet: LIVE_SET,

  messages: [
    "Connect to Ableton Live",
    "Add an 8-bar clip to the Bass track's arrangement at the Bridge. Address it by the locator's name rather than working out its bar number.",
    "Move that clip to the Intro, again by locator name.",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0 },

    { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },
    assertLocatorCoordinate({
      turn: 1,
      tool: TOOL_CREATE_CLIP,
      param: "path",
      locator: "Bridge",
    }),
    // The create's OWN result, not an end-of-run read: turn 2 moves this clip,
    // so a single state assertion would only ever see where it ended up.
    assertCallResult({
      turn: 1,
      tool: TOOL_CREATE_CLIP,
      what: `the clip landed at the Bridge (${BRIDGE_POSITION})`,
      check: (result) => argText(result.path).endsWith(BRIDGE_POSITION),
    }),

    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 2 },
    assertLocatorCoordinate({
      turn: 2,
      tool: TOOL_UPDATE_CLIP,
      param: "toPath",
      locator: "Intro",
    }),
    assertBassClipsAt(AFTER_MOVE),

    { type: "token_usage", metric: "inputTokens", maxTokens: 80_000 },
  ],
};
