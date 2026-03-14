// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefUpdateScene = defineTool("ppal-update-scene", {
  title: "Update Scene",
  description: "Update scene(s).",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    ids: z.coerce.string().describe("comma-separated scene ID(s) to update"),
    name: z
      .string()
      .optional()
      .describe(
        "name for all, or comma-separated for each (extras keep existing name)",
      ),
    color: z
      .string()
      .optional()
      .describe(
        "#RRGGBB for all, or comma-separated for each (cycles if fewer than ids)",
      ),
    tempo: z.coerce.number().optional().describe("BPM (-1 disables)"),
    timeSignature: z.string().optional().describe('N/D (4/4) or "disabled"'),
  },

  smallModelModeConfig: {
    excludeParams: [],
    descriptionOverrides: {
      name: "scene name",
      color: "#RRGGBB",
    },
  },
});
