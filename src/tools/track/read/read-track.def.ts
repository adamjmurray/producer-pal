// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
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
    trackId: z.coerce
      .string()
      .optional()
      .describe("provide this or trackType/trackIndex"),
    trackType: z
      .enum(["return", "master"])
      .optional()
      .describe(
        "return or master (omit for audio/midi tracks, which have independent trackIndexes)",
      ),
    trackIndex: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe("0-based index"),
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
          'session-clips, arrangement-clips = clip lists (arrangement-clips also lists take lanes). notes, timing, sample = clip detail (use with clips). devices, drum-map, routings, available-routings, mixer = track data. color = track + clip color. "*" = all',
        smallModel: {
          description:
            "session-clips, arrangement-clips = clip lists (arrangement-clips also lists take lanes). notes, timing, sample = clip detail (use with clips). devices, drum-map, routings, mixer = track data. color = track + clip color",
          excludeEnumValues: ["available-routings", "*"],
        },
      },
    ),
  },
});
