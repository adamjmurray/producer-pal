// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefReadScene = defineTool("ppal-read-scene", {
  title: "Read Scene",
  description: "Read scene settings, clips",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema: {
    sceneId: z.coerce
      .string()
      .optional()
      .describe("provide this or sceneIndex"),
    sceneIndex: z.number().int().min(0).optional().describe("0-based index"),
    include: z
      .array(z.enum(["*", "clips", "clip-notes", "color", "warp-markers"]))
      .default([])
      .describe('data: clips, clip-notes, color, warp-markers, "*" for all'),
  },
});
