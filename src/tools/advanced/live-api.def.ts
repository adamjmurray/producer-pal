// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefLiveApi = defineTool("ppal-live-api", {
  title: "Live API",
  description:
    "Direct access to the Ableton Live Object Model. " +
    "Execute multiple operations sequentially on a LiveAPI instance. " +
    "Can read or modify any Live Set property — use with care.",

  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },

  inputSchema: {
    path: z
      .string()
      .optional()
      .describe("Optional LiveAPI path (e.g., 'live_set tracks 0')"),
    operations: z
      .array(
        z.object({
          type: z
            .enum([
              "get_property",
              "set_property",
              "call_method",
              "get",
              "set",
              "call",
              "goto",
              "info",
              "getProperty",
              "getChildIds",
              "exists",
              "getColor",
              "setColor",
            ])
            .describe("operation type"),
          property: z
            .string()
            .optional()
            .describe(
              "Property name for get_property/set_property/get/set/getProperty operations, or child type for getChildIds operations",
            ),
          method: z
            .string()
            .optional()
            .describe("Method name for call_method/call operations"),
          args: z
            .array(z.union([z.string(), z.number(), z.boolean()]))
            .optional()
            .describe("Arguments for call_method/call operations"),
          value: z
            .union([z.string(), z.number(), z.boolean(), z.array(z.number())])
            .optional()
            .describe(
              "Value for set_property/set operations, path for goto operations, or color for setColor operations (color is array of numbers)",
            ),
        }),
      )
      .min(1)
      .max(50)
      .describe("Array of operations to execute (max 50)"),
  },
});
