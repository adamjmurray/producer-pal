// device/mcp-server/add-tool-delete-track.mjs
import { z } from "zod";

export function addToolDeleteTrack(server, callLiveApi) {
  server.tool(
    "delete-track",
    "Deletes a track at the specified index",
    {
      trackIndex: z.number().int().min(0).describe("Track index (0-based)"),
    },
    async (args) => callLiveApi("delete-track", args)
  );
}
