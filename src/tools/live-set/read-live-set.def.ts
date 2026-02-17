// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefReadLiveSet = defineTool("ppal-read-live-set", {
  title: "Read Live Set",
  description: `Read Live Set global settings, track/scene overview.
Returns overview by default. Use include to add detail.`,

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
          "scenes",
          "routings",
          "mixer",
          "color",
          "locators",
          "*",
        ]),
      )
      .default([])
      .describe(
        'data: tracks (regular/return/master/all), scenes, routings, mixer, color, locators, "*" for all',
      ),
  },

  smallModelModeConfig: {
    descriptionOverrides: {
      include:
        'data: tracks (regular/return/master/all), scenes, routings, mixer, color, locators, "*" for all',
    },
  },
});
