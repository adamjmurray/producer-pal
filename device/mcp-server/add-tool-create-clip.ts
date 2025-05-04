// device/mcp-server/add-tool-create-clip.ts
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
          "Musical notation string. Format: note+octave (C3=middle C). " +
            "Rhythm: */# for longer/shorter durations (C3*2, D3/2, default=quarter note). " +
            "Rests: R[*/# optional] (default duration=quarter note). " +
            "Velocity: :vNN (1-127, default=100). " +
            "Examples: 'C3 D3*2 R E3:v80', '[C3 E3 G3]:v90 R/2 [F3 A3 C4]*4'"
        ),
    },
    async (args) => callLiveApi("create-clip", args, pendingRequests)
  );
}
