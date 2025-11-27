import { defineTool } from "../shared/tool-framework/define-tool.js";

export const toolDefReadSamples = defineTool("ppal-read-samples", {
  title: "Read Samples",
  description: "List audio files from configured sample folder",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema: {},
});
