// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { z } from "zod";
import { addressingAliases } from "#src/tools/shared/schema/addressing-params.ts";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import {
  aliasParam,
  deprecatedParam,
} from "#src/tools/shared/tool-framework/hidden-param.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";

export const toolDefReadClip = defineTool("ppal-read-clip", {
  title: "Read Clip",
  description:
    "Read clip settings, MIDI notes, and audio properties. Returns overview by default. Use include to add detail. An arrangement clip reports its path as where it starts - 't0[5|1]', or 't0/l0[5|1]' on a take lane; read one by id or by any path covering it.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema: {
    id: z.coerce.string().optional().describe("clip id(s), comma-separated"),

    ...addressingAliases({ idAlias: "clipId" }),
    path: z.coerce
      .string()
      .optional()
      .describe(
        "clip location(s) to read, comma-separated, 0-based: a clip slot 't<track>/s<scene>' (e.g., 't0/s3'), or an arrangement clip covering a position, 't<track>[<position>]' (e.g., 't0[5|1]')",
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
        .array(
          z.enum([
            "sample",
            "notes",
            "color",
            "timing",
            "warp",
            "envelopes",
            "*",
          ]),
        )
        .default([]),
      {
        default:
          'notes = MIDI data (muted notes are hidden and counted in mutedNotes; edits leave them alone). timing = loop/start/end markers. sample = audio file info (sampleFile, gainDb, pitchShift). warp = warp settings (sampleLength, sampleRate, warping, warpMode). color. envelopes = clip automation, session clips only (shown as envs: true when a clip has any); needs the Producer Pal remote script and a round trip per parameter, so ask for it by name - "*" leaves it out. "*" = all the rest',
        smallModel: {
          description:
            "notes = MIDI data (muted notes hidden, counted in mutedNotes). timing = loop/start/end markers. sample = audio file info. color",
          excludeEnumValues: ["warp", "envelopes", "*"],
        },
      },
    ),
  },
});
