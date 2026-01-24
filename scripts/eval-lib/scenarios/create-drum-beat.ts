/**
 * Scenario: Create a basic drum loop from empty project
 */

import type { EvalScenario } from "../types.ts";

export const createDrumBeat: EvalScenario = {
  id: "create-drum-beat",
  description: "Create a basic 4-bar drum loop from an empty project",
  liveSet: "scripts/eval-lib/live-sets/empty-project.als",
  provider: "gemini",
  tags: ["basic", "drums", "creation"],

  messages: [
    "Create a 4-bar drum loop with kick on every beat and snare on 2 and 4",
  ],

  assertions: [
    // Verify create-clip was called
    {
      type: "tool_called",
      tool: "ppal-create-clip",
    },

    // Verify the response mentions the drum creation
    {
      type: "response_contains",
      pattern: /drum|kick|snare|loop|pattern/i,
    },

    // LLM judges the quality of the response
    {
      type: "llm_judge",
      prompt: `Evaluate if the assistant:
1. Created a drum track/clip (not some other instrument)
2. Mentioned or confirmed creating kick on every beat
3. Mentioned or confirmed creating snare on beats 2 and 4
4. Made the loop 4 bars as requested`,
      minScore: 4,
    },
  ],
};
