// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import {
  LIVE_API_OPERATION_TYPES,
  MAX_OPERATIONS,
} from "#src/tools/advanced/live-api-operations.ts";
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
            .enum(LIVE_API_OPERATION_TYPES)
            .describe(
              "Operation type. Live Object Model: get, set, call, goto, info, getcount (child count), getstring (property as a string). set always returns 1, even when the write is rejected — read the property back to confirm. set_property does the same write, but reports the value you sent. " +
                "Producer Pal helpers returning normalized values: getProperty, getChildIds, exists, getColor, setColor. exists is our judgment, not Live's: Live's own valid field reads 1 even for a bad path, so this checks the object id instead. " +
                "The LiveAPI object itself, not the Live object it points at: get_property (reads a JS field, not a Live property), set_path, set_id, set_mode, and call_method (calls a JS method, not a Live method)",
            ),
          property: z
            .string()
            .optional()
            .describe(
              "Property name for get/set/set_property/get_property/getProperty/getstring operations, or child type for getChildIds/getcount operations",
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
              "Value for set/set_property operations, path for goto or set_path operations, " +
                'id for set_id operations (the bare number — "id 5" points the object at nothing), ' +
                "mode for set_mode operations (0 follows the path, 1 follows the object), " +
                'or color for setColor operations (a "#RRGGBB" hex string)',
            ),
        }),
      )
      .min(1)
      .max(MAX_OPERATIONS)
      .describe(`Array of operations to execute (max ${MAX_OPERATIONS})`),
  },
});
