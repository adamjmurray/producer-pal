// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import {
  LIVE_API_OPERATION_ALIASES,
  LIVE_API_OPERATION_TYPES,
  MAX_OPERATIONS,
} from "#src/tools/advanced/live-api-operations.ts";
import { aliasedEnum } from "#src/tools/shared/tool-framework/enum-aliases.ts";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefLiveApi = defineTool("ppal-live-api", {
  title: "Live API",
  description:
    "Direct access to the Ableton Live Object Model. " +
    "Execute multiple operations sequentially on a LiveAPI instance. " +
    "Can read or modify any Live Set property — use with care. " +
    "Returns `results`, one value per operation. If one throws, earlier ones " +
    "stay applied, later ones don't run, and `failed` gives its index and detail.",

  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },

  inputSchema: {
    path: z.coerce
      .string()
      .optional()
      .describe(
        "Optional LiveAPI path (e.g., 'live_set tracks 0'); one object, not a list",
      ),
    operations: z
      .array(
        z.object({
          // Probe builds only: the field is absent everywhere else, so the
          // shipped schema is unchanged. See objectForOperation in live-api.ts.
          ...(process.env.ENABLE_OBJECT_PROBE === "true"
            ? {
                path: z.coerce
                  .string()
                  .optional()
                  .describe(
                    "Run just this operation against its own object at this path, leaving the object built from the top-level path where it is. Omit to use that object. Each operation with a path gets a separate object.",
                  ),
              }
            : {}),
          type: aliasedEnum(
            LIVE_API_OPERATION_TYPES,
            LIVE_API_OPERATION_ALIASES,
          ).describe(
            "Operation type. Live Object Model: get, set, call, goto, info, getcount (child count), getstring (property as a string). set always returns 1, even when the write is rejected — read the property back to confirm. set-property does the same write, but reports the value you sent. " +
              "Producer Pal helpers returning normalized values: get-property, get-child-ids, exists, get-color, set-color. exists is our judgment, not Live's: Live's own valid field reads 1 even for a bad path, so this checks the object id instead. " +
              "The LiveAPI object itself, not the Live object it points at: get-field (reads a JS field, not a Live property), set-path, set-id, set-mode, and call-method (calls a JS method, not a Live method)",
          ),
          property: z
            .string()
            .optional()
            .describe(
              "Property name for get/set/set-property/get-field/get-property/getstring operations, or child type for get-child-ids/getcount operations",
            ),
          method: z
            .string()
            .optional()
            .describe("Method name for call-method/call operations"),
          args: z
            .array(z.union([z.string(), z.number(), z.boolean()]))
            .optional()
            .describe("Arguments for call-method/call operations"),
          value: z
            .union([z.string(), z.number(), z.boolean(), z.array(z.number())])
            .optional()
            .describe(
              "Value for set/set-property operations, path for goto or set-path operations, " +
                'id for set-id operations (the bare number — "id 5" points the object at nothing), ' +
                "mode for set-mode operations (0 follows the path, 1 follows the object), " +
                'or color for set-color operations (a "#RRGGBB" hex string)',
            ),
        }),
      )
      .min(1)
      .max(MAX_OPERATIONS)
      .describe(`Array of operations to execute (max ${MAX_OPERATIONS})`),
  },
});
