// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Add octaves, shorten durations, humanize timing, then apply
 * fuzzy legato to handle the humanized chord pairs.
 */

import { type EvalScenario } from "../../types.ts";
import { assertNotesRead, getTransforms } from "./clip-scenario-helpers.ts";

const TOOL_UPDATE_CLIP = "ppal-update-clip";

export const legatoTransforms: EvalScenario = {
  id: "legato-transforms",
  description: "Add octaves, humanize timing, and apply legato with tolerance",
  kind: "capability",
  liveSet: "basic-with-drum-and-lead-clips",

  messages: [
    "Connect to Ableton Live",
    "Find the lead melody in the first scene and read the notes",
    "Make all the notes play in octaves (current notes + one octave up)",
    "Set all the durations to 1/16th note",
    "Humanize the start times",
    "Make it legato accounting for the humanized timing",
  ],

  assertions: [
    // Turn 0: Connection
    { type: "tool_called", tool: "ppal-connect", turn: 0 },

    // Turn 1: Clips found and notes read
    assertNotesRead(1),

    // Turn 2: Octave doubling — should add notes 12 semitones up
    {
      type: "custom",
      description: "notes doubled with octave-up copies",
      assert: (turns) => {
        const calls = turns[2]?.toolCalls ?? [];
        const updateCall = calls.find((c) => c.name === TOOL_UPDATE_CLIP);

        if (!updateCall) {
          throw new Error("ppal-update-clip not found in turn 2");
        }

        // Should have notes param (adding the octave copies) or use transforms
        const notes = String(updateCall.args.notes ?? "");
        const transforms = String(updateCall.args.transforms ?? "");
        const result = JSON.parse(String(updateCall.result ?? "{}"));
        const noteCount = result.noteCount as number | undefined;

        // Original has 12 notes, doubled should be 24
        if (!notes && !transforms && (noteCount == null || noteCount <= 12)) {
          throw new Error(
            `notes should be doubled with octaves (noteCount: ${noteCount ?? "none"})`,
          );
        }

        return true;
      },
    },

    // Turn 3: Set durations to 1/16th note
    {
      type: "custom",
      description: "durations set to 1/16th note",
      assert: (turns) => {
        const transforms = getTransforms(turns, 3, TOOL_UPDATE_CLIP);

        if (!/duration/.test(transforms)) {
          throw new Error(
            `expected duration transform: ${transforms.slice(0, 120)}`,
          );
        }

        return true;
      },
    },

    // Turn 4: Humanize timing
    {
      type: "custom",
      description: "timing humanized with random offset",
      assert: (turns) => {
        const transforms = getTransforms(turns, 4, TOOL_UPDATE_CLIP);

        if (!/timing/.test(transforms)) {
          throw new Error(
            `expected timing transform: ${transforms.slice(0, 120)}`,
          );
        }

        if (!/rand\(/i.test(transforms)) {
          throw new Error(
            `expected rand() for humanization: ${transforms.slice(0, 120)}`,
          );
        }

        return true;
      },
    },

    // Turn 5: Fuzzy legato — should use legato() with a tolerance arg
    {
      type: "custom",
      description: "legato applied with tolerance for humanized timing",
      assert: (turns) => {
        const transforms = getTransforms(turns, 5, TOOL_UPDATE_CLIP);

        if (!/legato\(/.test(transforms)) {
          throw new Error(
            `expected legato() function: ${transforms.slice(0, 120)}`,
          );
        }

        // Should have a tolerance argument (not empty parens)
        if (/legato\(\)/.test(transforms)) {
          throw new Error(
            `expected legato with tolerance arg, got legato(): ${transforms.slice(0, 120)}`,
          );
        }

        return true;
      },
    },

    // Response checks
    { type: "response_contains", pattern: /notes|clip|melody/i, turn: 1 },
    { type: "response_contains", pattern: /octave/i, turn: 2 },
    { type: "response_contains", pattern: /duration|16th/i, turn: 3 },
    { type: "response_contains", pattern: /humaniz|timing|random/i, turn: 4 },
    { type: "response_contains", pattern: /legato/i, turn: 5 },

    // Token usage
    { type: "token_usage", metric: "inputTokens", maxTokens: 150_000 },

    // LLM quality check
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Found and read the lead melody with its notes
2. Added octave-doubled notes (each note plus 12 semitones)
3. Set all durations to 1/16th note
4. Humanized start times using rand() or similar randomization
5. Applied legato with a tolerance argument to handle humanized timing
6. Used transforms or appropriate tools rather than manually rewriting all notes`,
    },
  ],
};
