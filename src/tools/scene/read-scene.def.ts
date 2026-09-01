// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import { aliasParam } from "#src/tools/shared/tool-framework/hidden-param.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";

export const toolDefReadScene = defineTool("ppal-read-scene", {
  title: "Read Scene",
  description:
    "Read scene settings and clips. Returns overview by default. Use include to add detail.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema: {
    id: z.coerce
      .string()
      .optional()
      .describe("provide this, path, or sceneIndex"),

    sceneId: aliasParam(z.coerce.string().optional(), {
      canonical: "id",
    }),
    path: z.coerce
      .string()
      .optional()
      .describe("scene path instead of id (e.g., 's3')"),
    sceneIndex: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe("0-based index"),
    include: param(
      z
        .array(
          z.enum(["clips", "notes", "sample", "timing", "warp", "color", "*"]),
        )
        .default([]),
      {
        default:
          'clips = clip list. notes, sample, timing, warp = clip detail (use with clips). color = scene + clip color. "*" = all',
        // Same trim as the other read tools: a small model that learns `"*"`
        // works here generalizes it to siblings that reject it.
        smallModel: {
          description:
            "clips = clip list. notes, sample, timing = clip detail (use with clips). color = scene + clip color",
          excludeEnumValues: ["warp", "*"],
        },
      },
    ),
  },
});
