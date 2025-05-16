// device/mcp-server/add-tool-transport.mjs
import { z } from "zod";

export function addToolTransport(server, callLiveApi) {
  server.tool(
    "transport",
    "Controls the Arrangement transport, including playback, position, and loop settings",
    {
      action: z.enum(["play", "stop"]).describe("Transport action to perform"),
      startTime: z.number().default(0).describe("Position in beats to start playback from"),
      loop: z.boolean().optional().describe("Enable/disable Arrangement loop"),
      loopStart: z.number().optional().describe("Loop start position in beats"),
      loopLength: z.number().optional().describe("Loop length in beats"),
      followingTracks: z
        .array(z.number().int().min(-1))
        .optional()
        .describe("Tracks that should follow the Arranger. Include -1 to make all tracks follow."),
    },
    async (args) => callLiveApi("transport", args)
  );
}
