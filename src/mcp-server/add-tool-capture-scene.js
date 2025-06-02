// src/mcp-server/add-tool-capture-scene.js
import { z } from "zod";

export function addToolCaptureScene(server, callLiveApi) {
  server.tool(
    "capture-scene",
    "Captures currently playing Session clips from all tracks and inserts them as a new scene below the selected scene. " +
      "IMPORTANT: This captures Session clips only (not Arrangement clips). " +
      "Tracks not playing a Session clip will have an empty clip slot in the captured scene. " +
      "WARNING: This operation makes ALL tracks stop following the Arrangement timeline even if they aren't playing a Session clip - use the transport tool's followingTrackIndexes to restore Arrangement playback if needed.",
    {
      sceneIndex: z.number().int().min(0).optional().describe("Optional scene index to select before capturing"),
      name: z.string().optional().describe("Optional name for the captured scene"),
    },
    async (args) => callLiveApi("capture-scene", args)
  );
}
