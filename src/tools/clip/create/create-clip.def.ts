// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { MAX_CODE_LENGTH } from "#src/tools/constants.ts";
import { boundedString } from "#src/tools/shared/tool-framework/bounded-string.ts";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import {
  aliasParam,
  deprecatedParam,
} from "#src/tools/shared/tool-framework/hidden-param.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";

export const toolDefCreateClip = defineTool("ppal-create-clip", {
  title: "Create Clip",
  // The MIDI-only list names the params in play, so small model mode gets its
  // own — `firstStart` is not one of them there.
  description: {
    default:
      "Create MIDI or audio clip(s). Requires path — 't0/s0' for the session, 't0[5|1]' for the arrangement. " +
      "For audio: use sampleFile (absolute path), otherwise omit sampleFile to create a MIDI clip. " +
      "The sample defines an audio clip's region, so start/length/firstStart/looping are MIDI-only.",
    smallModel:
      "Create MIDI or audio clip(s). Requires path — 't0/s0' for the session, 't0[5|1]' for the arrangement. " +
      "For audio: use sampleFile (absolute path), otherwise omit sampleFile to create a MIDI clip. " +
      "The sample defines an audio clip's region, so start/length/looping are MIDI-only.",
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },

  inputSchema: {
    path: param(z.coerce.string().optional(), {
      default:
        "where the clip(s) go, comma-separated for multiple. 't<track>/s<scene>' is a clip slot; " +
        "'t<track>[<position>]' is that spot on the track's arrangement, where a position is bar|beat " +
        "or loc:<locator name or id>. An arrangement path needs both halves. " +
        "'t<track>/l<lane>[<position>]' puts it on a take lane and 't<track>/l+[<position>]' appends a " +
        "fresh one. All indices 0-based, so 't0/s0' is the first track's first scene " +
        "(e.g., 't0/s0' or 't0[5|1]' or 't0/s0,t1[loc:Chorus]')",
      smallModel:
        "where the clip goes, 0-based: 't0/s0' = first track, first scene (session); 't0[5|1]' = bar 5 on the first track's arrangement",
    }),

    slot: deprecatedParam(z.coerce.string().optional(), {
      replacedBy: "path",
    }),

    // Models reach for these on their own, well-foundedly: they name a track
    // and a scene everywhere else in the toolset. Catching the guess costs a
    // warning; refusing it costs a round trip.
    trackIndex: aliasParam(z.coerce.number().int().min(0).optional(), {
      canonical: "path",
      example: "t0/s0",
    }),

    sceneIndex: aliasParam(z.coerce.number().int().min(0).optional(), {
      canonical: "path",
      example: "t0/s0",
    }),

    arrangementStart: deprecatedParam(z.coerce.string().optional(), {
      replacedBy: "path",
      example: "t0[5|1]",
    }),

    name: param(z.string().optional(), {
      default:
        "name for all, or comma-separated one per position, in order (clip slots first, then arrangement)",
      smallModel: "clip name",
    }),

    color: param(z.string().optional(), {
      default: "#RRGGBB for all, or comma-separated one per position, in order",
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
      default:
        "transform expressions (parameter: expression per line). Note-count operations (ratchet/repeat/split/merge) change how many notes exist",
      smallModel: null,
    }),

    ...(process.env.ENABLE_CODE_EXEC === "true"
      ? {
          code: param(boundedString(MAX_CODE_LENGTH).optional(), {
            default: `JS function body (max ${MAX_CODE_LENGTH} chars): receives (notes, context), returns notes array (see Skills for properties) - MIDI only`,
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
      smallModel:
        "audio clips only: false plays the file as rendered; omit and Live may time-stretch it to the tempo",
    }),

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

    // Carries the recommendation, not just the mechanism: without one the model
    // reads a neutral option, omits it, and hands back a clip the user has to
    // click. The skills blob used to say this; it belongs with the param, which
    // ships only when this tool does.
    auto: param(z.enum(["play-scene", "play-clip"]).optional(), {
      default:
        "auto-play the new session clip(s) — worth setting whenever the user will want to hear what you made. play-scene launches the whole scene so the new clip stays in sync with the others (it restarts them; say so first). play-clip fires the clip alone",
      smallModel: null,
    }),

    takeLane: deprecatedParam(z.coerce.string().optional(), {
      replacedBy: "path",
    }),

    takeLaneName: param(z.string().optional(), {
      default: "name for a take lane this call creates (path 't<track>/l+')",
      smallModel: null,
    }),
  },
});
