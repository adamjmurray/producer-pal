import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

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
        "comma-separated paths to delete - device: 't0/d1', 't1/d0/pC1/d0'; drum-pad: 't1/d0/pC1'",
      ),
    type: z
      .enum(["track", "scene", "clip", "device", "drum-pad"])
      .describe("type of objects to delete"),
  },
});
