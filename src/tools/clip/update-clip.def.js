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
    start: z
      .string()
      .optional()
      .describe("bar|beat position where loop/clip region begins"),
    length: z
      .string()
      .optional()
      .describe(
        "duration in bar:beat format. When looping, this is the loop duration (from start to end). When not looping, this is the clip duration (from start to end). end = start + length",
      ),
    looping: z.boolean().optional().describe("enable looping for the clip"),
    firstStart: z
      .string()
      .optional()
      .describe(
        "bar|beat position for initial playback start (only for looping clips, only needed when different from start)",
      ),
    arrangementStart: z
      .string()
      .optional()
      .describe(
        "bar|beat position to move arrangement clip (arrangement clips only)",
      ),
    arrangementLength: z
      .string()
      .optional()
      .describe(
        "bar:beat duration for arrangement span (visible region in timeline). " +
          "Phase 1: Only shortening supported - lengthening will error. " +
          "Shortening preserves all data (notes, envelopes, automation). " +
          "Arrangement clips only.",
      ),
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
    warpMode: z
      .enum(["beats", "tones", "texture", "repitch", "complex", "pro"])
      .optional()
      .describe("audio clip warp mode (ignored for MIDI)"),
    warping: z
      .boolean()
      .optional()
      .describe("audio clip warping on/off (ignored for MIDI)"),
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
