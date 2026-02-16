// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefReadClip = defineTool("ppal-read-clip", {
  title: "Read Clip",
  description: "Read clip settings, MIDI notes, and audio properties",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema: {
    clipId: z.coerce
      .string()
      .optional()
      .describe("provide this or trackIndex + sceneIndex"),
    trackIndex: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe("0-based index for session clips"),
    sceneIndex: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe("0-based index for session clips"),
    include: z
      .array(z.enum(["clip-notes", "color", "timing", "warp", "*"]))
      .default([])
      .describe('data: timing, clip-notes, color, warp, "*" for all'),
  },
});
