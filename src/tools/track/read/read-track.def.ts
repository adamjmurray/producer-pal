// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefReadTrack = defineTool("ppal-read-track", {
  title: "Read Track",
  description: `Read track settings, clips, devices.`,

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
    trackIndex: z.number().int().min(0).optional().describe("0-based index"),
    include: z
      .array(
        z.enum([
          "session-clips",
          "arrangement-clips",
          "all-clips",
          "clip-notes",
          "midi-effects",
          "instruments",
          "audio-effects",
          "all-devices",
          "chains",
          "return-chains",
          "drum-pads",
          "drum-maps",
          "routings",
          "available-routings",
          "all-routings",
          "color",
          "warp-markers",
          "mixer",
          "*",
        ]),
      )
      .default([
        "session-clips",
        "arrangement-clips",
        "clip-notes",
        "instruments",
        "drum-maps",
      ])
      .describe(
        'data: clips (session/arrangement/all), clip-notes, devices (midi-effects/instruments/audio-effects/all), chains (rack chains), return-chains (rack send/return chains), drum-pads, drum-maps, routings (current/available/all), mixer, color, warp-markers, "*" for all',
      ),
  },
});
