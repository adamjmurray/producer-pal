// device/mcp-server/add-tool-play-session-scene.mjs
import { z } from "zod";

export function addToolPlaySessionScene(server, callLiveApi) {
  server.tool(
    "play-session-scene",
    "Launches all clips in the specified scene",
    {
      sceneIndex: z.number().int().min(0).describe("Scene index (0-based)"),
    },
    async (args) => callLiveApi("play-session-scene", args)
  );
}
