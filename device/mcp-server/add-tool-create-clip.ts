// device/mcp-server/add-tool-create-clip.ts
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { callLiveApi } from "./call-live-api.ts";

export function addToolCreateClip(server: McpServer, pendingRequests: Map<string, Function>) {
  server.tool(
    "create-clip",
    "Creates a non-looping MIDI clip with optional notes at the specified track and clip slot",
    {
      track: z.number().int().min(0).describe("Track index (0-based)"),
      clipSlot: z.number().int().min(0).describe("Clip slot index (0-based)"),
      name: z.string().optional().describe("Optional name for the clip"),
      notes: z
        .string()
        .optional()
        .describe(
          "Musical notation string. Format: note+octave (C3 = middle C). " +
            "Durations: *N for longer, /N for shorter (C3*2, D3/2; default = quarter note). " +
            "Rests: R[optional *N or /N] (default = quarter rest). " +
            "Velocity: :vNN (0–127; default = 100), placed before duration. " +
            "Chords: [C3 E3 G3] (group notes played together, share velocity and duration). " +
            "Examples: 'C3 D3:v80/2 [E3 G3]:v90*2', 'C3 R D3*4', '[F3 A3 C4]:v10' "
        ),
      loop: z.boolean().default(false).describe("Enabling looping for the clip"),
      autoplay: z.boolean().default(false).describe("Automatically play the clip after creating it"),
    },
    async (args) => callLiveApi("create-clip", args, pendingRequests)
  );
}
