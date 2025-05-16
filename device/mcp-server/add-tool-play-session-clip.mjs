// device/mcp-server/add-tool-play-session-clip.mjs
import { z } from "zod";

export function addToolPlaySessionClip(server, callLiveApi) {
  server.tool(
    "play-session-clip",
    "Plays a specific clip in the Session view",
    {
      trackIndex: z.number().int().min(0).describe("Track index (0-based)"),
      clipSlotIndex: z.number().int().min(0).describe("Clip slot index (0-based)"),
    },
    async (args) => callLiveApi("play-session-clip", args)
  );
}
