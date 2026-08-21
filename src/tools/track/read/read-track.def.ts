// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import { aliasParam } from "#src/tools/shared/tool-framework/hidden-param.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";
import { optionalNumber } from "#src/tools/shared/tool-framework/optional-number.ts";

export const toolDefReadTrack = defineTool("ppal-read-track", {
  title: "Read Track",
  description:
    "Read track settings, clips, and devices. Returns overview by default. Use include to add detail.",

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },

  inputSchema: {
    id: z.coerce
      .string()
      .optional()
      .describe("provide this or trackType/trackIndex"),

    trackId: aliasParam(z.coerce.string().optional(), {
      canonical: "id",
    }),
    trackType: z
      .enum(["return", "master"])
      .optional()
      .describe(
        "return or master (omit for audio/midi tracks, which have independent trackIndexes)",
      ),
    trackIndex: optionalNumber(z.coerce.number().int().min(0)).describe(
      "0-based index",
    ),
    include: param(
      z
        .array(
          z.enum([
            "session-clips",
            "arrangement-clips",
            "notes",
            "timing",
            "sample",
            "devices",
            "drum-map",
            "routings",
            "available-routings",
            "mixer",
            "color",
            "*",
          ]),
        )
        .default([]),
      {
        default:
          'session-clips, arrangement-clips = clip lists (arrangement-clips also lists take lanes). notes, timing, sample = clip detail (use with clips). devices, routings, available-routings, mixer = track data. drum-map = the kit\'s actual pad pitches and names; read it before writing drums. color = track + clip color. "*" = all',
        // `routings` joins `available-routings`: small mode hides all four
        // routing write params, so it could see the state, not the choices, and
        // change neither. See ADR-0026.
        smallModel: {
          description:
            "session-clips, arrangement-clips = clip lists (arrangement-clips also lists take lanes). notes, timing, sample = clip detail (use with clips). devices, mixer = track data. drum-map = the kit's actual pad pitches and names; read it before writing drums. color = track + clip color",
          excludeEnumValues: ["routings", "available-routings", "*"],
        },
      },
    ),
  },
});
