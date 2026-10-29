// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario: `loc:<name>` works as a song position inside a path.
 *
 * `locator-navigation` grades only where a model lands, in either spelling. This
 * scenario is the only check that a model can write the `loc:` form: we know
 * `t2[loc:Bridge]` resolves in e2e, and nothing else shows a model can write
 * one.
 *
 * So this prompt asks for the locator spelling outright: a failure here means
 * the form itself is broken.
 *
 * All three writing tools are covered because they take the coordinate in
 * different params — `path` on create, `toPath` on update and duplicate — and
 * a break in one would not show in the others.
 *
 * No `requires` — a path coordinate is in every schema, small-model mode
 * included, unlike duplicate's `locator` param.
 */

import { argText } from "../arg-text.ts";
import { getToolCalls } from "../../assertions/index.ts";
import { type EvalAssertion, type EvalScenario } from "../../types.ts";
import { asArrangementTrack, clipStarts } from "../arrangement-readback.ts";
import { assertCallResult } from "./path-assertions.ts";
import { TOOLS } from "#evals/shared/tool-names.ts";

/** The arrangement Set, named by path — it lives under e2e/live-sets/. */
const LIVE_SET =
  "e2e/live-sets/arrangement-sections Project/arrangement-sections.als";

/** Bass. It ships with clips at the Verse, Chorus and Outro. */
const BASS_TRACK_INDEX = 2;

/** Where the Bridge locator sits, for grading the create's own result. */
const BRIDGE_POSITION = "[25|1]";

/**
 * Bass clip starts at the end of the run: the new clip moved to the Intro, its
 * copy at the Bridge, and the three the Set ships with. Every position here is
 * a locator, so a coordinate that resolved to the wrong bar shows up as a
 * missing one.
 */
const AFTER_DUPLICATE = ["1|1", "9|1", "17|1", "25|1", "33|1"];

const TOOL_CREATE_CLIP = TOOLS.createClip;

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
      const call = getToolCalls(turns, turn).findLast((c) => c.name === tool);

      if (call == null) {
        throw new Error(`no ${tool} call in turn ${turn}`);
      }

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
    tool: TOOLS.readTrack,
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
  tags: ["paths"],
  description: "Use loc:<name> as the song position inside a path",
  kind: "capability",
  liveSet: LIVE_SET,

  messages: [
    "Connect to Ableton Live",
    "Add an 8-bar clip to the Bass track's arrangement at the Bridge. Address it by the locator's name rather than working out its bar number.",
    "Move that clip to the Intro, again by locator name.",
    "Now duplicate it to the Bridge, again by locator name.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOLS.connect, turn: 0 },

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

    { type: "tool_called", tool: TOOLS.updateClip, turn: 2 },
    assertLocatorCoordinate({
      turn: 2,
      tool: TOOLS.updateClip,
      param: "toPath",
      locator: "Intro",
    }),
    { type: "tool_called", tool: TOOLS.duplicate, turn: 3 },
    assertLocatorCoordinate({
      turn: 3,
      tool: TOOLS.duplicate,
      param: "toPath",
      locator: "Bridge",
    }),

    // One read at the end covers the move and the copy both: the Intro start
    // is where the move put the clip, the Bridge start is where the copy went.
    assertBassClipsAt(AFTER_DUPLICATE),

    { type: "token_usage", maxTokens: 3_500 },
  ],
};
