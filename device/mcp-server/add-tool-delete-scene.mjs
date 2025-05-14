// device/mcp-server/add-tool-delete-scene.mjs
import { z } from "zod";

export function addToolDeleteScene(server, callLiveApi) {
  server.tool(
    "delete-scene",
    "Deletes a scene by id",
    {
      id: z.string().describe("Scene id to delete"),
    },
    async (args) => callLiveApi("delete-scene", args)
  );
}
