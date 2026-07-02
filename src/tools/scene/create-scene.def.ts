// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";

export const toolDefCreateScene = defineTool("ppal-create-scene", {
  title: "Create Scene",
  description: "Create empty scene(s) or capture playing session clips.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    sceneIndex: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        "0-based index for new scene(s), shifts existing scenes. Required when capture=false, optional when capture=true",
      ),
    count: param(z.coerce.number().int().min(1).default(1), {
      default: "number to create",
      smallModel: null,
    }),
    capture: param(z.boolean().default(false), {
      default: "copy playing session clips instead of creating empty?",
      smallModel: null,
    }),
    name: param(z.string().optional(), {
      default: "name for all, or comma-separated for each",
      smallModel: "scene name",
    }),
    color: param(z.string().optional(), {
      default:
        "#RRGGBB for all, or comma-separated for each (cycles if fewer than count)",
      smallModel: "#RRGGBB",
    }),
    tempo: param(z.coerce.number().optional(), {
      default: "BPM (-1 disables when capturing)",
      smallModel: null,
    }),
    timeSignature: param(z.string().optional(), {
      default: 'N/D (4/4) or "disabled" when capturing',
      smallModel: null,
    }),
  },
});
