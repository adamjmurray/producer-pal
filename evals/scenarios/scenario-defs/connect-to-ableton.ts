/**
 * Scenario: Connect to Ableton Live
 */

import type { EvalScenario } from "../types.ts";

export const connectToAbleton: EvalScenario = {
  id: "connect-to-ableton",
  description: "Connect to Ableton Live and retrieve Producer Pal skills",
  liveSet: "scripts/eval-lib/live-sets/empty-project.als",

  messages: ["Connect to Ableton Live"],

  assertions: [
    // Verify ppal-connect was called
    {
      type: "tool_called",
      tool: "ppal-connect",
      turn: 0,
    },

    // Verify the response acknowledges the connection
    {
      type: "response_contains",
      pattern: /connected|producer pal/i,
    },
  ],
};
