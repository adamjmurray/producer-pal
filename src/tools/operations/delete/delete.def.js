import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.js";

export const toolDefDelete = defineTool("ppal-delete", {
  title: "Delete Track/Scene/Clip/Device/Drum Pad",
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
        "comma-separated paths to delete - device: '0/1', '1/0/pC1/0/0'; drum-pad: '1/0/pC1'",
      ),
    type: z
      .enum(["track", "scene", "clip", "device", "drum-pad"])
      .describe("type of objects to delete"),
  },
});
