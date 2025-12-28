import { defineTool } from "#src/tools/shared/tool-framework/define-tool.js";

export const toolDefConnect = defineTool("ppal-connect", {
  title: "Connect to Ableton",
  description: `Connect to Ableton Live and initialize Producer Pal.
Call before other ppal-* tools when the user says use/connect to ableton.`,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema: {
    // No parameters - everything is hardcoded for safety
  },
});
