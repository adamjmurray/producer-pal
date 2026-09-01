// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import { aliasParam } from "#src/tools/shared/tool-framework/hidden-param.ts";
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

    ids: aliasParam(z.coerce.string().optional(), {
      canonical: "id",
    }),
    path: param(z.coerce.string().optional(), {
      default:
        "scene path(s) to update instead of id, comma-separated (e.g., 's0' or 's0,s3')",
      smallModel: "scene path to update instead of id (e.g., 's0')",
    }),

    paths: aliasParam(z.coerce.string().optional(), { canonical: "path" }),
    name: param(z.string().optional(), {
      default:
        "name for all, or comma-separated one per scene, in order (blank entry = unchanged)",
      smallModel: "scene name",
    }),
    color: param(z.string().optional(), {
      default:
        "#RRGGBB for all, or comma-separated one per scene, in order (blank entry = unchanged)",
      smallModel: "#RRGGBB",
    }),
    tempo: z.coerce.number().optional().describe("BPM (-1 disables)"),
    timeSignature: z.string().optional().describe('N/D (4/4) or "disabled"'),
  },
});
