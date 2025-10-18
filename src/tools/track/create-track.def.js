import { z } from "zod";
import { defineTool } from "../shared/define-tool.js";

export const toolDefCreateTrack = defineTool("ppal-create-track", {
  title: "Create Track",
  description: `Create track(s)`,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    trackIndex: z
      .number()
      .int()
      .min(0)
      .describe("0-based index for new track(s), shifts existing tracks"),
    count: z.number().int().min(1).default(1).describe("number to create"),
    name: z.string().optional().describe("name (appended with counts > 1)"),
    color: z.string().optional().describe("#RRGGBB"),
    type: z.enum(["midi", "audio"]).default("midi").describe("type"),
    mute: z.boolean().optional().describe("mutes?"),
    solo: z.boolean().optional().describe("soloed?"),
    arm: z.boolean().optional().describe("record armed?"),
  },
});
