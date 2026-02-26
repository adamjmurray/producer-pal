// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { MAX_CODE_LENGTH, MAX_SPLIT_POINTS } from "#src/tools/constants.ts";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefUpdateClip = defineTool("ppal-update-clip", {
  title: "Update Clip",
  description: "Update clip(s), MIDI notes, and warp settings (audio clips)",

  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },

  inputSchema: {
    // Basic clip properties
    ids: z.coerce.string().describe("comma-separated clip ID(s) to update"),
    name: z.string().optional().describe("clip name"),
    color: z.string().optional().describe("#RRGGBB"),
    timeSignature: z.string().optional().describe("N/D (4/4)"),

    // Clip region and loop settings
    start: z
      .string()
      .optional()
      .describe("bar|beat position where loop/clip region begins"),
    length: z.string().optional().describe("duration in bar:beat format"),
    looping: z.boolean().optional().describe("enable looping for the clip"),
    firstStart: z
      .string()
      .optional()
      .describe(
        "bar|beat playback start (looping clips, when different from start)",
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
      .describe("bar:beat duration in timeline (arrangement clips only)"),
    toSlot: z.coerce
      .string()
      .optional()
      .describe("trackIndex/sceneIndex to move session clip (e.g., '2/3')"),
    split: z
      .string()
      .optional()
      .describe(
        `comma-separated bar|beat positions to split clip (e.g., '2|1, 3|1') - max ${MAX_SPLIT_POINTS} points, arrangement clips only`,
      ),

    // Audio clip parameters
    gainDb: z.coerce
      .number()
      .min(-70)
      .max(24)
      .optional()
      .describe("audio clip gain in decibels (ignored for MIDI)"),
    pitchShift: z.coerce
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
    transforms: z
      .string()
      .optional()
      .describe("transform expressions (parameter: expression per line)"),
    noteUpdateMode: z
      .enum(["replace", "merge"])
      .optional()
      .default("merge")
      .describe(
        '"replace" (clear all notes first) or "merge" (overlay notes, v0 deletes)',
      ),
    ...(process.env.ENABLE_CODE_EXEC === "true"
      ? {
          code: z
            .string()
            .max(MAX_CODE_LENGTH)
            .optional()
            .describe(
              "JS function body: receives (notes, context), returns notes array (see Skills for properties)",
            ),
        }
      : {}),

    // Quantization parameters
    quantize: z.coerce
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
    quantizeSwing: z.coerce
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("swing amount (shifts off-beats toward next grid line)"),
    quantizePitch: z
      .string()
      .optional()
      .describe("limit quantization to specific pitch (e.g., C3, D#4)"),

    // Warp marker parameters
    ...(process.env.ENABLE_WARP_MARKERS === "true"
      ? {
          warpOp: z
            .enum(["add", "move", "remove"])
            .optional()
            .describe(
              'warp marker operation: "add" (create at beat), "move" (shift by distance), "remove" (delete at beat)',
            ),
          warpBeatTime: z.coerce
            .number()
            .optional()
            .describe(
              "beat position from clip 1.1.1 (exact value from read-clip for move/remove, target for add)",
            ),
          warpSampleTime: z.coerce
            .number()
            .optional()
            .describe(
              "sample time in seconds (optional for add - omit to preserve timing)",
            ),
          warpDistance: z.coerce
            .number()
            .optional()
            .describe(
              "beats to shift (+forward, -backward) for move operation",
            ),
        }
      : {}),
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
      "transforms",
      "split",
      "code",
    ],
  },
});
