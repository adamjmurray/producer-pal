// src/mcp-server/add-tool-read-track.js
import { z } from "zod";

export function addToolReadTrack(server, callLiveApi) {
  server.tool(
    "read-track",
    "Read comprehensive information about a track. Returns sessionClips and arrangementClips arrays containing clip objects with time-based properties in bar|beat format. " +
      "Understanding track state helps determine which clips are currently playing and whether tracks are following the Arrangement timeline.",
    {
      trackIndex: z.number().int().min(0).describe("Track index (0-based)"),
    },
    async (args) => callLiveApi("read-track", args),
  );
}
