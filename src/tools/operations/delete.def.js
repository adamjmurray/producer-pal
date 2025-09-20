import { z } from "zod";
import { defineTool } from "../shared/define-tool.js";

export const toolDefDelete = defineTool("ppal-delete", {
  title: "Delete Track/Scene/Clip",
  description:
    "Deletes objects by ids and type.\nSupports bulk operations with comma-separated IDs of the same type.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    ids: z
      .string()
      .describe(
        "Object ID or comma-separated list of object IDs to delete (all must be same type)",
      ),
    type: z
      .enum(["track", "scene", "clip"])
      .describe("Type of objects to delete"),
  },
});
