// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Scenario: Write and read project context
 */

import { type EvalScenario } from "../../types.ts";

const TOOL_CONNECT = "ppal-connect";
const TOOL_CONTEXT = "ppal-context";

export const projectContextWorkflow: EvalScenario = {
  id: "project-context-workflow",
  description: "Write and read project context",
  kind: "regression",
  liveSet: "basic-midi-4-track",
  // The checks below pin the outcome. The judge only adds commentary they
  // can't anticipate — hallucinations, misleading prose, extra steps.
  judgeAdvisory: true,

  config: {
    projectContext: "",
  },

  messages: [
    "Connect to Ableton Live",
    "Save a note: 'This project uses C minor with jazzy 7th chords'",
    "What notes do I have saved about this project?",
  ],

  assertions: [
    // Turn 0: Connection
    { type: "tool_called", tool: TOOL_CONNECT, turn: 0 },

    // Turn 1: Write project context
    { type: "tool_called", tool: TOOL_CONTEXT, turn: 1 },

    // Turn 2: Read project context
    { type: "tool_called", tool: TOOL_CONTEXT, turn: 2 },

    // The outcome, not the prose: the note is really in the project context.
    {
      type: "state",
      tool: TOOL_CONTEXT,
      args: { action: "read", scope: "project" },
      expect: (result) => {
        const content = (result as { content?: string }).content ?? "";

        return /c minor/i.test(content) && /7th chord/i.test(content);
      },
      explain: (result) =>
        `saved context should mention C minor and 7th chords, got: ${
          (result as { content?: string }).content ?? "(empty)"
        }`,
    },

    // Response should contain the saved content
    { type: "response_contains", pattern: /c minor/i, turn: 2 },
    { type: "response_contains", pattern: /7th chords/i, turn: 2 },

    // LLM quality check
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Successfully updated the project context
2. Retrieved and displayed the saved note content
3. Included the key details: C minor and jazzy 7th chords`,
    },
  ],
};
