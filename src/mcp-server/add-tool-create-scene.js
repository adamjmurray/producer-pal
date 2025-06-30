// src/mcp-server/add-tool-create-scene.js
import { z } from "zod";

export function addToolCreateScene(server, callLiveApi) {
  server.registerTool(
    "create-scene",
    {
      title: "Create Scene in Ableton Live",
      description:
        "Creates new scenes at the specified index. Scenes will be inserted at the given index and existing scenes will shift down. " +
        "Note: This only creates scene objects - use the transport tool's play-scene action to launch scenes and trigger their clips. " +
        "All properties are optional except sceneIndex.",
      inputSchema: {
        sceneIndex: z
          .number()
          .int()
          .min(0)
          .describe("Scene index (0-based) where to insert new scenes"),
        count: z
          .number()
          .int()
          .min(1)
          .default(1)
          .describe("Number of scenes to create (default: 1)"),
        name: z
          .string()
          .optional()
          .describe("Base name for the scenes (auto-increments for count > 1)"),
        color: z.string().optional().describe("Color in #RRGGBB hex format"),
        tempo: z
          .number()
          .optional()
          .describe(
            "Tempo in BPM for the scenes. Pass -1 to disable the scene's tempo.",
          ),
        timeSignature: z
          .string()
          .optional()
          .describe(
            'Time signature in format "n/m" (e.g. "4/4"). Pass "disabled" to disable the scene\'s time signature.',
          ),
      },
    },
    async (args) => callLiveApi("create-scene", args),
  );
}
