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
    "Read clip settings, MIDI notes, and audio properties. Returns overview by default. Use include to add detail. An arrangement clip reports its path as where it starts - 't0[5|1]', or 't0/l0[5|1]' on a take lane; read one by id.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema: {
    id: z.coerce.string().optional().describe("provide this or path"),

    clipId: aliasParam(z.coerce.string().optional(), {
      canonical: "id",
    }),
    path: z.coerce
      .string()
      .optional()
      .describe(
        "where the clip is, 0-based: a clip slot 't<track>/s<scene>' (e.g., 't0/s3'), or an arrangement clip by where it starts, 't<track>[<position>]' (e.g., 't0[5|1]'). provide this or id",
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
