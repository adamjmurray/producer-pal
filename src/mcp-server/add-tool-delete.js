// src/mcp-server/add-tool-delete.js
import { z } from "zod";

export function addToolDelete(server, callLiveApi) {
  server.tool(
    "delete",
    "Deletes an object by id and type. Supports tracks, scenes, and clips.",
    {
      id: z.string().describe("Object id to delete"),
      type: z.enum(["track", "scene", "clip"]).describe("Type of object to delete"),
    },
    async (args) => callLiveApi("delete", args)
  );
}
