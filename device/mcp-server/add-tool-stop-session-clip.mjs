// device/mcp-server/add-tool-stop-session-clip.mjs
import { z } from "zod";

export function addToolStopSessionClip(server, callLiveApi) {
  server.tool(
    "stop-session-clip",
    "Stops clips in Session view. Can stop all clips in a track or all clips in all tracks.",
    {
      trackIndex: z.number().int().min(-1).describe("Track index (0-based) or -1 to stop all clips in all tracks"),
    },
    async (args) => callLiveApi("stop-session-clip", args)
  );
}
