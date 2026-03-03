// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefUpdateScene = defineTool("ppal-update-scene", {
  title: "Update Scene",
  description: "Updates scene(s)",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    ids: z.coerce.string().describe("comma-separated scene ID(s) to update"),
    name: z
      .string()
      .optional()
      .describe("name (comma-separated when updating multiple)"),
    color: z
      .string()
      .optional()
      .describe("#RRGGBB (comma-separated when updating multiple, cycles)"),
    tempo: z.coerce.number().optional().describe("BPM (-1 disables)"),
    timeSignature: z.string().optional().describe('N/D (4/4) or "disabled"'),
    focus: z
      .boolean()
      .optional()
      .default(false)
      .describe("switch to session view and select the scene"),
  },

  smallModelModeConfig: {
    excludeParams: ["focus"],
    descriptionOverrides: {
      name: "scene name",
      color: "#RRGGBB",
    },
  },
});
