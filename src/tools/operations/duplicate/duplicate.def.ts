// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefDuplicate = defineTool("ppal-duplicate", {
  title: "Duplicate",
  description:
    "Duplicate an object.\n" +
    "Supports tracks, scenes, clips, and devices. Use count for multiple track/scene copies; arrangementStart, locator, or toSlot for clip placement.",

  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },

  inputSchema: {
    id: z.coerce.string().describe("object to duplicate"),
    type: z
      .enum(["track", "scene", "clip", "device"])
      .describe("type of object to duplicate"),

    name: z
      .string()
      .optional()
      .describe("name (comma-separated when duplicating multiple)"),

    count: z.coerce
      .number()
      .int()
      .min(1)
      .default(1)
      .describe(
        "number of copies (tracks/scenes only, ignored for clips/devices)",
      ),

    withoutClips: z.boolean().default(false).describe("exclude clips?"),
    withoutDevices: z.boolean().default(false).describe("exclude devices?"),

    arrangementStart: z.coerce
      .string()
      .optional()
      .describe(
        "arrangement bar|beat position(s) for clips/scenes, comma-separated for multiple (e.g., '1|1' or '1|1,2|1,3|1')",
      ),
    locator: z.coerce
      .string()
      .optional()
      .describe(
        "arrangement locator ID(s) or name(s), comma-separated for multiple (e.g., 'locator-0' or 'Verse' or 'locator-0,Chorus')",
      ),
    arrangementLength: z
      .string()
      .optional()
      .describe("duration in bar:beat (e.g., '4:0'), auto-fills with loops"),
    toSlot: z
      .string()
      .optional()
      .describe(
        "session destination clip slot(s), trackIndex/sceneIndex format, comma-separated for multiple (e.g., '0/1' or '0/1,2/3')",
      ),
    toPath: z
      .string()
      .optional()
      .describe(
        "device destination path(s), comma-separated for multiple (e.g., 't1/d0' or 't1/d0,t2/d0')",
      ),

    routeToSource: z
      .boolean()
      .optional()
      .describe(
        "route new track to source's instrument? (for MIDI layering/polyrhythms)",
      ),

    focus: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        "focus duplicated clip/scene (select + detail view for clips, session view for scenes)",
      ),
  },
  smallModelModeConfig: {
    toolDescription:
      "Duplicate an object.\n" +
      "Supports tracks, scenes, clips, and devices. Use arrangementStart or toSlot for clip placement; toPath for devices.",
    excludeParams: [
      "count",
      "withoutClips",
      "withoutDevices",
      "locator",
      "routeToSource",
      "focus",
    ],
    descriptionOverrides: {
      name: "name",
      arrangementStart: "arrangement bar|beat position (e.g., '1|1')",
      toSlot:
        "session destination clip slot, trackIndex/sceneIndex (e.g., '0/1')",
      toPath: "device destination path (e.g., 't1/d0')",
    },
  },
});
