// src/mcp-server/add-tool-raw-live-api.js
import { z } from "zod";

export function addToolRawLiveApi(server, callLiveApi) {
  server.tool(
    "raw-live-api",
    "Provides direct, low-level access to the Live API for research, development, and debugging purposes. " +
      "This tool exposes full LiveAPI capabilities including built-in properties, methods, and extensions. " +
      "Execute multiple operations sequentially on a LiveAPI instance. " +
      "Core operations (explicit): get_property, set_property, call_method. " +
      "Convenience shortcuts: get (calls get method), set (calls set method), call (calls call method), goto (calls goto method), info (gets info property), getProperty (calls getProperty extension), getChildIds (calls getChildIds extension), exists (calls exists extension), getColor (calls getColor extension), setColor (calls setColor extension). " +
      "NOTE: When running multiple operations, Live API warnings appear at the end without indicating which operation triggered them. For debugging warnings, run operations individually. " +
      "DEVELOPMENT ONLY - not available in production builds.",
    {
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
              .array(z.any())
              .optional()
              .describe("Arguments for call_method/call operations"),
            value: z
              .any()
              .optional()
              .describe(
                "Value for set_property/set operations, path for goto operations, or color for setColor operations",
              ),
          }),
        )
        .min(1)
        .max(50)
        .describe("Array of operations to execute (max 50)"),
    },
    async (args) => callLiveApi("raw-live-api", args),
  );
}
