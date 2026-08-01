// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";

export const toolDefReadClip = defineTool("ppal-read-clip", {
  title: "Read Clip",
  description:
    "Read clip settings, MIDI notes, and audio properties. Returns overview by default. Use include to add detail.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema: {
    clipId: z.coerce.string().optional().describe("provide this or slot"),
    slot: z.coerce
      .string()
      .optional()
      .describe(
        "session clip slot: trackIndex/sceneIndex (e.g., '0/3'). provide this or clipId",
      ),
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
