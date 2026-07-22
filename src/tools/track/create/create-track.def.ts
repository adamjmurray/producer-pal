// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";

export const toolDefCreateTrack = defineTool("ppal-create-track", {
  title: "Create Track",
  description: "Create track(s).",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    trackIndex: z.coerce
      .number()
      .int()
      .min(-1)
      .optional()
      .describe("0-based index, -1 or omit to append"),
    count: param(z.coerce.number().int().min(1).default(1), {
      default: "number to create",
      smallModel: null,
    }),
    name: param(z.string().optional(), {
      default: "name for all, or comma-separated for each",
      smallModel: "track name",
    }),
    color: param(z.string().optional(), {
      default:
        "#RRGGBB for all, or comma-separated for each (cycles if fewer than count)",
      smallModel: "#RRGGBB",
    }),
    type: z.enum(["midi", "audio", "return"]).default("midi").describe("type"),
    mute: param(z.boolean().optional(), {
      default: "muted?",
      smallModel: null,
    }),
    solo: param(z.boolean().optional(), {
      default: "soloed?",
      smallModel: null,
    }),
    arm: param(z.boolean().optional(), {
      default: "record armed?",
      smallModel: null,
    }),
  },
});
