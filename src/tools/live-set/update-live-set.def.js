import { z } from "zod";
import { defineTool } from "../shared/tool-framework/define-tool.js";

export const toolDefUpdateLiveSet = defineTool("ppal-update-live-set", {
  title: "Update Live Set",
  description: "Update Live Set global settings or manage cue points",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    tempo: z.number().min(20).max(999).optional().describe("BPM"),
    timeSignature: z.string().optional().describe("N/D (4/4)"),
    scale: z
      .string()
      .optional()
      .describe(
        '"Root ScaleName" ("C Major", "F# Minor", "Bb Dorian"). Empty string disables scale',
      ),
    cueOperation: z
      .enum(["create", "delete", "rename"])
      .optional()
      .describe("Cue point operation"),
    cueId: z
      .string()
      .optional()
      .describe("Cue ID for delete/rename (e.g., cue-0)"),
    cueTime: z
      .string()
      .optional()
      .describe(
        "Bar|beat position (required for create, alt ID for delete/rename)",
      ),
    cueName: z
      .string()
      .optional()
      .describe("Name for create/rename, or name-match filter for delete"),
    // arrangementFollower removed from interface - playback tool handles this via autoFollow parameter
  },
});
