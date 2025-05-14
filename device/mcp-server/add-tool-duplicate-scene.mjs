// device/mcp-server/add-tool-duplicate-scene.mjs
import { z } from "zod";

export function addToolDuplicateScene(server, callLiveApi) {
  server.tool(
    "duplicate-scene",
    "Duplicates a scene at the specified index",
    {
      sceneIndex: z.number().int().min(0).describe("Scene index (0-based)"),
      name: z.string().optional().describe("Optional name for the duplicated scene"),
    },
    async (args) => callLiveApi("duplicate-scene", args)
  );
}
