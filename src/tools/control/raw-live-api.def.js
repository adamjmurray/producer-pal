import { z } from "zod";
import { defineTool } from "../shared/tool-framework/define-tool.js";

export const toolDefRawLiveApi = defineTool("ppal-raw-live-api", {
  title: "Live API",
  description:
    "Provides direct, low-level access to the Live API for research, development, and debugging purposes.\n" +
    "This tool exposes full LiveAPI capabilities including built-in properties, methods, and extensions. " +
    "Execute multiple operations sequentially on a LiveAPI instance. " +
    "Core operations (explicit): get_property, set_property, call_method. " +
    "Convenience shortcuts: get (calls get method), set (calls set method), call (calls call method), goto (calls goto method), info (gets info property), getProperty (calls getProperty extension), getChildIds (calls getChildIds extension), exists (calls exists extension), getColor (calls getColor extension), setColor (calls setColor extension). " +
    "NOTE: When running multiple operations, Live API warnings appear at the end without indicating which operation triggered them. For debugging warnings, run operations individually. " +
    "DEVELOPMENT ONLY - not available in production builds.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    path: z
      .string()
      .optional()
      .describe("Optional LiveAPI path (e.g., 'live_set tracks 0')"),
    stopOnError: z
      .boolean()
      .optional()
      .describe("When false, collect errors per operation and continue"),
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
            .describe(
              "Operation type: Core operations (get_property, set_property, call_method) or convenience shortcuts (get, set, call, goto, info, getProperty, getChildIds, exists, getColor, setColor)",
            ),
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
          retries: z
            .number()
            .int()
            .min(0)
            .max(10)
            .optional()
            .describe("Retry count when an operation fails"),
        }),
      )
      .min(1)
      .max(50)
      .describe("Array of operations to execute (max 50)"),
  },
});
