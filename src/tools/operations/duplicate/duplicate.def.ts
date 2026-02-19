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
      .describe("number of copies (for tracks/scenes only, ignored for clips)"),

    destination: z
      .enum(["session", "arrangement"])
      .optional()
      .describe("scenes and clips can be copied to the session or arrangement"),
    arrangementStart: z.coerce
      .string()
      .optional()
      .describe(
        "bar|beat position(s), comma-separated for multiple clips (e.g., '1|1' or '1|1,2|1,3|1')",
      ),
    arrangementLocatorId: z
      .string()
      .optional()
      .describe(
        "place duplicate at locator position by ID (e.g., 'locator-0')",
      ),
    arrangementLocatorName: z
      .string()
      .optional()
      .describe("place duplicate at first locator matching name"),
    arrangementLength: z
      .string()
      .optional()
      .describe(
        "duration (beats or bar:beat) in arrangement, auto-fills with loops",
      ),
    name: z.string().optional().describe("name (appended with counts > 1)"),
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
      .describe("auto-switch view?"),
    toTrackIndex: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe("destination track index (for session clips)"),
    toSceneIndex: z.coerce
      .string()
      .optional()
      .describe(
        "destination scene index(es), comma-separated for multiple (e.g., '1' or '1,3,5')",
      ),
    toPath: z
      .string()
      .optional()
      .describe("device destination path (e.g., 't1/d0')"),
  },
  smallModelModeConfig: {
    excludeParams: [
      "arrangementLocatorId",
      "arrangementLocatorName",
      "withoutClips",
      "withoutDevices",
      "routeToSource",
    ],
  },
});
