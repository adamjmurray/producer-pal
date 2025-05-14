// device/mcp-server/add-tool-duplicate-track.mjs
import { z } from "zod";

export function addToolDuplicateTrack(server, callLiveApi) {
  server.tool(
    "duplicate-track",
    "Duplicates a track at the specified index",
    {
      trackIndex: z.number().int().min(0).describe("Track index (0-based)"),
    },
    async (args) => callLiveApi("duplicate-track", args)
  );
}
