import { z } from "zod";
import { defineTool } from "../shared/define-tool.js";

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
      .array(z.enum(["clip-notes", "audio-info", "color"]))
      .default(["clip-notes", "audio-info"])
      .describe("omit MIDI notes/audio info with empty array"),
  },
});
