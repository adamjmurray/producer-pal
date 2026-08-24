// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario for the create-clip `length` duration-argument grammar.
 *
 * Requires Ableton (agentic — drives a live model against Live).
 *
 * The grammar itself (`Nbar`, `n<fraction>`, `Nbar+n<fraction>`; rejection of
 * bare numbers / bare fractions / the retired `2:0` glyph) is fully covered at
 * the parse level in `src/notation/barbeat/time/tests/barbeat-time-durations.test.ts`.
 * This scenario measures the *reach-for* signal instead: does the model EMIT
 * the new grammar in the `length` arg, and — critically — does it keep the
 * `Nbar+n<fraction>` combiner as bar-plus-note-value rather than collapsing it
 * into a single absolute fraction.
 *
 * Headline metric: the `length` arg string the model sends. Assertions inspect
 * the arg directly (the create-clip result only echoes `length` back when it
 * was NOT supplied, so the arg is the reliable signal).
 */

import { argText } from "../../arg-text.ts";
import { getToolCalls } from "../../../assertions/index.ts";
import {
  type EvalAssertion,
  type EvalScenario,
  type EvalTurnResult,
} from "../../../types.ts";
import { MSG_CONNECT, TOOL_CONNECT } from "../helpers/clip-scenario-helpers.ts";

const TOOL_CREATE_CLIP = "ppal-create-clip";
const LIVE_SET = "basic-midi-4-track";

/**
 * Pull the `length` arg from the create-clip call in `turn`. Prefers the call
 * that actually carried a `length` arg when several create-clip calls exist.
 *
 * @param turns - All turn results
 * @param turn - Turn index to inspect
 * @returns the length arg string (empty string if absent)
 */
function getLengthArg(turns: EvalTurnResult[], turn: number): string {
  const calls = getToolCalls(turns, turn).filter(
    (c) => c.name === TOOL_CREATE_CLIP,
  );

  if (calls.length === 0) {
    throw new Error(`${TOOL_CREATE_CLIP} not found in turn ${turn}`);
  }

  const call = calls.find((c) => c.args.length != null) ?? calls[0];

  return argText(call?.args.length);
}

/**
 * Assert the `length` arg in `turn` matches `pattern`.
 *
 * @param turn - Turn index to inspect
 * @param pattern - Regex the length arg must match
 * @param description - Human-readable description of the check
 * @returns Custom assertion
 */
function assertLengthArg(
  turn: number,
  pattern: RegExp,
  description: string,
): EvalAssertion {
  return {
    type: "custom",
    description,
    assert: (turns) => {
      const length = getLengthArg(turns, turn);

      if (!pattern.test(length)) {
        throw new Error(
          `length arg ${JSON.stringify(length)} did not match ${pattern}`,
        );
      }

      return true;
    },
  };
}

/**
 * One scenario, three length probes — hardest first, because each turn primes
 * the next: once the model has emitted `1bar+n/4` it is unlikely to fumble
 * `4bar`. The combiner is the probe worth protecting, so it runs unprimed.
 *
 *  1. 6/8 combiner: "one bar plus one extra quarter note" = `1bar+n/4` = 4
 *     quarter notes. Collapsing it to `n5/4` (5 quarters) is right in 4/4 and
 *     WRONG in 6/8 — running it in 6/8 is what makes the misread observable.
 *  2. Whole bars: "4 bars" → `4bar`, never a bare `4` (a parse error).
 *  3. Sub-bar: "one quarter note long" → `n/4`, never a bare `1/4` (that means
 *     beats, not a note value, and the length parser rejects it).
 *
 * Each clip goes in its own scene so a later create can't trip over an earlier
 * one.
 */
export const durationArgGrammar: EvalScenario = {
  id: "duration-arg-grammar",
  description:
    "Clip lengths use the duration-arg grammar: 1bar+n/4 (6/8), 4bar, n/4",
  kind: "capability",
  liveSet: LIVE_SET,

  messages: [
    MSG_CONNECT,
    "On the Drums track, create an empty MIDI clip in the first scene, in 6/8 time, that is exactly one bar plus one extra quarter note long.",
    "Now create an empty 4-bar MIDI clip on the Drums track in the second scene (no notes yet — just set its length to 4 bars).",
    "Now create a very short empty MIDI clip on the Drums track in the third scene that is exactly one quarter note long.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    // Turn 1 — the combiner. Must be a bar count then `+n<fraction>`: this
    // rejects both `n5/4` (collapsed) and `1.25bar` (non-grammar).
    { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },
    assertLengthArg(
      1,
      /^\s*1\s*bar\s*\+\s*n1?\/4\s*$/i,
      "length arg is `1bar+n/4`, not collapsed to n5/4",
    ),
    {
      type: "custom",
      description: "6/8 time signature was applied to the clip",
      assert: (turns) => {
        const calls = getToolCalls(turns, 1).filter(
          (c) => c.name === TOOL_CREATE_CLIP,
        );
        const call = calls.find((c) => c.args.timeSignature != null);
        const ts = argText(call?.args.timeSignature);

        if (ts !== "6/8") {
          throw new Error(
            `expected 6/8 timeSignature, got ${JSON.stringify(ts)}`,
          );
        }

        return true;
      },
    },

    // Turn 2 — whole bars. `4bar`, with or without internal whitespace.
    { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 2 },
    assertLengthArg(2, /^\s*4\s*bar\s*$/i, "length arg is `4bar`, not bare 4"),

    // Turn 3 — sub-bar. `n/4` or `n1/4`, the n-prefixed note value.
    { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 3 },
    assertLengthArg(
      3,
      /^\s*n1?\/4\s*$/,
      "length arg is `n/4` (note value), not bare 1/4",
    ),

    { type: "token_usage", metric: "inputTokens", maxTokens: 200_000 },
  ],
};
