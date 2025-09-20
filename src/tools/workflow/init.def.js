import { defineTool } from "../shared/define-tool.js";

export const toolDefInit = defineTool("ppal-init", {
  title: "Connect to Ableton Live",
  description: `Initialize connection to Ableton Live.
Call before other ppal-* tools when the user mentions Ableton/Producer Pal or open/connect to/play with ableton.
Automatically follow the returned nextStep, then relay the messageForUser.`,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema: {
    // No parameters - everything is hardcoded for safety
  },
});
