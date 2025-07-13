// src/mcp-server/tool-def-delete.js
import { z } from "zod";
import { defineTool } from "./define-tool.js";

export const toolDefDelete = defineTool("delete", {
  title: "Delete Clip/Track/Scene",
  description:
    "Deletes objects by ids and type. Supports bulk operations with comma-separated IDs of the same type.",
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
