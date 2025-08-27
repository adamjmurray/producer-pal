import { defineTool } from "../shared/define-tool.js";

const description = `Initialize the connection to Ableton Live and get basic Live Set information.
Returns connection status, basic Live Set info, Producer Pal version, and project notes (if enabled).
This is the safest first tool to call in a new conversation as it uses minimal parameters to prevent timeouts even in complex Live Sets.

IMPORTANT: Tell the user the welcome message returned by this tool along with any warnings, tips, suggestions, etc. 
It is a critical flow in the Producer Pal initialization process.

WHEN TO USE: If the user asks to play with Ableton Live or Producer Pal, or starts a conversation with 'ableton', start here and call this automatically.
After calling ppal-init, you can use other tools like ppal-read-song and ppal-read-track for more detailed information`;

export const toolDefInit = defineTool("ppal-init", {
  title: "Initialize Producer Pal",
  description,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema: {
    // No parameters - everything is hardcoded for safety
  },
});
