// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefReadTrack = defineTool("ppal-read-track", {
  title: "Read Track",
  description: `Read track settings, clips, devices.
Returns overview by default. Use include to add detail.`,

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },

  inputSchema: {
    trackId: z.coerce
      .string()
      .optional()
      .describe("provide this or category/trackIndex"),
    category: z
      .enum(["regular", "return", "master"])
      .default("regular")
      .describe(
        "regular and return tracks have independent trackIndexes, master has no index",
      ),
    trackIndex: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe("0-based index"),
    include: z
      .array(
        z.enum([
          "session-clips",
          "arrangement-clips",
          "notes",
          "timing",
          "sample",
          "devices",
          "drum-maps",
          "routings",
          "available-routings",
          "mixer",
          "color",
          "*",
        ]),
      )
      .default([])
      .describe(
        'session-clips, arrangement-clips = clip lists. notes, timing, sample = clip detail (use with clips). devices, drum-maps, routings, available-routings, mixer = track data. color = track + clip color. "*" = all',
      ),
  },
});
