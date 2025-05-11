// device/mcp-server/add-tool-delete-track.mjs
import { z } from "zod";
import { callLiveApi } from "./call-live-api.mjs";

export function addToolDeleteTrack(server, pendingRequests) {
  server.tool(
    "delete-track",
    "Deletes a track at the specified index",
    {
      trackIndex: z.number().int().min(0).describe("Track index (0-based)"),
    },
    async (args) => callLiveApi("delete-track", args, pendingRequests)
  );
}
