// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { addressingAliases } from "#src/tools/shared/schema/addressing-params.ts";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";

export const toolDefUpdateScene = defineTool("ppal-update-scene", {
  title: "Update Scene",
  description: "Update scene(s).",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    id: z.coerce
      .string()
      .optional()
      .describe("scene ID(s) to update, comma-separated for multiple"),

    ...addressingAliases(),
    path: param(z.coerce.string().optional(), {
      default:
        "scene path(s) to update instead of id, comma-separated: 's<index>', where s0 is the first scene (a user's \"scene 3\" is s2) - e.g. 's0' or 's0,s3'",
      smallModel:
        "scene path to update instead of id: 's<index>', where s0 is the first scene (a user's \"scene 3\" is s2)",
    }),

    name: param(z.string().optional(), {
      default: "name for all, or comma-separated one per scene, in order",
      smallModel: "scene name",
    }),
    color: param(z.string().optional(), {
      default: "#RRGGBB for all, or comma-separated one per scene, in order",
      smallModel: "#RRGGBB",
    }),
    tempo: z.coerce.number().optional().describe("BPM (-1 disables)"),
    timeSignature: z.string().optional().describe('N/D (4/4) or "disabled"'),
  },
});
