// src/mcp-server/add-tool-raw-live-api.js
import { z } from "zod";

export function addToolRawLiveApi(server, callLiveApi) {
  server.tool(
    "raw-live-api",
    "Provides direct, low-level access to the Live API for research, development, and debugging purposes. " +
      "This tool exposes full LiveAPI capabilities including built-in properties, methods, and extensions. " +
      "Execute multiple operations sequentially on a LiveAPI instance. " +
      "DEVELOPMENT ONLY - not available in production builds.",
    {
      path: z.string().optional().describe("Optional LiveAPI path (e.g., 'live_set tracks 0')"),
      operations: z
        .array(
          z.object({
            type: z.enum(["get", "call", "set"]).describe("Operation type"),
            property: z.string().optional().describe("Property name for get/set operations"),
            method: z.string().optional().describe("Method name for call operations"),
            args: z.array(z.any()).optional().describe("Arguments for call operations"),
            value: z.any().optional().describe("Value for set operations"),
          }),
        )
        .min(1)
        .max(50)
        .describe("Array of operations to execute (max 50)"),
    },
    async (args) => callLiveApi("raw-live-api", args),
  );
}