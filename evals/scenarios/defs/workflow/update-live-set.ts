// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Update Live Set global properties and delete a track
 */

import { trackNames } from "../live-set-helpers.ts";
import { type EvalScenario } from "../../types.ts";
import { assertNamesTarget } from "../path/path-scenario-helpers.ts";

export const updateLiveSet: EvalScenario = {
  id: "update-live-set",
  description: "Update Live Set global properties and delete a track",
  kind: "regression",
  liveSet: "basic-midi-4-track",
  // The checks below pin the outcome. The judge only adds commentary they
  // can't anticipate — hallucinations, misleading prose, extra steps.
  judgeAdvisory: true,

  messages: [
    "Connect to Ableton Live",
    "Set the tempo to 128 BPM and the time signature to 6/8",
    // Not "the last track": that one hosts Producer Pal in every eval Live Set,
    // and deleting it is refused. Name a track the model can actually remove.
    "Delete the Lead track",
  ],

  assertions: [
    // Turn 0: Connection
    { type: "tool_called", tool: "ppal-connect", turn: 0 },

    // Turn 1: Live set property updates
    { type: "tool_called", tool: "ppal-update-live-set", turn: 1 },

    // The outcome, not the prose: both properties actually landed in the Set.
    {
      type: "state",
      tool: "ppal-read-live-set",
      args: {},
      expect: (result) => {
        const set = result as { tempo?: number; timeSignature?: string };

        return set.tempo === 128 && set.timeSignature === "6/8";
      },
      explain: (result) => {
        const set = result as { tempo?: number; timeSignature?: string };

        return `expected tempo 128 in 6/8, got ${set.tempo} in ${set.timeSignature}`;
      },
    },
    { type: "response_contains", pattern: /128/, turn: 1 },
    { type: "response_contains", pattern: /6\/8/, turn: 1 },

    // Turn 2: Delete track
    { type: "tool_called", tool: "ppal-delete", turn: 2 },

    // The outcome, not the prose: the track is really gone.
    {
      type: "state",
      tool: "ppal-read-live-set",
      args: { include: ["tracks"] },
      expect: (result) => !trackNames(result).includes("Lead"),
      explain: (result) =>
        `expected the Lead track to be gone, tracks are: ${trackNames(result).join(", ")}`,
    },

    // The only place delete's target arg is graded. 2.2.0 renamed it to `id`.
    assertNamesTarget({ turn: 2, tool: "ppal-delete" }),
    { type: "response_contains", pattern: /delet/i, turn: 2 },

    {
      type: "token_usage",
      metric: "inputTokens",
      maxTokens: 60_000,
    },

    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Set the tempo to 128 BPM
2. Set the time signature to 6/8
3. Deleted the Lead track
4. Confirmed each step was completed`,
    },
  ],
};
