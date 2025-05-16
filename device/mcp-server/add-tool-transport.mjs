// device/mcp-server/add-tool-transport.mjs
import { z } from "zod";

export function addToolTransport(server, callLiveApi) {
  server.tool(
    "transport",
    "Controls the Arrangement transport, including playback, position, and loop settings",
    {
      action: z
        .enum(["play", "stop", "update"])
        .describe(
          "Transport action to perform - 'play', 'stop', or 'update' (to change loop or track follow settings without affecting playback)"
        ),
      startTime: z
        .number()
        .default(0)
        .optional()
        .describe("Position in beats to start playback from (only used when action is 'play')"),
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
