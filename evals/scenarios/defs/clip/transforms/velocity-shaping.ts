// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario: shape drum velocities by hand — an explicitly per-note crescendo,
 * then variation that re-rolls on every playback.
 *
 * This is the counterpart to `drum-transforms`, which asks for the terse and
 * the fixed answer to the same two musical requests. Both readings are correct
 * musically; the prompts are what decide which one is wanted, so the pair
 * checks that the wording actually steers the model. Any way of writing the
 * values counts (hit by hit, a rewritten `notes`, even `ramp()`): the check
 * reads the notes back, because that is what the user sees and tweaks.
 */

import { argText } from "../../arg-text.ts";
import { requireSuccessfulToolCall } from "../../../assertions/index.ts";
import {
  type EvalAssertion,
  type EvalScenario,
  type EvalTurnResult,
} from "../../../types.ts";
import {
  assertNotesRead,
  clipStateAssertion,
} from "../helpers/clip-note-assertions.ts";
import { TOOL_UPDATE_CLIP } from "../helpers/clip-tool-constants.ts";
import { TOOLS } from "#evals/shared/tool-names.ts";

/**
 * Everything a model wrote to place notes in one turn: `transforms`, `notes`
 * and `preTransforms` joined. Per-note velocities are expressible in any of
 * them — a transform line per hit, or a rewritten `notes` string — and which
 * one a model picks isn't what these assertions grade.
 *
 * @param turns - All turn results
 * @param turn - Turn index containing the update-clip call
 * @returns The joined argument text
 */
function noteWritingArgs(turns: EvalTurnResult[], turn: number): string {
  const call = requireSuccessfulToolCall(turns, turn, TOOL_UPDATE_CLIP);
  const text = ["transforms", "notes", "preTransforms"]
    .map((param) => argText(call.args[param]))
    .filter((value) => value !== "")
    .join("\n");

  if (text === "") {
    throw new Error(`no transforms/notes written in turn ${turn}`);
  }

  return text;
}

/** The snare pitch in this Set's drum rack. */
const SNARE = "E1";

/** MIDI pitch of the closed hats (Ab1). */
const HAT_PITCH = 44;

/** Bar 2 beats 3-4 in 4/4, in quarter beats from the clip start. */
const LAST_TWO_BEATS = { from: 6, to: 8 };

/**
 * Assert the crescendo ended up as a rising velocity on each hat in the last two
 * beats, quiet to max. Grades the notes in the clip, not how they were written:
 * a `ramp()` that lands the right values counts, a wrong one does not.
 *
 * @returns A state assertion over the drum clip
 */
function assertCrescendoOutcome(): EvalAssertion {
  return clipStateAssertion("0/0", "4/4", (events) => {
    const velocities = events
      .filter(
        (event) =>
          event.pitch === HAT_PITCH &&
          event.start_time >= LAST_TWO_BEATS.from &&
          event.start_time < LAST_TWO_BEATS.to,
      )
      .toSorted((a, b) => a.start_time - b.start_time)
      .map((event) => event.velocity);

    // Eight hats sit in the range; accept a model that shapes only some of
    // them, but four points is the least that reads as a curve.
    return (
      velocities.length >= 4 &&
      velocities.every(
        (v, i) => i === 0 || v > (velocities[i - 1] as number),
      ) &&
      (velocities[0] as number) < 50 &&
      (velocities.at(-1) as number) > 120
    );
  });
}

/**
 * Assert the snare variation re-rolls per playback, which only `vA-B` does.
 * @returns A custom assertion over turn 3
 */
function assertReRandomizingSnare(): EvalAssertion {
  return {
    type: "custom",
    description: "snare variation uses the vA-B range, which re-rolls per play",
    assert: (turns) => {
      const text = noteWritingArgs(turns, 3);

      if (!text.includes(SNARE)) {
        throw new Error(`variation does not target ${SNARE}: ${text}`);
      }

      // `rand()` picks once at write time and bakes the value in — the exact
      // thing this prompt rules out. `drum-transforms` grades that direction.
      if (/\b(?:rand|random)\(/i.test(text)) {
        throw new Error(
          `rand() bakes one value in; the prompt asks for variation on every playback: ${text}`,
        );
      }

      const range = /\bv(\d+)-(\d+)\b/.exec(text);

      if (!range) {
        throw new Error(`expected a vA-B velocity range: ${text}`);
      }

      const min = Number(range[1]);
      const max = Number(range[2]);

      if (min >= max) {
        throw new Error(`velocity range v${min}-${max} spans nothing`);
      }

      return true;
    },
  };
}

export const velocityShaping: EvalScenario = {
  id: "velocity-shaping",
  tags: ["transforms"],
  description: "Write drum velocities by hand: per-note crescendo, then vA-B",
  kind: "capability",
  requires: { transforms: true },
  liveSet: "basic-with-drum-and-lead-clips",

  messages: [
    "Connect to Ableton Live",
    "Find the drum clip in the first scene and read the notes",
    "Add a crescendo to the hats in the last two beats of the last bar: very quiet to max volume. Set each hit's velocity individually so I can see and tweak the exact numbers.",
    "Now vary the snare velocities a little, and make them come out different on every playback.",
  ],

  assertions: [
    { type: "tool_called", tool: TOOLS.connect, turn: 0 },

    assertNotesRead(1),

    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 2 },
    assertCrescendoOutcome(),

    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 3 },
    assertReRandomizingSnare(),

    { type: "response_contains", pattern: /crescendo|velocit/i, turn: 2 },
    {
      type: "response_contains",
      pattern: /snare|random|vary|variation/i,
      turn: 3,
    },

    { type: "token_usage", maxTokens: 4_500 },
  ],
};
