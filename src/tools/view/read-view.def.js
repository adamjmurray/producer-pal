import { defineTool } from "../shared/define-tool.js";

const description = `Reads the current view state in Ableton Live including main view (session/arrangement),
selected track/scene/clip/device, selected track type (regular/return/master),
highlighted clip slot, detail view status (clip/device), and browser visibility.
Use this to understand what the user is currently looking at before making decisions about view changes.`;

export const toolDefReadView = defineTool("ppal-read-view", {
  title: "Read View State",
  description,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema: {},
});
