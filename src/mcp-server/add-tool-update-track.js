// src/mcp-server/add-tool-update-track.js
import { z } from "zod";
import { MONITORING_STATE } from "../tools/constants.js";

export function addToolUpdateTrack(server, callLiveApi) {
  server.registerTool(
    "update-track",
    {
      title: "Update Track in Ableton Live",
      description:
        "Updates properties of existing tracks by ID. Supports bulk operations when provided with comma-separated track IDs. " +
        "All properties except ids are optional. Routing properties accept identifier strings that can be obtained from read-track or read-song with includeRoutings: true.",
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
        inputRoutingTypeId: z
          .string()
          .optional()
          .describe("Input routing type identifier"),
        inputRoutingChannelId: z
          .string()
          .optional()
          .describe("Input routing channel identifier"),
        outputRoutingTypeId: z
          .string()
          .optional()
          .describe("Output routing type identifier"),
        outputRoutingChannelId: z
          .string()
          .optional()
          .describe("Output routing channel identifier"),
        monitoringState: z
          .enum(Object.values(MONITORING_STATE))
          .optional()
          .describe(`Track monitoring state (${Object.values(MONITORING_STATE).join(", ")})`),
      },
    },
    async (args) => callLiveApi("update-track", args),
  );
}
