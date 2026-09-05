// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: shape drum velocities by hand — an explicitly per-note crescendo,
 * then variation that re-rolls on every playback.
 *
 * This is the counterpart to `drum-transforms`, which asks for the terse and
 * the fixed answer to the same two musical requests. Both readings are correct
 * musically; the prompts are what decide which one is wanted, so the pair
 * checks that the wording actually steers the model.
 */

import { argText } from "../../arg-text.ts";
import { lastSuccessfulToolCall } from "../../../assertions/index.ts";
import {
  type EvalAssertion,
  type EvalScenario,
  type EvalTurnResult,
} from "../../../types.ts";
import {
  assertNotesRead,
  TOOL_UPDATE_CLIP,
} from "../helpers/clip-scenario-helpers.ts";

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
  const call = lastSuccessfulToolCall(turns, turn, TOOL_UPDATE_CLIP);

  if (!call) throw new Error(`${TOOL_UPDATE_CLIP} not found in turn ${turn}`);

  const text = ["transforms", "notes", "preTransforms"]
    .map((param) => argText(call.args[param]))
    .filter((value) => value !== "")
    .join("\n");

  if (text === "") {
    throw new Error(`no transforms/notes written in turn ${turn}`);
  }

  return text;
}

/**
 * Velocities in the order they were written, however they were spelled:
 * `velocity = 90` (transform longhand) and `v90` (shorthand, and the `notes`
 * layer) both count. Beat positions like `2|3.25` never match either form.
 *
 * @param text - Joined transforms/notes text
 * @returns Velocity values, in written order
 */
function writtenVelocities(text: string): number[] {
  const matches = [
    ...text.matchAll(/velocity\s*=\s*(\d+)/g),
    ...text.matchAll(/\bv(\d+)\b/g),
  ];

  return matches
    .toSorted((a, b) => a.index - b.index)
    .map((match) => Number(match[1]));
}

/** The closed hats this Set puts in bar 2 beats 3-4, as 8 sixteenths. */
const HAT = "Ab1";

/** The snare pitch in this Set's drum rack. */
const SNARE = "E1";

/**
 * Assert the crescendo was written out hit by hit rather than as a ramp.
 * @returns A custom assertion over turn 2
 */
function assertPerNoteCrescendo(): EvalAssertion {
  return {
    type: "custom",
    description: "crescendo written as an explicit velocity per hat",
    assert: (turns) => {
      const text = noteWritingArgs(turns, 2);

      if (!text.includes(HAT)) {
        throw new Error(`crescendo does not target ${HAT}: ${text}`);
      }

      // `ramp()` is the right answer to the OTHER prompt. Here it means the
      // model ignored the ask for individual values.
      if (/\bramp\(/i.test(text)) {
        throw new Error(`asked for a value per hit, got a ramp(): ${text}`);
      }

      const velocities = writtenVelocities(text);

      // Eight hats sit in the range; accept a model that shapes only some of
      // them, but four points is the least that reads as a curve.
      if (velocities.length < 4) {
        throw new Error(
          `expected a velocity per hit (>= 4), got ${velocities.length}: ${text}`,
        );
      }

      const rising = velocities.every(
        (velocity, index) =>
          index === 0 || velocity > (velocities[index - 1] as number),
      );

      if (!rising) {
        throw new Error(
          `velocities should rise across the crescendo, got ${velocities.join(", ")}`,
        );
      }

      const first = velocities[0] as number;
      const last = velocities.at(-1) as number;

      if (first >= 50) {
        throw new Error(`crescendo starts at ${first}, should be < 50 (quiet)`);
      }

      if (last <= 120) {
        throw new Error(`crescendo ends at ${last}, should be > 120 (max)`);
      }

      return true;
    },
  };
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
    { type: "tool_called", tool: "ppal-connect", turn: 0 },

    assertNotesRead(1),

    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 2 },
    assertPerNoteCrescendo(),

    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 3 },
    assertReRandomizingSnare(),

    { type: "response_contains", pattern: /crescendo|velocit/i, turn: 2 },
    {
      type: "response_contains",
      pattern: /snare|random|vary|variation/i,
      turn: 3,
    },

    { type: "token_usage", metric: "inputTokens", maxTokens: 100_000 },
  ],
};
