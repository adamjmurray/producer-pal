// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Extend a melody by duplication and apply per-section pitch
 * transposition using scale steps.
 */

import { getToolCalls } from "../../assertions/index.ts";
import { type EvalScenario } from "../../types.ts";
import { assertNotesRead } from "./clip-scenario-helpers.ts";

const TOOL_UPDATE_CLIP = "ppal-update-clip";

export const melodyTransforms: EvalScenario = {
  id: "melody-transforms",
  description: "Extend a melody and apply per-section pitch transposition",
  kind: "capability",
  liveSet: "basic-with-drum-and-lead-clips",

  messages: [
    "Connect to Ableton Live",
    "Find the lead melody in the first scene and read the notes",
    "Extend the 2-bar melody into an 8-bar melody by copying the bars so each repetition can be edited independently",
    "In the 3rd and 4th bar of the melody, raise the pitches by one scale step. In the 5th and 6th, raise by three scale steps, and raise the final repetition by four scale steps",
  ],

  assertions: [
    // Turn 0: Connection
    { type: "tool_called", tool: "ppal-connect", turn: 0 },

    // Turn 1: Clips found and notes read
    assertNotesRead(1),

    // Turn 2: Melody extended by copying bars (not just loop-extending)
    {
      type: "custom",
      description: "melody extended with notes copied into 8 bars",
      assert: (turns) => {
        const calls = getToolCalls(turns, 2);
        const updateCall = calls.find((c) => c.name === TOOL_UPDATE_CLIP);

        if (!updateCall) {
          throw new Error("ppal-update-clip not found in turn 2");
        }

        // Must have notes param with bar-copy syntax, or noteCount showing
        // more notes than the original 12
        const notes = String(updateCall.args.notes ?? "");
        const result = JSON.parse(String(updateCall.result ?? "{}"));
        const noteCount = result.noteCount as number | undefined;

        if (!notes && (noteCount == null || noteCount <= 12)) {
          throw new Error(
            `notes should be duplicated into 8 bars (noteCount: ${noteCount ?? "none"})`,
          );
        }

        return true;
      },
    },

    // Turn 3: Per-section pitch transposition using step()
    { type: "tool_called", tool: TOOL_UPDATE_CLIP, turn: 3 },

    {
      type: "custom",
      description: "pitch transposition uses step() with correct amounts",
      assert: (turns) => {
        const calls = getToolCalls(turns, 3);
        const updateCall = calls.find((c) => c.name === TOOL_UPDATE_CLIP);

        if (!updateCall)
          throw new Error("ppal-update-clip not found in turn 3");

        const transforms = String(updateCall.args.transforms ?? "");

        if (!transforms) {
          throw new Error("transforms parameter missing in turn 3");
        }

        if (!/step\(/i.test(transforms)) {
          throw new Error(
            `transforms does not use step(): ${transforms.slice(0, 120)}`,
          );
        }

        // Verify time selectors are present (bar|beat format)
        if (!/\d\|\d/.test(transforms)) {
          throw new Error(
            `transforms does not have time selectors: ${transforms.slice(0, 120)}`,
          );
        }

        // Check for the three expected step amounts: 1, 3, 4
        const stepPattern = /step\([^)]*,\s*(\d+)\s*\)/g;
        const amounts = new Set<number>();
        let match;

        while ((match = stepPattern.exec(transforms)) !== null) {
          amounts.add(Number(match[1]));
        }

        for (const expected of [1, 3, 4]) {
          if (!amounts.has(expected)) {
            throw new Error(
              `step amount ${expected} not found (found: ${[...amounts].join(", ")}): ${transforms.slice(0, 120)}`,
            );
          }
        }

        // Verify notes were actually transformed (not 0)
        const result = JSON.parse(String(updateCall.result ?? "{}"));
        const transformed = result.transformed as number | undefined;

        if (transformed != null && transformed === 0) {
          throw new Error(
            "transformed: 0 — notes were not duplicated in turn 2",
          );
        }

        return true;
      },
    },

    // Response checks
    { type: "response_contains", pattern: /notes|clip|melody/i, turn: 1 },
    { type: "response_contains", pattern: /duplicat|extend|8.bar/i, turn: 2 },
    {
      type: "response_contains",
      pattern: /scale|step|pitch|transpose/i,
      turn: 3,
    },

    // Token usage
    { type: "token_usage", metric: "inputTokens", maxTokens: 100_000 },

    // LLM quality check
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Found and read the lead melody with its notes
2. Extended the 2-bar melody into an 8-bar melody by duplicating
3. Applied pitch transposition by scale steps to specific bar ranges:
   - Bars 3-4: raised by 1 scale step
   - Bars 5-6: raised by 3 scale steps
   - Bars 7-8: raised by 4 scale steps
4. Used transforms or appropriate tools rather than manually rewriting all notes`,
    },
  ],
};
