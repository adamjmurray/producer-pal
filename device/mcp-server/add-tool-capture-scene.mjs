// device/mcp-server/add-tool-capture-scene.mjs
import { z } from "zod";

export function addToolCaptureScene(server, callLiveApi) {
  server.tool(
    "capture-scene",
    "Captures the currently playing clips and inserts them as a new scene below the selected scene",
    {
      sceneIndex: z.number().int().min(0).optional().describe("Optional scene index to select before capturing"),
    },
    async (args) => callLiveApi("capture-scene", args)
  );
}
