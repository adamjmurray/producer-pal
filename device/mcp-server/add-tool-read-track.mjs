// device/mcp-server/add-tool-read-track.mjs
import { z } from "zod";
import { callLiveApi } from "./call-live-api.mjs";

export function addToolReadTrack(server, pendingRequests) {
  server.tool(
    "read-track",
    "Read comprehensive information about a track",
    {
      trackIndex: z.number().int().min(0).describe("Track index (0-based)"),
    },
    async (args) => callLiveApi("read-track", args, pendingRequests)
  );
}
