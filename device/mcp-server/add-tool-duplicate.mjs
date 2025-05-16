// device/mcp-server/add-tool-duplicate.mjs
import { z } from "zod";

export function addToolDuplicate(server, callLiveApi) {
  server.tool(
    "duplicate",
    "Duplicates an object by type. Supports tracks, scenes, clip slots, and clips to arranger view.",
    {
      type: z.enum(["track", "scene", "clip-slot", "clip-to-arranger"]).describe("Type of object to duplicate"),
      trackIndex: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Track index (0-based). Required for track and clip-slot types."),
      clipSlotIndex: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Clip slot index (0-based). Required for clip-slot type."),
      sceneIndex: z.number().int().min(0).optional().describe("Scene index (0-based). Required for scene type."),
      clipId: z.string().optional().describe("Clip ID. Required for clip-to-arranger type."),
      arrangerStartTime: z
        .number()
        .optional()
        .describe("Start time in beats for Arranger view. Required for clip-to-arranger type."),
      name: z.string().optional().describe("Optional name for the duplicated object"),
    },
    async (args) => callLiveApi("duplicate", args)
  );
}
