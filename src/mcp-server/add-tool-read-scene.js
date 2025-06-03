// src/mcp-server/add-tool-read-scene.js
import { z } from "zod";

export function addToolReadScene(server, callLiveApi) {
  server.tool(
    "read-scene",
    "Read comprehensive information about a scene. When includeClips is true, returns clip objects with time-based properties in bar|beat format. " +
      "Understanding scene state helps determine which clips are currently playing and whether tracks are following the Arrangement timeline.",
    {
      sceneIndex: z
        .number()
        .int()
        .min(0)
        .describe("Scene index (0-based). This is also the clipSlotIndex of every clip in this scene."),
      includeClips: z.boolean().optional().default(false).describe("Whether to include clip information"),
    },
    async (args) => callLiveApi("read-scene", args),
  );
}
