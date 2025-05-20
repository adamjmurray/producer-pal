// src/mcp-server/add-tool-duplicate.js
import { z } from "zod";

export function addToolDuplicate(server, callLiveApi) {
  server.tool(
    "duplicate",
    "Duplicates an object by id and type. Supports tracks, scenes, and clips.",
    {
      type: z.enum(["track", "scene", "clip"]).describe("Type of object to duplicate"),
      id: z.string().describe("Object id to duplicate"),
      destination: z
        .enum(["session", "arranger"])
        .optional()
        .describe("Destination for clip duplication. Required when type is 'clip'."),
      arrangerStartTime: z
        .number()
        .optional()
        .describe("Start time in beats for Arranger view. Required when destination is 'arranger'."),
      name: z.string().optional().describe("Optional name for the duplicated object"),
    },
    async (args) => callLiveApi("duplicate", args)
  );
}
