import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefReadClip = defineTool("ppal-read-clip", {
  title: "Read Clip",
  description: "Read clip settings, MIDI notes, and audio properties",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema: {
    clipId: z
      .string()
      .optional()
      .describe("provide this or trackIndex + sceneIndex"),
    trackIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("0-based index for session clips"),
    sceneIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("0-based index for session clips"),
    include: z
      .array(z.enum(["clip-notes", "color", "warp-markers"]))
      .default(["clip-notes"])
      .describe("data: clip-notes, color, warp-markers"),
  },
});
