// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefReadScene = defineTool("ppal-read-scene", {
  title: "Read Scene",
  description:
    "Read scene settings, clips.\nReturns overview by default. Use include to add detail.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema: {
    sceneId: z.coerce
      .string()
      .optional()
      .describe("provide this or sceneIndex"),
    sceneIndex: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe("0-based index"),
    include: z
      .array(z.enum(["clips", "notes", "sample", "color", "timing", "*"]))
      .default([])
      .describe(
        'clips = non-empty clips. notes, sample, color, timing = clip detail (use with clips). "*" = all',
      ),
  },
});
