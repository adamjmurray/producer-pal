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

export const toolDefReadClip = defineTool("ppal-read-clip", {
  title: "Read Clip",
  description:
    "Read clip settings, MIDI notes, and audio properties. Returns overview by default. Use include to add detail. Arrangement clips report arrangementStart and path - the track ('t0'), or the take lane the clip sits on ('t0/l0'). That path names the location, not the clip, so act on an arrangement clip by id.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema: {
    clipId: z.coerce.string().optional().describe("provide this or path"),
    path: z.coerce
      .string()
      .optional()
      .describe(
        "clip slot 't<track>/s<scene>', both 0-based (e.g., 't0/s3'). provide this or clipId",
      ),

    slot: deprecatedParam(z.coerce.string().optional(), {
      replacedBy: "path",
    }),

    trackIndex: aliasParam(z.coerce.number().int().min(0).optional(), {
      canonical: "path",
      example: "t0/s3",
    }),

    sceneIndex: aliasParam(z.coerce.number().int().min(0).optional(), {
      canonical: "path",
      example: "t0/s3",
    }),
    include: param(
      z
        .array(z.enum(["sample", "notes", "color", "timing", "warp", "*"]))
        .default([]),
      {
        default:
          'notes = MIDI data. timing = loop/start/end markers. sample = audio file info (sampleFile, gainDb, pitchShift). warp = warp settings (sampleLength, sampleRate, warping, warpMode). color. "*" = all',
        smallModel: {
          description:
            "notes = MIDI data. timing = loop/start/end markers. sample = audio file info. color",
          excludeEnumValues: ["warp", "*"],
        },
      },
    ),
  },
});
