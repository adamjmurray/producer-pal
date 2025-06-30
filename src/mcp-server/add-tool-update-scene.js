// src/mcp-server/add-tool-update-scene.js
import { z } from "zod";

export function addToolUpdateScene(server, callLiveApi) {
  server.registerTool(
    "update-scene",
    {
      title: "Update Scene in Ableton Live",
      description:
        "Updates properties of existing scenes by ID. Supports bulk operations when provided with comma-separated scene IDs. " +
        "Note: This only modifies scene properties - does not affect playback or launch scenes. " +
        "All properties except ids are optional.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
      },
      inputSchema: {
        ids: z
          .string()
          .describe("Scene ID or comma-separated list of scene IDs to update"),
        name: z.string().optional().describe("Name for the scene"),
        color: z.string().optional().describe("Color in #RRGGBB hex format"),
        tempo: z
          .number()
          .optional()
          .describe(
            "Tempo in BPM for the scene. Pass -1 to disable the scene's tempo.",
          ),
        timeSignature: z
          .string()
          .optional()
          .describe(
            'Time signature in format "n/m" (e.g. "4/4"). Pass "disabled" to disable the scene\'s time signature.',
          ),
      },
    },
    async (args) => callLiveApi("update-scene", args),
  );
}
