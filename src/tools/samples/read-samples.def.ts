import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefReadSamples = defineTool("ppal-read-samples", {
  title: "Read Samples",
  description: "List audio files from configured sample folder",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema: {
    search: z
      .string()
      .optional()
      .describe("case-insensitive substring filter on relative paths"),
  },
});
