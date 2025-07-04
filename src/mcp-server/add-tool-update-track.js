// src/mcp-server/add-tool-update-track.js
import { z } from "zod";

export function addToolUpdateTrack(server, callLiveApi) {
  server.registerTool(
    "update-track",
    {
      title: "Update Track in Ableton Live",
      description:
        "Updates properties of existing tracks by ID. Supports bulk operations when provided with comma-separated track IDs. All properties except ids are optional.",
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
      },
      inputSchema: {
        ids: z
          .string()
          .describe("Track ID or comma-separated list of track IDs to update"),
        name: z.string().optional().describe("Name for the track"),
        color: z.string().optional().describe("Color in #RRGGBB hex format"),
        mute: z.boolean().optional().describe("Set mute state for the track"),
        solo: z.boolean().optional().describe("Set solo state for the track"),
        arm: z.boolean().optional().describe("Set arm state for the track"),
      },
    },
    async (args) => callLiveApi("update-track", args),
  );
}
