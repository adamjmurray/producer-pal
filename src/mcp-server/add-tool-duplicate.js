// src/mcp-server/add-tool-duplicate.js
import { z } from "zod";
import { MAX_AUTO_CREATED_SCENES, MAX_AUTO_CREATED_TRACKS } from "../tools/constants";

export function addToolDuplicate(server, callLiveApi) {
  server.tool(
    "duplicate",
    `Duplicates an object by id and type. Supports creating multiple duplicates with the count parameter. Subject to limits: maximum ${MAX_AUTO_CREATED_TRACKS} tracks and ${MAX_AUTO_CREATED_SCENES} scenes. When duplicating scenes or tracks, clips are duplicated by default but can be excluded with includeClips:false. Use the duplicatedClips array in the response to identify which clip slots now contain clips that must be modified using update-clip rather than create-clip.`,
    {
      type: z.enum(["track", "scene", "clip"]).describe("Type of object to duplicate"),
      id: z.string().describe("Object id to duplicate"),
      count: z.number().int().min(1).default(1).describe("Number of duplicates to create (default: 1)"),
      destination: z
        .enum(["session", "arranger"])
        .optional()
        .describe(
          "Destination for clip or scene duplication. Required when type is 'clip'. For scenes, defaults to 'session'."
        ),
      arrangerStartTime: z
        .string()
        .optional()
        .describe("Start time in bar:beat format for Arranger view. Required when destination is 'arranger'."),
      arrangerLength: z
        .string()
        .optional()
        .describe("Length in bar:beat format for Arranger view clips (auto-duplicates looping clips to fill)"),
      name: z
        .string()
        .optional()
        .describe("Optional name for the duplicated object(s) (auto-increments for count > 1)"),
      includeClips: z
        .boolean()
        .optional()
        .describe("Whether to include clips when duplicating tracks or scenes (default: true)"),
    },
    async (args) => callLiveApi("duplicate", args)
  );
}
