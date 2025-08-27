import { z } from "zod";
import { MONITORING_STATE } from "../constants.js";
import { defineTool } from "../shared/define-tool.js";

export const toolDefUpdateTrack = defineTool("ppal-update-track", {
  title: "Update Track",
  description:
    "Updates properties of existing tracks by ID. Supports bulk operations when provided with comma-separated track IDs. " +
    "All properties except ids are optional. " +
    "Routing properties accept identifier strings that can be obtained from ppal-read-track or ppal-read-song with includeRoutings: true. " +
    "IMPORTANT: When changing routing, always set the routing type BEFORE setting the channel, " +
    "as available channels depend on the selected type.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    ids: z
      .string()
      .describe("Track ID or comma-separated list of track IDs to update"),
    name: z
      .string()
      .optional()
      .describe(
        "Name for the track. " +
          "TIP: Use descriptive, unique names to avoid routing ambiguity. " +
          "Duplicate track names can cause issues with routing operations.",
      ),
    color: z.string().optional().describe("Color in #RRGGBB hex format"),
    mute: z.boolean().optional().describe("Set mute state for the track"),
    solo: z.boolean().optional().describe("Set solo state for the track"),
    arm: z.boolean().optional().describe("Set arm state for the track"),
    inputRoutingTypeId: z
      .string()
      .optional()
      .describe(
        "Input routing type identifier (use inputId from availableInputRoutingTypes)",
      ),
    inputRoutingChannelId: z
      .string()
      .optional()
      .describe(
        "Input routing channel identifier (use inputId from availableInputRoutingChannels)",
      ),
    outputRoutingTypeId: z
      .string()
      .optional()
      .describe(
        "Output routing type identifier (use outputId from availableOutputRoutingTypes)",
      ),
    outputRoutingChannelId: z
      .string()
      .optional()
      .describe(
        "Output routing channel identifier (use outputId from availableOutputRoutingChannels)",
      ),
    monitoringState: z
      .enum(Object.values(MONITORING_STATE))
      .optional()
      .describe(
        `Track monitoring state (${Object.values(MONITORING_STATE).join(", ")})`,
      ),
  },
});
