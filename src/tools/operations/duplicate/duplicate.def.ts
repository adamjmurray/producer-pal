// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefDuplicate = defineTool("ppal-duplicate", {
  title: "Duplicate",
  description: "Duplicate an object",

  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },

  inputSchema: {
    type: z
      .enum(["track", "scene", "clip", "device"])
      .describe("type of object to duplicate"),

    id: z.coerce.string().describe("object to duplicate"),

    count: z.coerce
      .number()
      .int()
      .min(1)
      .default(1)
      .describe(
        "number of copies (tracks/scenes only, ignored for clips/devices)",
      ),

    arrangementStart: z.coerce
      .string()
      .optional()
      .describe(
        "bar|beat position(s), comma-separated for multiple clips (e.g., '1|1' or '1|1,2|1,3|1')",
      ),
    locatorId: z.coerce
      .string()
      .optional()
      .describe(
        "arrangement locator ID(s), comma-separated for multiple (e.g., 'locator-0' or 'locator-0,locator-2')",
      ),
    locatorName: z
      .string()
      .optional()
      .describe(
        "arrangement locator name(s), comma-separated for multiple (e.g., 'Verse' or 'Verse,Chorus')",
      ),
    arrangementLength: z
      .string()
      .optional()
      .describe(
        "duration (beats or bar:beat) in arrangement, auto-fills with loops",
      ),
    name: z.string().optional().describe("name"),
    withoutClips: z.boolean().default(false).describe("exclude clips?"),
    withoutDevices: z.boolean().default(false).describe("exclude devices?"),
    routeToSource: z
      .boolean()
      .optional()
      .describe(
        "route new track to source's instrument? (for MIDI layering/polyrhythms)",
      ),
    switchView: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "switch to arrangement view when duplicating to arrangement, or session view for tracks/scenes/session clips",
      ),
    toSlot: z
      .string()
      .optional()
      .describe(
        "destination clip slot(s), trackIndex/sceneIndex format, comma-separated for multiple (e.g., '0/1' or '0/1,2/3')",
      ),
    toPath: z
      .string()
      .optional()
      .describe(
        "device destination path(s), comma-separated for multiple (e.g., 't1/d0' or 't1/d0,t2/d0')",
      ),
  },
  smallModelModeConfig: {
    excludeParams: [
      "locatorId",
      "locatorName",
      "withoutClips",
      "withoutDevices",
      "routeToSource",
      "count",
      "switchView",
    ],
    descriptionOverrides: {
      arrangementStart: "bar|beat position (e.g., '1|1')",
      toSlot: "destination clip slot, trackIndex/sceneIndex (e.g., '0/1')",
      toPath: "device destination path (e.g., 't1/d0')",
    },
  },
});
