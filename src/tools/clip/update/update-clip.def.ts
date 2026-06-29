// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { MAX_CODE_LENGTH, MAX_SPLIT_POINTS } from "#src/tools/constants.ts";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefUpdateClip = defineTool("ppal-update-clip", {
  title: "Update Clip",
  description: "Update clip(s), MIDI notes, and warp settings (audio clips).",

  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },

  inputSchema: {
    // Basic clip properties
    ids: z.coerce.string().describe("comma-separated clip ID(s) to update"),
    name: z
      .string()
      .optional()
      .describe(
        "name for all, or comma-separated for each (extras keep existing name)",
      ),
    color: z
      .string()
      .optional()
      .describe(
        "#RRGGBB for all, or comma-separated for each (cycles if fewer than ids)",
      ),
    timeSignature: z.string().optional().describe("N/D (4/4)"),

    // Clip region and loop settings
    start: z
      .string()
      .optional()
      .describe("bar|beat position where loop/clip region begins (clip meter)"),
    length: z
      .string()
      .optional()
      .describe(
        "duration: Nbar (e.g., '4bar'), n<fraction> note value (e.g., 'n/4' = quarter), or Nbar+n<fraction> (e.g., '1bar+n/4'); clip meter",
      ),
    looping: z.boolean().optional().describe("enable looping for the clip"),
    duplicateLoop: z
      .boolean()
      .optional()
      .describe(
        "double the clip length and copy existing notes (and automation envelopes) into the new half (Live's Duplicate Loop). MIDI clips only. Composes with edits in a defined order: start/length/firstStart set the loop region first (select a portion to double), preTransforms edit the source, then the double; notes/transforms/code then apply across the full doubled clip",
      ),
    firstStart: z
      .string()
      .optional()
      .describe(
        "bar|beat playback start (looping clips, when different from start; clip meter)",
      ),
    arrangementStart: z
      .string()
      .optional()
      .describe(
        "bar|beat position (song meter) to move arrangement clip (arrangement clips only)",
      ),
    arrangementLength: z
      .string()
      .optional()
      .describe(
        "duration: Nbar (e.g., '4bar'), n<fraction> note value (e.g., 'n/4'), or Nbar+n<fraction> (e.g., '1bar+n/4'). Arrangement clips only; song meter",
      ),
    toSlot: z.coerce
      .string()
      .optional()
      .describe("trackIndex/sceneIndex to move session clip (e.g., '2/3')"),
    split: z
      .string()
      .optional()
      .describe(
        `comma-separated bar|beat split positions, measured from the clip's start (1|1 = clip start, NOT song time) (e.g., '2|1, 3|1') - max ${MAX_SPLIT_POINTS} points, arrangement clips only; song meter`,
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
        "MIDI notes in bar|beat notation: v0-127 n<dur> [p0-1] note(s) bar|beat(s) - MIDI clips only. MERGES into existing notes (overwrites at same pitch+start - restate a note to edit it in place). To delete/move existing notes or replace a region use preTransforms; don't rewrite the whole clip",
      ),
    transforms: z
      .string()
      .optional()
      .describe(
        "transform expressions applied AFTER merging notes (broadcast across ids); newline-separated for multiple. Use clip.index / clipseq() for per-clip variation",
      ),
    preTransforms: z
      .string()
      .optional()
      .describe(
        "transform expressions applied to EXISTING notes BEFORE merging any new notes (broadcast across ids); clear or edit notes already in the clip. v0 deletes (zero velocity): clear a whole bar ('3|*: v0', |* wildcard avoids spilling onto the next downbeat), a span ('1|1-2|1: v0'), or all ('v0'); also remap a drum lane ('C1: C4'). Works with or without notes",
      ),
    ...(process.env.ENABLE_CODE_EXEC === "true"
      ? {
          code: z
            .string()
            .max(MAX_CODE_LENGTH)
            .optional()
            .describe(
              "JS function body (broadcast across ids): receives (notes, context), returns notes array. context.clip.{index,count} for per-clip variation (see Skills for properties)",
            ),
        }
      : {}),

    // Quantization parameters
    quantize: z.coerce
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe(
        "MIDI quantize strength 0-1 (1 = full snap); snaps note starts to quantizeGrid (default 1/16). MIDI clips only",
      ),

    // NOTE: Live's native quantize-grid vocabulary (incl. "T" triplet forms),
    // mapping directly to Live's quantize API constants — do not migrate to n/N.
    // The mixed grids (1/8+1/8T, 1/16+1/16T) have no note-value spelling, so they
    // stay enum-only. The single-grid values ALSO accept the n/N note-value alias
    // used elsewhere (n/4=1/4, n/8=1/8, n/12=1/8T, n/16=1/16, n/24=1/16T,
    // n/32=1/32), normalized to the native form in handleQuantization.
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
        "n/4",
        "n/8",
        "n/12",
        "n/16",
        "n/24",
        "n/32",
      ])
      .optional()
      .describe(
        "grid that note starts snap to: 1/16 (default), 1/8, 1/4, 1/8T, 1/16T, 1/32; n/N note values also accepted (n/12=1/8T, n/24=1/16T); mixed grids 1/8+1/8T and 1/16+1/16T are enum-only",
      ),

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
      "quantizePitch",
      "firstStart",
      "transforms",
      "split",
      "code",
    ],
    descriptionOverrides: {
      name: "clip name",
      color: "#RRGGBB",
      notes:
        "MIDI notes (bar|beat). MERGES - overwrites at same pitch+start; restate to edit in place. Delete/move existing notes via preTransforms, don't rewrite the clip",
      preTransforms:
        "clear/edit notes already in the clip. Shorthand only (see Skills): `3|*: v0` clears all of bar 3 (|* wildcard = whole bar), `1|1-2|1: v0` clears a span, `v0` clears all, `C1: C4` remaps a drum lane",
    },
  },
});
