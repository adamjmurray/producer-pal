// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { MAX_CODE_LENGTH, MAX_SPLIT_POINTS } from "#src/tools/constants.ts";
import { boundedString } from "#src/tools/shared/tool-framework/bounded-string.ts";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import {
  aliasParam,
  deprecatedParam,
} from "#src/tools/shared/tool-framework/hidden-param.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";

export const toolDefUpdateClip = defineTool("ppal-update-clip", {
  title: "Update Clip",
  description: {
    default: "Update clip(s), MIDI notes, and warp settings (audio clips).",
    smallModel: "Update clip(s) and MIDI notes",
  },

  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },

  inputSchema: {
    // Basic clip properties
    id: z.coerce
      .string()
      .optional()
      .describe("clip ID(s) to update, comma-separated for multiple"),

    ids: aliasParam(z.coerce.string().optional(), {
      canonical: "id",
    }),
    path: param(z.coerce.string().optional(), {
      default:
        "clip slot(s) to update instead of id, comma-separated (e.g., 't0/s1' or 't0/s1,t2/s3')",
      smallModel: "clip slot to update instead of id (e.g., 't0/s1')",
    }),

    paths: aliasParam(z.coerce.string().optional(), { canonical: "path" }),
    name: param(z.string().optional(), {
      default:
        "name for all, or comma-separated for each (extras keep existing name)",
      smallModel: "clip name",
    }),
    color: param(z.string().optional(), {
      default:
        "#RRGGBB for all, or comma-separated for each (cycles if fewer than the clips)",
      smallModel: "#RRGGBB",
    }),
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
    duplicateLoop: param(z.boolean().optional(), {
      default:
        "double the clip length and copy existing notes (and automation envelopes) into the new half (Live's Duplicate Loop). MIDI clips only. Composes with edits in a defined order: start/length/firstStart set the loop region first (select a portion to double; any content past that region is pushed later, not deleted), preTransforms edit the source, then the double; notes/transforms then apply across the full doubled clip",
      smallModel:
        "double the clip length and copy existing notes into the new half (Live's Duplicate Loop). MIDI clips only. Order: start/length pick the region to double, preTransforms edit it, then the double; notes merge across the full doubled clip",
    }),
    firstStart: param(z.string().optional(), {
      default:
        "bar|beat playback start (looping clips, when different from start; clip meter)",
      smallModel: null,
    }),
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
        "duration: Nbar (e.g., '4bar'), n<fraction> note value (e.g., 'n/4'), or Nbar+n<fraction> (e.g., '1bar+n/4'). Arrangement clips only; song meter. " +
          "Lengthening a looping clip tiles copies to fill the span (many clips, not one); for a single clip, set looping false and supply notes for the full length",
      ),
    arrangementSplit: param(z.string().optional(), {
      default:
        `comma-separated bar|beat positions to cut clips at, on the song timeline like arrangementStart (e.g., '9|1, 17|1') - max ${MAX_SPLIT_POINTS} points. ` +
        "A position outside a clip is ignored, so one call can cut several clips at the same song position. Arrangement clips only; song meter",
      smallModel: null,
    }),
    toSlot: deprecatedParam(z.coerce.string().optional(), {
      replacedBy: "toPath",
    }),
    toPath: z.coerce
      .string()
      .optional()
      .describe(
        "clip slot(s) to move the clip(s) to, 't<track>/s<scene>', comma-separated for multiple " +
          "(e.g., 't2/s3' or 't2/s3,t2/s4'); session clips only. Paired 1:1 with the clips named by " +
          "id/path, in order - destinations don't cycle, so name one slot per clip",
      ),
    // Deprecated because its positions are clip-relative: models reason in song
    // time, so they aimed at the wrong bar every time. Kept working unchanged
    // for callers that scripted against it; arrangementSplit is the published
    // param and reads song-timeline positions.
    split: deprecatedParam(z.string().optional(), {
      replacedBy: "arrangementSplit",
    }),

    // Audio clip parameters
    gainDb: z.coerce
      .number()
      .min(-70)
      .max(24)
      .optional()
      .describe("audio clip gain in decibels, 0 = unity (ignored for MIDI)"),
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
      .describe(
        "audio clip warping on/off (ignored for MIDI). false resets the region to the whole file and turns looping off; looping:true forces warping back on",
      ),

    // MIDI note parameters. Notation-keyed `notes` text so the schema reflects
    // the active note format instead of the default bar|beat.
    notes: param(z.string().optional(), {
      default:
        "MIDI notes in bar|beat notation: v0-127 n<dur> [p0-1] note(s) bar|beat(s) - MIDI clips only. MERGES into existing notes (overwrites at same pitch+start - restate a note to edit it in place). To delete/move existing notes or replace a region use preTransforms; don't rewrite the whole clip",
      smallModel:
        "MIDI notes (bar|beat). MERGES - overwrites at same pitch+start; restate to edit in place. Delete/move existing notes via preTransforms, don't rewrite the clip",
      "midi-json":
        "MIDI notes as a JSON array string, e.g. `[{p:60,t:0,d:4,v:100}]` (p pitch, t start & d duration in beats, v velocity; see Skills) - MIDI clips only. MERGES (overwrites at same pitch+start; restate to edit in place). `v:0` deletes the note at that pitch+start. To clear a region or move notes use preTransforms - don't rewrite the clip",
      "smallModel:midi-json":
        "MIDI notes as JSON array string, e.g. `[{p:60,t:0,d:4,v:100}]` (p pitch, t start, d dur, v vel; see Skills). MERGES - overwrites at same pitch+start. `v:0` deletes the note at that pitch+start. Clear a region or move notes via preTransforms, don't rewrite the clip",
      stark:
        "MIDI notes in stark notation, a literal per-line `type: content` format with event-based drum hits (see Skills) - MIDI clips only. MERGES (overwrites at same pitch+start; restate to edit in place). Delete/move existing notes via preTransforms - don't rewrite the clip",
      "smallModel:stark":
        "MIDI notes in stark notation (`type: content`, event-based drums, see Skills). MERGES - overwrites at same pitch+start. Delete/move via preTransforms, don't rewrite the clip",
    }),
    transforms: param(z.string().optional(), {
      default:
        "transform expressions applied AFTER merging notes (broadcast across the clips); newline-separated for multiple. Use clip.index / clipseq() for per-clip variation",
      smallModel: null,
    }),
    preTransforms: param(z.string().optional(), {
      default:
        "transform expressions applied to EXISTING notes BEFORE merging any new notes (broadcast across the clips); clear or edit notes already in the clip. 'delete' (alias 'v0') removes: a whole bar ('3|*: delete', |* wildcard avoids spilling onto the next downbeat), a span ('1|1-2|1: delete'), one pitch ('C1: delete'), a pitch range ('C1-C5: delete'), or all ('delete'); also remap a drum lane ('C1: C4'). Works with or without notes",
      smallModel:
        "clear/edit notes already in the clip. Shorthand only (see Skills): `3|*: v0` clears all of bar 3 (|* wildcard = whole bar), `1|1-2|1: v0` clears a span, `v0` clears all, `C1: C4` remaps a drum lane",
    }),
    ...(process.env.ENABLE_CODE_EXEC === "true"
      ? {
          code: param(boundedString(MAX_CODE_LENGTH).optional(), {
            default: `JS function body (broadcast across the clips; max ${MAX_CODE_LENGTH} chars): receives (notes, context), returns notes array. context.clip.{index,count} for per-clip variation (see Skills for properties)`,
            smallModel: null,
          }),
        }
      : {}),

    // Quantization parameters
    quantize: z.coerce
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe(
        "quantize strength 0-1; default 1 (full snap) when quantizeGrid is set. Snaps note starts to quantizeGrid. MIDI clips only",
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

    quantizePitch: param(z.string().optional(), {
      default: "limit quantization to specific pitch (e.g., C3, D#4)",
      smallModel: null,
    }),

    // Warp marker parameters (debug builds only - see ENABLE_WARP_MARKERS)
    ...(process.env.ENABLE_WARP_MARKERS === "true"
      ? {
          warpOp: param(z.enum(["add", "move", "remove"]).optional(), {
            default:
              'warp marker operation (audio clips only): "add" (create at warpBeatTime), "move" (shift by warpDistance), "remove" (delete at warpBeatTime)',
            smallModel: null,
          }),
          warpBeatTime: param(z.coerce.number().optional(), {
            default:
              "warp marker position in beats from clip start (a number, not bar|beat); for move/remove use the exact beatTime from ppal-read-clip warpMarkers",
            smallModel: null,
          }),
          warpSampleTime: param(z.coerce.number().optional(), {
            default: "sample time in seconds for add (omit to preserve timing)",
            smallModel: null,
          }),
          warpDistance: param(z.coerce.number().optional(), {
            default: "beats to shift (+forward, -backward) for move",
            smallModel: null,
          }),
        }
      : {}),
  },
});
