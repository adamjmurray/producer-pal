import { z } from "zod";
import { MONITORING_STATE } from "../constants.js";
import { defineTool } from "../../shared/tool-framework/define-tool.js";

export const toolDefUpdateTrack = defineTool("ppal-update-track", {
  title: "Update Track",
  description: "Update track(s)",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    ids: z.string().describe("comma-separated track ID(s) to update"),
    name: z.string().optional().describe("name, ideally unique"),
    color: z.string().optional().describe("#RRGGBB"),
    mute: z.boolean().optional().describe("muted?"),
    solo: z.boolean().optional().describe("soloed?"),
    arm: z.boolean().optional().describe("record armed?"),
    inputRoutingTypeId: z
      .string()
      .optional()
      .describe("from availableInputRoutingTypes, set before channel"),
    inputRoutingChannelId: z
      .string()
      .optional()
      .describe("from availableInputRoutingChannels"),
    outputRoutingTypeId: z
      .string()
      .optional()
      .describe("from availableOutputRoutingTypes, set before channel"),
    outputRoutingChannelId: z
      .string()
      .optional()
      .describe("from availableOutputRoutingChannels"),
    monitoringState: z
      .enum(Object.values(MONITORING_STATE))
      .optional()
      .describe("input monitoring"),
    arrangementFollower: z
      .boolean()
      .optional()
      .describe("track follows the arrangement?"),
  },
});
