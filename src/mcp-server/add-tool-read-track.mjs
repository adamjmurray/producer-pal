// src/mcp-server/add-tool-read-track.mjs
import { z } from "zod";

export function addToolReadTrack(server, callLiveApi) {
  server.tool(
    "read-track",
    "Read comprehensive information about a track",
    {
      trackIndex: z.number().int().min(0).describe("Track index (0-based)"),
    },
    async (args) => callLiveApi("read-track", args)
  );
}
