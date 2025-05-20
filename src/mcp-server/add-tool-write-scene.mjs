// src/mcp-server/add-tool-write-scene.mjs
import { z } from "zod";

export function addToolWriteScene(server, callLiveApi) {
  server.tool(
    "write-scene",
    "Creates and updates a scene at the specified index. All properties are optional except sceneIndex. Scenes will be auto-created if needed to insert the scene at the given index, up to a maximum of 100 scenes.",
    {
      sceneIndex: z
        .number()
        .int()
        .min(0)
        .describe("Scene index (0-based). This is also the clipSlotIndex of every clip in this scene."),
      name: z.string().optional().describe("Name for the scene"),
      color: z.string().optional().describe("Color in #RRGGBB hex format"),
      tempo: z.number().optional().describe("Tempo in BPM for the scene. Pass -1 to disable the scene's tempo."),
      timeSignature: z
        .string()
        .optional()
        .describe(
          'Time signature in format "n/m" (e.g. "4/4"). Pass "disabled" to disable the scene\'s time signature.'
        ),
    },
    async (args) => callLiveApi("write-scene", args)
  );
}
