// device/mcp-server/add-tool-write-scene.mjs
import { z } from "zod";

export function addToolWriteScene(server, callLiveApi) {
  server.tool(
    "write-scene",
    "Creates and updates a scene at the specified index. All properties are optional except sceneIndex.",
    {
      sceneIndex: z.number().int().min(0).describe("Scene index (0-based)"),
      name: z.string().optional().describe("Name for the scene"),
      color: z.string().optional().describe("Color in #RRGGBB hex format"),
      tempo: z.number().optional().describe("Tempo in BPM for the scene"),
      isTempoEnabled: z.boolean().optional().describe("Enable/disable scene tempo"),
      timeSignature: z.string().optional().describe('Time signature in format "n/m" (e.g. "4/4")'),
      isTimeSignatureEnabled: z.boolean().optional().describe("Enable/disable scene time signature"),
      trigger: z.boolean().default(false).describe("Trigger (fire) the scene"),
    },
    async (args) => callLiveApi("write-scene", args)
  );
}
