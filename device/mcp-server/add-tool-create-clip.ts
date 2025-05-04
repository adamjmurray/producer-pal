// device/server/add-tool-create-clip.ts
import Max from "max-api";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import crypto from "node:crypto";
import { z } from "zod";

export function addToolCreateClip(server: McpServer, pendingRequests: Map<string, Function>) {
  // Register tools that will delegate to the Max v8 object
  server.tool(
    "create-clip",
    "Creates a MIDI clip with optional notes at the specified track and clip slot",
    {
      track: z.number().int().min(0).describe("Track index (0-based)"),
      clipSlot: z.number().int().min(0).describe("Clip slot index (0-based)"),
      notes: z
        .string()
        .optional()
        .describe(
          "Musical notation string. Format: note+octave (C3=middle C), " +
            "space-separated = sequential quarter notes, [brackets]=chords. " +
            "Examples: 'C3 E3 G3', '[C3 E3 G3] [F3 A3 C4]'"
        ),
      duration: z.number().positive().default(1.0).describe("Duration of each note in quarter notes (default: 1.0)"),
    },
    async (args) => {
      Max.post(`Handling tool call: create-clip(${JSON.stringify({ args })}`);

      // Create a request with a unique ID
      const requestId = crypto.randomUUID();
      const request = {
        requestId,
        tool: "create-clip",
        args,
      };

      // Send the request to Max as JSON
      Max.outlet("mcp_request", JSON.stringify(request));

      // Return a promise that will be resolved when Max responds
      return new Promise((resolve) => {
        pendingRequests.set(requestId, resolve);
      });
    }
  );
}
