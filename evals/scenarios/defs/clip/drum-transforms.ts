// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Apply various transforms to drum clip notes (velocity ramp,
 * LFO, randomization) targeting specific instruments by pitch.
 */

import { type EvalScenario } from "../../types.ts";
import { assertNotesRead, getTransforms } from "./clip-scenario-helpers.ts";

const TOOL_UPDATE_CLIP = "ppal-update-clip";

export const drumTransforms: EvalScenario = {
  id: "drum-transforms",
  description: "Apply velocity transforms to drum clip notes",
  kind: "capability",
  liveSet: "basic-with-drum-and-lead-clips",

  messages: [
    "Connect to Ableton Live",
    "Find the drum clip in the first scene and read the notes",
    "Add a crescendo to the hats in the last two beats of the last bar: very quiet to max volume",
    "Apply a velocity LFO to the hats before the crescendo",
    "Slightly randomize the snare velocities",
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
        const colonIdx = transforms.indexOf(":");

        if (colonIdx === -1) {
          throw new Error(`missing selector (no ":"): ${transforms}`);
        }

        const selector = transforms.slice(0, colonIdx);

        // Selector must include Ab1 pitch and 2|3-2|4.75 time range
        if (!/Ab1/.test(selector)) {
          throw new Error(`Ab1 not in selector: ${selector}`);
        }

        if (!/2\|3-2\|4\.75/.test(selector)) {
          throw new Error(`time range 2|3-2|4.75 not in selector: ${selector}`);
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
        const colonIdx = transforms.indexOf(":");

        if (colonIdx === -1) {
          throw new Error(`missing selector (no ":"): ${transforms}`);
        }

        const selector = transforms.slice(0, colonIdx);

        // Selector must target Ab1 (hats)
        if (!/Ab1/.test(selector)) {
          throw new Error(`Ab1 not in selector: ${selector}`);
        }

        // Must use a waveform function on velocity (= or += both valid)
        if (!/velocity\s*\+?=\s*.*\b(sin|cos|tri|saw)\b/.test(transforms)) {
          throw new Error(
            `expected velocity [+]= ... waveform(): ${transforms}`,
          );
        }

        // Time range should start at 1|1 and end between 2|2.5 and 2|2.99
        const timeMatch = /(\d+\|\d[\d.]*)-(\d+\|\d[\d.]*)/.exec(selector);

        if (!timeMatch) {
          throw new Error(`missing time range in selector: ${selector}`);
        }

        const startStr = timeMatch[1] as string;

        if (startStr !== "1|1") {
          throw new Error(`LFO time range should start at 1|1: ${selector}`);
        }

        const endStr = timeMatch[2] as string;
        const endParts = endStr.split("|").map(Number);
        const endBar = endParts[0] as number;
        const endBeat = endParts[1] as number;

        if (endBar !== 2 || endBeat < 2.5 || endBeat >= 3) {
          throw new Error(
            `LFO time range end should be 2|2.5 to 2|2.99, got ${endStr}`,
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
      description: "snare randomization targets snare pitch with rand()",
      assert: (turns) => {
        const transforms = getTransforms(turns, 4, TOOL_UPDATE_CLIP);
        const colonIdx = transforms.indexOf(":");

        if (colonIdx === -1) {
          throw new Error(`missing selector (no ":"): ${transforms}`);
        }

        const selector = transforms.slice(0, colonIdx);

        // Must target snare pitch (E1 in this drum rack)
        if (!/E1/.test(selector)) {
          throw new Error(`E1 (snare) not in selector: ${selector}`);
        }

        // Must use rand() on velocity
        if (!/velocity\s*\+=\s*.*\brand\b/.test(transforms)) {
          throw new Error(`expected velocity += ... rand(): ${transforms}`);
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
