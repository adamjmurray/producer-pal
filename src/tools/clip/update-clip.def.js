import { z } from "zod";
import { defineTool } from "../shared/define-tool.js";

export const toolDefUpdateClip = defineTool("ppal-update-clip", {
  title: "Update Clip",
  description: "Update clip(s) and MIDI notes",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    ids: z.string().describe("comma-separated clip ID(s) to update"),
    name: z.string().optional().describe("clip name"),
    color: z.string().optional().describe("#RRGGBB"),
    timeSignature: z.string().optional().describe("N/D (4/4)"),
    startMarker: z.string().optional().describe("starting bar|beat position"),
    length: z
      .string()
      .optional()
      .describe("duration (beats or bar:beat) relative to startMarker"),
    loop: z.boolean().optional().describe("looping?"),
    loopStart: z
      .string()
      .optional()
      .describe("bar|beat position of loop start"),
    notes: z
      .string()
      .optional()
      .describe(
        "MIDI notes in bar|beat notation: [bar|beat] [v0-127] [t<dur>] [p0-1] note(s)",
      ),
    noteUpdateMode: z
      .enum(["replace", "merge"])
      .describe(
        '"replace" (clear all notes first) or "merge" (overlay notes, v0 deletes)',
      ),
  },
});
