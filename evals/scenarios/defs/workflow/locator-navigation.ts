// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Does the model navigate by SECTION NAME, or compute a bar number?
 *
 * "Play from the chorus" and "copy the verse into the bridge" are how people
 * actually talk about an arrangement, and both have a spelling built for them:
 * `loc:<name>` on ppal-playback's `startTime` / `loopStart` / `loopEnd`, and
 * `locator` on ppal-duplicate.
 *
 * The trap is that computing the bar WORKS. A model that reads the locator list,
 * works out that Chorus is bar 17, and passes `startTime: "17|1"` lands the
 * playhead in exactly the right place — so an outcome-only check passes a model
 * that never found the feature. That is why each turn grades the ARGUMENT as
 * well as the result. The e2e suite already proves the values resolve names and
 * ids against a real Set (`control/ppal-playback`, `operations/ppal-duplicate`);
 * what is unmeasured is whether a model reaches for them.
 *
 * `kind: "capability"` — this is an improvement target, not a regression guard.
 *
 * Uses the arrangement-sections Set, the only one with named locators. It lives
 * under `e2e/live-sets/` and is named by path: `resolveLiveSetPath` returns any
 * value containing `/` unchanged, and only bare names default to
 * `evals/live-sets/`.
 */

import { getToolCalls, parsedToolResult } from "../../assertions/index.ts";
import {
  type EvalAssertion,
  type EvalScenario,
  type EvalTurnResult,
} from "../../types.ts";
import { argText } from "../arg-text.ts";
import { asArrangementTrack, clipStarts } from "../arrangement-helpers.ts";

const TOOL_PLAYBACK = "ppal-playback";
const TOOL_DUPLICATE = "ppal-duplicate";

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
  const call = getToolCalls(turns, turn).find((c) => c.name === TOOL_PLAYBACK);

  if (call == null) return null;

  return { args: call.args, result: parsedToolResult(call) ?? {} };
}

/** A song position that names a locator rather than a computed bar. */
const LOCATOR_VALUE = /^\s*loc(?:ator)?:/i;

/**
 * Assert the model named a locator rather than computing a bar position.
 *
 * @param turn - Turn index to grade
 * @param positionParams - Song-position params the call should spell with loc:
 * @param expected - Human-readable description of the expected placement
 * @param check - Reads the playback result; returns true when the placement landed
 * @returns A custom assertion
 */
function assertNavigatedByLocator(
  turn: number,
  positionParams: string[],
  expected: string,
  check: (result: Record<string, unknown>) => boolean,
): EvalAssertion {
  return {
    type: "custom",
    description: `spelled ${positionParams.join(" + ")} as loc: and reached ${expected}`,
    assert: (turns) => {
      const call = playbackCall(turns, turn);

      if (call == null)
        throw new Error(`no ${TOOL_PLAYBACK} call in turn ${turn}`);

      // Report the idiom AND the outcome together. A computed position and a
      // wrong result usually have the same cause, and seeing only the first
      // sends you probing Live to find out whether the placement even landed.
      const issues: string[] = [];
      const computed = positionParams
        .map((p) => [p, argText(call.args[p])] as const)
        .filter(([, value]) => !LOCATOR_VALUE.test(value));

      if (computed.length > 0) {
        issues.push(
          `did not name a locator: ` +
            computed
              .map(([p, value]) => `${p}=${value || "(unset)"}`)
              .join(", "),
        );
      }

      if (!check(call.result)) {
        issues.push(`expected ${expected}, got ${JSON.stringify(call.result)}`);
      }

      if (issues.length > 0) throw new Error(issues.join(" — "));

      return true;
    },
  };
}

/**
 * Assert the duplicate placed the copy by locator name, not a computed bar.
 *
 * @param turn - Turn index to grade
 * @returns A custom assertion
 */
function assertDuplicatedToLocator(turn: number): EvalAssertion {
  return {
    type: "custom",
    description: "placed the copy with duplicate's locator param",
    assert: (turns) => {
      const call = getToolCalls(turns, turn).find(
        (c) => c.name === TOOL_DUPLICATE,
      );

      if (call == null)
        throw new Error(`no ${TOOL_DUPLICATE} call in turn ${turn}`);

      const locator = argText(call.args.locator);

      if (!locator) {
        const start = argText(call.args.arrangementStart);

        throw new Error(
          start
            ? `computed the position instead: arrangementStart=${start}`
            : "no locator and no arrangementStart — nothing placed the copy",
        );
      }

      if (!/bridge|locator-3/i.test(locator)) {
        throw new Error(`expected the Bridge locator, got "${locator}"`);
      }

      return true;
    },
  };
}

export const locatorNavigation: EvalScenario = {
  id: "locator-navigation",
  description: "Navigate the arrangement by section name, not by bar number",
  kind: "capability",
  liveSet: LIVE_SET,

  // duplicate's locator param is hidden in small-model mode, so a small model
  // is never offered the whole feature this grades.
  requires: { params: ["locator"] },

  messages: [
    "Connect to Ableton Live",
    "Start playback from the chorus",
    "Now loop from the bridge to the outro",
    "Copy the bass part from the verse into the bridge",
    "Stop playback",
  ],

  assertions: [
    { type: "tool_called", tool: "ppal-connect", turn: 0 },

    assertNavigatedByLocator(
      1,
      ["startTime"],
      `the chorus (${CHORUS})`,
      (result) => result.currentTime === CHORUS,
    ),

    assertNavigatedByLocator(
      2,
      ["loopStart", "loopEnd"],
      `a ${BRIDGE}-${OUTRO} loop`,
      (result) => {
        const loop = result.arrangementLoop as
          | { start?: string; end?: string }
          | undefined;

        return loop?.start === BRIDGE && loop.end === OUTRO;
      },
    ),

    assertDuplicatedToLocator(3),

    {
      type: "state",
      tool: "ppal-read-track",
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
      metric: "inputTokens",
      maxTokens: 120_000,
    },
  ],
};
