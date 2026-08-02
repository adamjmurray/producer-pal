// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenarios for the create-clip `length` duration-argument grammar.
 *
 * Requires Ableton (agentic — drives a live model against Live).
 *
 * The grammar itself (`Nbar`, `n<fraction>`, `Nbar+n<fraction>`; rejection of
 * bare numbers / bare fractions / the retired `2:0` glyph) is fully covered at
 * the parse level in `src/notation/barbeat/time/tests/barbeat-time-durations.test.ts`.
 * These scenarios measure the *reach-for* signal instead: does the model EMIT
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
import { MSG_CONNECT, TOOL_CONNECT } from "../clip-scenario-helpers.ts";

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
 * Whole-bar length: "4 bars" should become a `Nbar` arg, never a fraction or a
 * bare number (bare `4` is a parse error).
 */
export const durationArgBarLength: EvalScenario = {
  id: "duration-arg-bar-length",
  description: "4-bar empty clip → length arg uses `Nbar` grammar",
  kind: "capability",
  liveSet: LIVE_SET,

  messages: [
    MSG_CONNECT,
    "On the Drums track, create an empty 4-bar MIDI clip in the first scene (no notes yet — just set its length to 4 bars).",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },

    // `4bar` (with or without internal whitespace). Reject a bare `4` or a
    // fraction masquerading as the length.
    assertLengthArg(1, /^\s*4\s*bar\s*$/i, "length arg is `4bar`, not bare 4"),

    {
      type: "llm_judge",
      prompt: `Evaluate ONLY the create-clip call (turn 1):
1. An empty 4-bar clip was created on the Drums track in scene 1
2. The length was expressed in bars (e.g. "4bar") — NOT as a bare number (4), a bare fraction, or a bar|beat position glyph
3. The model did not add notes it wasn't asked for`,
    },

    { type: "token_usage", metric: "inputTokens", maxTokens: 80_000 },
  ],
};

/**
 * Sub-bar length: a clip "one quarter note long" should be `n/4` (an absolute
 * note value), never a bare fraction `1/4` (which means beats, not a note
 * value, and is rejected by the length parser).
 */
export const durationArgSubBar: EvalScenario = {
  id: "duration-arg-sub-bar",
  description: "Quarter-note-long clip → length arg uses `n<fraction>` grammar",
  kind: "capability",
  liveSet: LIVE_SET,

  messages: [
    MSG_CONNECT,
    "On the Drums track, create a very short empty MIDI clip in the first scene that is exactly one quarter note long.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },

    // n/4 or n1/4 — the n-prefixed note value. A bare 1/4 would be rejected.
    assertLengthArg(
      1,
      /^\s*n1?\/4\s*$/,
      "length arg is `n/4` (note value), not bare 1/4",
    ),

    {
      type: "token_usage",
      metric: "inputTokens",
      maxTokens: 80_000,
    },
  ],
};

/**
 * The combiner-misread probe. "One bar plus one extra quarter note" in 6/8 is
 * `1bar+n/4` = 3 + 1 = 4 quarter notes. The failure mode is collapsing it to a
 * single absolute fraction (`n5/4` = 5 quarters) — which only equals one bar +
 * a quarter in 4/4 and is WRONG in 6/8. Running this in 6/8 makes the misread
 * observable: the `Nbar+n<fraction>` form is the only correct encoding.
 */
export const durationArgMixedCombiner: EvalScenario = {
  id: "duration-arg-mixed-combiner",
  description:
    "1bar+n/4 in 6/8 → combiner kept as bar+note-value, not collapsed to n5/4",
  kind: "capability",
  liveSet: LIVE_SET,

  messages: [
    MSG_CONNECT,
    "On the Drums track, create an empty MIDI clip in the first scene, in 6/8 time, that is exactly one bar plus one extra quarter note long.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },
    { type: "tool_called", tool: TOOL_CREATE_CLIP, turn: 1 },

    // Must be the mixed form: a bar count, then `+n<fraction>`. This rejects
    // both `n5/4` (collapsed) and `1.25bar` (non-grammar).
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

    {
      type: "llm_judge",
      prompt: `Evaluate ONLY the create-clip call (turn 1):
1. An empty clip was created in 6/8 time on the Drums track
2. Its length is "one bar plus one quarter note" = 4 quarter notes total (6/8 bar = 3 quarter notes, plus 1 more)
3. CRITICAL: the length was expressed as a bar count PLUS a note value (e.g. "1bar+n/4"), NOT collapsed into a single fraction like "n5/4". Collapsing to n5/4 = 5 quarter notes is WRONG in 6/8 — that is the failure to catch.`,
    },

    { type: "token_usage", metric: "inputTokens", maxTokens: 80_000 },
  ],
};
