// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";

export const toolDefReadLiveSet = defineTool("ppal-read-live-set", {
  title: "Read Live Set",
  description:
    "Read Live Set global settings, track/scene overview. Returns overview by default. Use include to add detail.",

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema: {
    include: param(
      z
        .array(
          z.enum([
            "tracks",
            "scenes",
            "routings",
            "mixer",
            "color",
            "locators",
            "*",
          ]),
        )
        .default([]),
      {
        default:
          'tracks, scenes = lists. routings, mixer, color = detail (use with tracks/scenes). locators = arrangement markers. "*" = all',
        // `routings` propagates to the nested track reads, so it goes for the
        // same reason it goes on read-track. See ADR-0026.
        smallModel: {
          description:
            "tracks, scenes = lists. mixer, color = detail (use with tracks/scenes)",
          excludeEnumValues: ["routings", "locators", "*"],
        },
      },
    ),
  },
});
