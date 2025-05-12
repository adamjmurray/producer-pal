// device/mcp-server/add-tool-delete-scene.mjs
import { z } from "zod";

export function addToolDeleteScene(server, callLiveApi) {
  server.tool(
    "delete-scene",
    "Deletes a scene at the specified index",
    {
      sceneIndex: z.number().int().min(0).describe("Scene index (0-based)"),
    },
    async (args) => callLiveApi("delete-scene", args)
  );
}
