// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefSelect = defineTool("ppal-select", {
  title: "Select",
  description: "Read selection/view state (no args), or update it",

  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
  },

  inputSchema: {
    view: z.enum(["session", "arrangement"]).optional().describe("main view"),
    trackId: z.coerce
      .string()
      .optional()
      .describe("select a track with this or category/trackIndex"),
    category: z
      .enum(["regular", "return", "master"])
      .optional()
      .default("regular")
      .describe(
        "track category: regular and return tracks have independent trackIndexes, master has no index",
      ),
    trackIndex: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe("0-based index"),
    sceneId: z.coerce
      .string()
      .optional()
      .describe("select a scene with this or sceneIndex"),
    sceneIndex: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe("0-based index"),
    clipId: z.coerce
      .string()
      .optional()
      .describe("select a clip with this or trackIndex + sceneIndex"),
    deviceId: z.coerce.string().optional().describe("select a device"),
    instrument: z
      .boolean()
      .optional()
      .describe("select the track's instrument?"),
    detailView: z
      .enum(["clip", "device", "none"])
      .optional()
      .describe(
        `show the selected clip or device detail view, or "none" to hide`,
      ),
    showLoop: z
      .boolean()
      .optional()
      .describe("show selected clip's loop view?"),
    showBrowser: z.boolean().optional().describe("show browser view?"),
  },

  smallModelModeConfig: {
    excludeParams: ["instrument", "showLoop", "showBrowser"],
  },
});
