// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import {
  aliasParam,
  deprecatedParam,
} from "#src/tools/shared/tool-framework/hidden-param.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";

export const toolDefReadTrack = defineTool("ppal-read-track", {
  title: "Read Track",
  description:
    "Read track settings, clips, and devices. Returns overview by default. Use include to add detail.",

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },

  inputSchema: {
    id: z.coerce.string().optional().describe("provide this or path"),

    trackId: aliasParam(z.coerce.string().optional(), {
      canonical: "id",
    }),
    path: z.coerce
      .string()
      .optional()
      .describe(
        "track path instead of id: 't0', 'rt0' for a return, 'mt' for the main track",
      ),
    trackType: deprecatedParam(
      z.enum(["regular", "return", "master"]).optional(),
      { replacedBy: "path" },
    ),
    trackIndex: deprecatedParam(z.coerce.number().int().min(0).optional(), {
      replacedBy: "path",
    }),
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
          'session-clips, arrangement-clips = clip lists (arrangement-clips also lists take lanes). notes, timing, sample = clip detail (use with clips). devices, routings, available-routings, mixer = track data. drum-map = the kit\'s actual pad pitches and names, plus drumRackPath (pad paths are <drumRackPath>/p<note>); read it before writing drums. color = track + clip color. "*" = all',
        // `routings` joins `available-routings`: small mode hides all four
        // routing write params, so it could see the state, not the choices, and
        // change neither. See ADR-0026.
        smallModel: {
          description:
            "session-clips, arrangement-clips = clip lists (arrangement-clips also lists take lanes). notes, timing, sample = clip detail (use with clips). devices, mixer = track data. drum-map = the kit's actual pad pitches and names, plus drumRackPath (pad paths are <drumRackPath>/p<note>); read it before writing drums. color = track + clip color",
          excludeEnumValues: ["routings", "available-routings", "*"],
        },
      },
    ),
  },
});
