// src/mcp-server/tool-def-read-view.js
import { defineTool } from "./define-tool.js";

const description = `Reads the current view state in Ableton Live including which view is active (Session/Arrangement), selected track/scene/clip, and detail view status. Use this to understand what the user is currently looking at before making decisions about view changes.`;

export const toolDefReadView = defineTool("ppal-read-view", {
  title: "Read View State",
  description,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema: {},
});
