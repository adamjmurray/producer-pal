import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefUpdateClip = defineTool("ppal-update-clip", {
  title: "Update Clip",
  description: "Update clip(s), MIDI notes, and warp markers (audio clips)",

  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },

  inputSchema: {
    // Basic clip properties
    ids: z.string().describe("comma-separated clip ID(s) to update"),
    name: z.string().optional().describe("clip name"),
    color: z.string().optional().describe("#RRGGBB"),
    timeSignature: z.string().optional().describe("N/D (4/4)"),

    // Clip region and loop settings
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
          "Shortening preserves all data. " +
          "Lengthening to expose hidden content recreates clip (envelope loss). " +
          "Lengthening via tiling requires arrangementLength >= clip.length. " +
          "Arrangement clips only.",
      ),

    // Audio clip parameters
    gainDb: z
      .number()
      .min(-70)
      .max(24)
      .optional()
      .describe("audio clip gain in decibels (ignored for MIDI)"),
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

    // MIDI note parameters
    notes: z
      .string()
      .optional()
      .describe(
        "MIDI notes in bar|beat notation: [bar|beat] [v0-127] [t<dur>] [p0-1] note(s)",
      ),
    // modulations: z
    //   .string()
    //   .optional()
    //   .describe("modulation expressions (parameter: expression per line)"),
    noteUpdateMode: z
      .enum(["replace", "merge"])
      .optional()
      .default("merge")
      .describe(
        '"replace" (clear all notes first) or "merge" (overlay notes, v0 deletes)',
      ),

    // Quantization parameters
    quantize: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("quantization strength 0-1 (MIDI clips only)"),
    quantizeGrid: z
      .enum([
        "1/4",
        "1/8",
        "1/8T",
        "1/8+1/8T",
        "1/16",
        "1/16T",
        "1/16+1/16T",
        "1/32",
      ])
      .optional()
      .describe("note grid (required with quantize)"),
    quantizeSwing: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("swing amount 0-1 (default: 0)"),
    quantizePitch: z
      .number()
      .int()
      .min(0)
      .max(127)
      .optional()
      .describe("limit quantization to specific pitch"),

    // Warp marker parameters
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

  smallModelModeConfig: {
    toolDescription: "Update clip(s) and MIDI notes",
    excludeParams: [
      "warpOp",
      "warpBeatTime",
      "warpSampleTime",
      "warpDistance",
      "quantizeSwing",
      "quantizePitch",
      "firstStart",
    ],
    descriptionOverrides: {
      arrangementLength:
        "bar:beat duration in timeline (arrangement clips only)",
    },
  },
});
