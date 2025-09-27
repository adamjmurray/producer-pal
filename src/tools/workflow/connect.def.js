import { defineTool } from "../shared/define-tool.js";

export const toolDefConnect = defineTool("ppal-connect", {
  title: "Connect to Ableton",
  description: `Initialize connection to Ableton Live.
Call before other ppal-* tools when the user mentions Ableton/Producer Pal or open/connect to/play with ableton.
Provides instructions to complete the initialization.`,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema: {
    // No parameters - everything is hardcoded for safety
  },
});
