// src/mcp-server/add-tool-delete.js
import { z } from "zod";

export function addToolDelete(server, callLiveApi) {
  server.tool(
    "delete",
    "Deletes objects by ids and type. Supports bulk operations with comma-separated IDs of the same type.",
    {
      ids: z
        .string()
        .describe(
          "Object ID or comma-separated list of object IDs to delete (all must be same type)",
        ),
      type: z
        .enum(["track", "scene", "clip"])
        .describe("Type of objects to delete"),
    },
    async (args) => callLiveApi("delete", args),
  );
}
