// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario: asked to add notes to a step sequencer clip (Live 13), the model
 * says Producer Pal can't edit its steps instead of pretending it did.
 *
 * The Drums track holds a step sequencer clip (t0/s0), whose steps can't be
 * read or written, beside a plain "Notes" clip (t0/s1) with C1 on beats 1-4.
 * A notes write to t0/s0 is refused. The state checks pin that nothing changed;
 * only the judge can grade what the model tells the user.
 */

import { type EvalScenario } from "../../../types.ts";
import { assertMidiJsonNotes } from "../helpers/midi-json-readback.ts";
import { LIVE_13_TEST_SET } from "../../helpers/live-13-test-set.ts";
import { notesClipProblem } from "./helpers/notes-clip.ts";
import { refusedNoteWrites, strayWrites } from "./helpers/stray-writes.ts";
import { TOOLS } from "#evals/shared/tool-names.ts";

export const stepSequencerClip: EvalScenario = {
  id: "live-13-step-sequencer-clip",
  tags: ["clips", "results"],
  description:
    "Asked to add notes to a step sequencer clip, say its steps can't be edited",
  kind: "capability",
  liveSet: LIVE_13_TEST_SET,
  requires: { liveVersion: 13, tools: [TOOLS.readClip, TOOLS.updateClip] },

  messages: [
    "Connect to Ableton Live",
    "Add a snare on beats 2 and 4 of the Step Sequencer clip on my Drums track. Snare is D1.",
  ],

  // The refused notes write is the behavior under test, not a model mistake.
  expectedRefusals: [
    {
      tool: TOOLS.updateClip,
      message: "notes ignored: the clip is a step sequencer",
    },
  ],

  assertions: [
    { type: "tool_called", tool: TOOLS.connect, turn: 0 },

    // Still the same step sequencer clip.
    {
      type: "state",
      tool: TOOLS.readClip,
      args: { path: "t0/s0" },
      expect: { type: "step-sequencer", name: "Step Sequencer" },
    },

    // The plain notes clip beside it is untouched.
    assertMidiJsonNotes("t0/s1", notesClipProblem),

    // No landed notes, no new clip, no delete. One refused attempt is fine;
    // a retry loop is not.
    {
      type: "custom",
      description: "nothing was written, created or deleted",
      assert: (turns) => {
        const stray = strayWrites(turns);

        if (stray.length > 0) {
          throw new Error(stray.join("; "));
        }

        return true;
      },
    },
    {
      type: "custom",
      description: "at most one refused notes write",
      assert: (turns) => refusedNoteWrites(turns).length <= 1,
    },

    { type: "response_contains", pattern: /step sequencer/i, turn: 1 },
    { type: "token_usage", maxTokens: 3_000 },

    {
      type: "llm_judge",
      prompt: `The user asked for a snare on beats 2 and 4 of a "Step Sequencer" clip. That
clip is a Live step sequencer clip: Producer Pal can't read or edit its steps,
and a notes write to it is refused. Evaluate the final reply:
1. It tells the user the clip is a step sequencer clip whose steps Producer Pal
   can't read or edit.
2. It does NOT claim the snare was added.
Offering to do it in another clip is fine; doing so unasked is not.`,
    },
  ],
};
