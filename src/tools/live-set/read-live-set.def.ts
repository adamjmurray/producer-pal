// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefReadLiveSet = defineTool("ppal-read-live-set", {
  title: "Read Live Set",
  description: `Read Live Set global settings, tracks, scenes, devices, clips.
Re-read after moves/deletes for updated state.`,

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema: {
    include: z
      .array(
        z.enum([
          "regular-tracks",
          "return-tracks",
          "master-track",
          "all-tracks",
          "routings",
          "scenes",
          "midi-effects",
          "instruments",
          "audio-effects",
          "all-devices",
          "drum-maps",
          "session-clips",
          "arrangement-clips",
          "all-clips",
          "clip-notes",
          "sample",
          "color",
          "timing",
          "warp",
          "mixer",
          "locators",
          "*",
        ]),
      )
      .default(["regular-tracks"])
      .describe(
        'data: tracks (regular/return/master/all), routings, scenes, devices (midi-effects/instruments/audio-effects/all), drum-maps, clips (session/arrangement/all), clip-notes, mixer, sample, color, timing, warp, locators, "*" for all (avoid in big sets).',
      ),
  },

  smallModelModeConfig: {
    descriptionOverrides: {
      include:
        'data: tracks (regular/return/master/all), routings, scenes, devices (midi-effects/instruments/audio-effects/all), drum-maps, clips (session/arrangement/all), clip-notes, mixer, sample, color, timing, warp, "*" for all (avoid in big sets).',
    },
  },
});
