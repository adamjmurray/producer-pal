// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { MAX_CODE_LENGTH } from "#src/tools/constants.ts";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";

export const toolDefCreateClip = defineTool("ppal-create-clip", {
  title: "Create Clip",
  description:
    "Create MIDI or audio clip(s). Requires slot (session) and/or trackIndex + arrangementStart (arrangement). " +
    "For audio: use sampleFile (absolute path), otherwise omit sampleFile to create a MIDI clip. " +
    "The sample defines an audio clip's region, so start/length/firstStart/looping are MIDI-only.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },

  inputSchema: {
    slot: param(z.coerce.string().optional(), {
      default:
        "session clip slot(s): trackIndex/sceneIndex, both 0-based (scene 1 = index 0), comma-separated (e.g., '0/0' or '0/0,0/2,0/5')",
      smallModel:
        "session clip slot(s): trackIndex/sceneIndex, 0-based — scene 1 = slot 0 (e.g., '0/0')",
    }),

    trackIndex: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe("0-based track index (arrangement clips)"),

    arrangementStart: param(z.coerce.string().optional(), {
      default:
        "arrangement clip bar|beat position(s), comma-separated for multiple (e.g., '1|1' or '1|1,2|1,3|3'). Song meter",
      smallModel:
        "arrangement clip bar|beat position (e.g., '1|1'). Song meter",
    }),

    name: param(z.string().optional(), {
      default:
        "name for all, or comma-separated for each (indexed: session positions first, then arrangement)",
      smallModel: "clip name",
    }),

    color: param(z.string().optional(), {
      default:
        "#RRGGBB for all, or comma-separated for each (cycles if fewer than positions)",
      smallModel: "#RRGGBB",
    }),

    timeSignature: z
      .string()
      .optional()
      .describe(`N/D (4/4), default: global time signature`),

    start: z
      .string()
      .optional()
      .describe("bar|beat position where loop/clip region begins (clip meter)"),

    length: z
      .string()
      .optional()
      .describe(
        "duration: Nbar (e.g., '4bar'), n<fraction> note value (e.g., 'n/4'), or Nbar+n<fraction> (e.g., '1bar+n/4'). Clip meter. MIDI only, default: next full bar after latest note. Audio clip length comes from the sample",
      ),

    looping: z.boolean().optional().describe("enable looping for the clip"),

    firstStart: param(z.string().optional(), {
      default:
        "bar|beat playback start (looping clips, when different from start; clip meter)",
      smallModel: null,
    }),

    // Notation-keyed `notes` text so the schema reflects the active note format
    // instead of the default bar|beat.
    notes: param(z.string().optional(), {
      default:
        "MIDI in bar|beat notation: v0-127 n<dur> [p0-1] note(s) bar|beat(s) - MIDI clips only",
      smallModel:
        "MIDI notes (bar|beat): v0-127 n<dur> note(s) bar|beat(s) - MIDI clips only",
      "midi-json":
        "MIDI notes as a JSON array string, e.g. `[{p:60,t:0,d:4,v:100}]` (see Skills) - MIDI clips only",
      stark:
        "MIDI notes in stark notation (literal, round-trippable `type: content`; event-based drum hits, see Skills) - MIDI clips only",
    }),

    transforms: param(z.string().optional(), {
      default: "transform expressions (parameter: expression per line)",
      smallModel: null,
    }),

    ...(process.env.ENABLE_CODE_EXEC === "true"
      ? {
          code: param(z.string().max(MAX_CODE_LENGTH).optional(), {
            default:
              "JS function body: receives (notes, context), returns notes array (see Skills for properties) - MIDI only",
            smallModel: null,
          }),
        }
      : {}),

    sampleFile: z
      .string()
      .optional()
      .describe("absolute path to audio file - audio clips only"),

    warping: param(z.boolean().optional(), {
      default:
        "audio clips only. Omit and Live decides per its Loop/Warp Short Samples setting, often time-stretching the file to the tempo. false = play the file as rendered. The settled state comes back as `warping`",
      smallModel: "audio clips only: false plays the file as rendered",
    }),

    auto: param(z.enum(["play-scene", "play-clip"]).optional(), {
      default: "auto-play session clips (play-scene keeps scene in sync)",
      smallModel: null,
    }),

    takeLane: param(z.coerce.string().optional(), {
      default:
        'arrangement take lane: omit/0 = main lane, 1+ = that lane (auto-created), "new" = append a fresh lane (for variations)',
      smallModel: null,
    }),

    takeLaneName: param(z.string().optional(), {
      default: "name for a take lane newly created by this call",
      smallModel: null,
    }),
  },
});
