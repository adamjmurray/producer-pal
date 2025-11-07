import { z } from "zod";
import { defineTool } from "../shared/define-tool.js";

export const toolDefUpdateClip = defineTool("ppal-update-clip", {
  title: "Update Clip",
  description: "Update clip(s), MIDI notes, and warp markers (audio clips)",
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
    gain: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("audio clip gain 0-1 (ignored for MIDI)"),
    pitchShift: z
      .number()
      .min(-48)
      .max(48)
      .optional()
      .describe(
        "audio clip pitch shift in semitones, supports decimals (ignored for MIDI)",
      ),
    notes: z
      .string()
      .optional()
      .describe(
        "MIDI notes in bar|beat notation: [bar|beat] [v0-127] [t<dur>] [p0-1] note(s)",
      ),
    noteUpdateMode: z
      .enum(["replace", "merge"])
      .optional()
      .default("merge")
      .describe(
        '"replace" (clear all notes first) or "merge" (overlay notes, v0 deletes)',
      ),
    warpOp: z
      .enum(["add", "move", "remove"])
      .optional()
      .describe(
        'warp marker operation: "add" (create at beat), "move" (shift by distance), "remove" (delete at beat)',
      ),
    warpBeatTime: z
      .number()
      .optional()
      .describe(
        "beat position from clip 1.1.1 (exact value from read-clip for move/remove, target for add)",
      ),
    warpSampleTime: z
      .number()
      .optional()
      .describe(
        "sample time in seconds (optional for add - omit to preserve timing)",
      ),
    warpDistance: z
      .number()
      .optional()
      .describe("beats to shift (+forward, -backward) for move operation"),
  },
});
