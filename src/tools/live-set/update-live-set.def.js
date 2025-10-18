import { z } from "zod";
import { defineTool } from "../shared/define-tool.js";

export const toolDefUpdateLiveSet = defineTool("ppal-update-live-set", {
  title: "Update Live Set",
  description: "Update Live Set global settings",
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
    // arrangementFollower removed from interface - playback tool handles this via autoFollow parameter
  },
});
