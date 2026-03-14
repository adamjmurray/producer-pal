// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefCreateTrack = defineTool("ppal-create-track", {
  title: "Create Track",
  description: "Create track(s).",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    trackIndex: z.coerce
      .number()
      .int()
      .min(-1)
      .optional()
      .describe("0-based index, -1 or omit to append"),
    count: z.coerce
      .number()
      .int()
      .min(1)
      .default(1)
      .describe("number to create"),
    name: z
      .string()
      .optional()
      .describe("name for all, or comma-separated for each"),
    color: z
      .string()
      .optional()
      .describe(
        "#RRGGBB for all, or comma-separated for each (cycles if fewer than count)",
      ),
    type: z.enum(["midi", "audio", "return"]).default("midi").describe("type"),
    mute: z.boolean().optional().describe("muted?"),
    solo: z.boolean().optional().describe("soloed?"),
    arm: z.boolean().optional().describe("record armed?"),
  },

  smallModelModeConfig: {
    excludeParams: ["count", "mute", "solo", "arm"],
    descriptionOverrides: {
      name: "track name",
      color: "#RRGGBB",
    },
  },
});
