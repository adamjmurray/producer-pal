import { z } from "zod";
import { defineTool } from "../../shared/tool-framework/define-tool.js";

export const toolDefDelete = defineTool("ppal-delete", {
  title: "Delete Track/Scene/Clip/Device",
  description: "Deletes objects",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    ids: z
      .string()
      .optional()
      .describe(
        "comma-separated list of object IDs to delete (must be same type)",
      ),
    path: z
      .string()
      .optional()
      .describe(
        "comma-separated device paths to delete (e.g., '0/1', '1/0/2/1') - only for type 'device'",
      ),
    type: z
      .enum(["track", "scene", "clip", "device"])
      .describe("type of objects to delete"),
  },
});
