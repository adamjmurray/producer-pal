// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Apply various transforms to drum clip notes (velocity ramp,
 * LFO, randomization) targeting specific instruments by pitch.
 */

import { type EvalScenario } from "../../../types.ts";
import {
  assertNotesRead,
  getTransforms,
} from "../helpers/clip-scenario-helpers.ts";

const TOOL_UPDATE_CLIP = "ppal-update-clip";

/**
 * Extract the selector portion (before the first ":") of a transforms string
 * and assert it targets the expected pitch.
 * @param transforms - Raw transforms string from the update-clip call
 * @param pitch - Pitch the selector must reference (e.g. /Ab1/)
 * @param label - Human-readable pitch label for error messages
 * @returns The selector substring
 */
function selectorTargeting(
  transforms: string,
  pitch: RegExp,
  label: string,
): string {
  const colonIdx = transforms.indexOf(":");

  if (colonIdx === -1) {
    throw new Error(`missing selector (no ":"): ${transforms}`);
  }

  const selector = transforms.slice(0, colonIdx);

  if (!pitch.test(selector)) {
    throw new Error(`${label} not in selector: ${selector}`);
  }

  return selector;
}

/**
 * The closed hats, either way a model spells the pitch. `G#1` and `Ab1` are the
 * same key and the parser takes both — luna wrote `G#1` and the transform
 * landed (`transformed: 8`), so grading one spelling fails a working call.
 */
const HAT = /Ab1|G#1/;

/** The snare pitch. E has no enharmonic a model would reach for. */
const SNARE = /E1/;

export const drumTransforms: EvalScenario = {
  id: "drum-transforms",
  description: "Apply velocity transforms to drum clip notes",
  kind: "capability",
  requires: { transforms: true },
  liveSet: "basic-with-drum-and-lead-clips",

  messages: [
    "Connect to Ableton Live",
    "Find the drum clip in the first scene and read the notes",
    "Add a crescendo to the hats in the last two beats of the last bar: very quiet to max volume. Do it in as few tokens as you can.",
    "Apply a velocity LFO to the hats before the crescendo",
    "Use a transform to slightly randomize the snare velocities. Lock a value into each hit so it plays back the same way every time.",
  ],

  assertions: [
    // Turn 0: Connection
    { type: "tool_called", tool: "ppal-connect", turn: 0 },

    // Turn 1: Clips found and notes read
    assertNotesRead(1),

    // Turn 2: Velocity crescendo on hats in last two beats
    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 2 },

    {
      type: "custom",
      description:
        "crescendo uses velocity ramp scoped to hats in last 2 beats",
      assert: (turns) => {
        const transforms = getTransforms(turns, 2, TOOL_UPDATE_CLIP);
        const selector = selectorTargeting(
          transforms,
          HAT,
          "the hats (Ab1/G#1)",
        );

        // "The last two beats" ends where bar 2 does, and both spellings say
        // so: the closed `2|3-2|4.75` and the half-open `2|3-<3|1` ("up to, not
        // including, bar 3"). The LFO turn below already accepts `-<`; pinning
        // one literal here made the two turns disagree.
        if (!/2\|3-(2\|4\.75|<3\|1)/.test(selector)) {
          throw new Error(
            `time range should cover 2|3 to the end of bar 2: ${selector}`,
          );
        }

        // velocity = ramp(start, end) where start < 50 and end > 120
        const rampMatch = /velocity\s*=\s*ramp\(\s*(\d+)\s*,\s*(\d+)\s*\)/.exec(
          transforms,
        );

        if (!rampMatch) {
          throw new Error(
            `expected velocity = ramp(start, end): ${transforms}`,
          );
        }

        const start = Number(rampMatch[1]);
        const end = Number(rampMatch[2]);

        if (start >= 50) {
          throw new Error(`ramp start ${start} should be < 50 (very quiet)`);
        }

        if (end <= 120) {
          throw new Error(`ramp end ${end} should be > 120 (max volume)`);
        }

        return true;
      },
    },

    // Turn 3: Velocity LFO on hats, time-scoped before the crescendo
    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 3 },

    {
      type: "custom",
      description: "LFO targets hats before the crescendo, no ramp re-applied",
      assert: (turns) => {
        const transforms = getTransforms(turns, 3, TOOL_UPDATE_CLIP);
        // Selector must target Ab1 (hats)
        const selector = selectorTargeting(
          transforms,
          HAT,
          "the hats (Ab1/G#1)",
        );

        // Must use a waveform function on velocity (= or += both valid)
        if (!/velocity\s*\+?=\s*.*\b(sin|cos|tri|saw)\b/.test(transforms)) {
          throw new Error(
            `expected velocity [+]= ... waveform(): ${transforms}`,
          );
        }

        // The waveform argument has to vary per note. `sin(2)` is a constant —
        // it flattens every hit to one velocity, the opposite of an LFO, and
        // models do write it after a first attempt errors out.
        const waveformArg = /\b(?:sin|cos|tri|saw)\(([^)]*)\)/.exec(transforms);
        const waveformExpr = waveformArg?.[1] ?? "";

        if (waveformArg && !/[a-z]/i.test(waveformExpr)) {
          throw new Error(
            `waveform argument '${waveformExpr}' is constant — an LFO has to vary per note: ${transforms}`,
          );
        }

        // Time range should start at 1|1 and reach the crescendo boundary at
        // 2|3. Both a closed end just before it (e.g. 1|1-2|2.75) and the
        // half-open form 1|1-<2|3 ("up to, not including, 2|3") are correct —
        // the half-open spelling is the more precise way to say "before the
        // crescendo", so the optional `<` must be tolerated.
        const timeMatch = /(\d+\|\d[\d.]*)-(<)?(\d+\|\d[\d.]*)/.exec(selector);

        if (!timeMatch) {
          throw new Error(`missing time range in selector: ${selector}`);
        }

        const startStr = timeMatch[1] as string;

        if (startStr !== "1|1") {
          throw new Error(`LFO time range should start at 1|1: ${selector}`);
        }

        const exclusiveEnd = timeMatch[2] === "<";
        const endStr = timeMatch[3] as string;
        const endParts = endStr.split("|").map(Number);
        const endBar = endParts[0] as number;
        const endBeat = endParts[1] as number;
        // A closed end must stop just before the crescendo (2|2.5..2|2.99); a
        // half-open `-<` end may land exactly on the crescendo start 2|3 (it
        // excludes that beat, so the LFO still stays before the crescendo).
        const endOk =
          endBar === 2 &&
          endBeat >= 2.5 &&
          (exclusiveEnd ? endBeat <= 3 : endBeat < 3);

        if (!endOk) {
          throw new Error(
            `LFO time range end should reach ~2|3, got ${exclusiveEnd ? "<" : ""}${endStr}`,
          );
        }

        // Should not re-apply the ramp from turn 2
        if (/ramp\(/i.test(transforms)) {
          throw new Error(
            `should not re-apply ramp from turn 2: ${transforms}`,
          );
        }

        return true;
      },
    },

    // Turn 4: Random snare velocities
    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 4 },

    {
      type: "custom",
      description:
        "snare randomization bakes a fixed rand() value into each snare",
      assert: (turns) => {
        const transforms = getTransforms(turns, 4, TOOL_UPDATE_CLIP);

        // Must target snare pitch (E1 in this drum rack)
        selectorTargeting(transforms, SNARE, "E1 (snare)");

        // `vA-B` is wrong HERE and only here: it sets Live's velocity_deviation,
        // which re-rolls on every playback, and the prompt asks for a value
        // locked into each note. `velocity-shaping` grades the other direction.
        // Check it before rand() so the failure names the real reason instead
        // of reading as "no rand()".
        if (/\bv\d+-\d+\b/.test(transforms)) {
          throw new Error(
            `vA-B re-randomizes on every playback; the prompt asks for a fixed value per hit: ${transforms}`,
          );
        }

        // Any rand() on velocity passes. Jitter added to the current value and
        // a pick from an absolute range are both fine — the prompt doesn't say,
        // and every snare here is v100 so neither loses anything. `random()` is
        // a documented alias.
        if (!/velocity\s*[-+*/]?=\s*.*\b(?:rand|random)\(/.test(transforms)) {
          throw new Error(
            `expected velocity randomized with rand(): ${transforms}`,
          );
        }

        return true;
      },
    },

    // Response checks
    { type: "response_contains", pattern: /notes|clip/i, turn: 1 },
    { type: "response_contains", pattern: /crescendo|ramp|velocity/i, turn: 2 },
    { type: "response_contains", pattern: /lfo|wave/i, turn: 3 },
    { type: "response_contains", pattern: /random|snare/i, turn: 4 },

    // Token usage
    { type: "token_usage", metric: "inputTokens", maxTokens: 120_000 },
  ],
};
