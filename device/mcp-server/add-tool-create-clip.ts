// device/server/add-tool-create-clip.ts
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { callLiveApi } from "./call-live-api.ts";

export function addToolCreateClip(server: McpServer, pendingRequests: Map<string, Function>) {
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
    async (args) => callLiveApi("create-clip", args, pendingRequests)
  );
}
