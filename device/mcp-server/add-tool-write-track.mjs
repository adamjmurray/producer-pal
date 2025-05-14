// device/mcp-server/add-tool-write-track.mjs
import { z } from "zod";

export function addToolWriteTrack(server, callLiveApi) {
  server.tool(
    "write-track",
    "Creates and updates a track at the specified index. By default, this function will only modify properties that are explicitly provided. All properties are optional except trackIndex. Tracks will be auto-created if needed to insert the track at the given index, up to a maximum of 30 tracks.",
    {
      trackIndex: z.number().int().min(0).describe("Track index (0-based)"),
      name: z.string().optional().describe("Name for the track"),
      color: z.string().optional().describe("Color in #RRGGBB hex format"),
      mute: z.boolean().optional().describe("Set mute state for the track"),
      solo: z.boolean().optional().describe("Set solo state for the track"),
      arm: z.boolean().optional().describe("Set arm state for the track"),
      firedSlotIndex: z
        .number()
        .int()
        .min(-1)
        .optional()
        .describe(
          "Clip slot index to fire (0-based), updates firedSlotIndex property. Use -1 to stop all clips on the track."
        ),
      followsArranger: z
        .boolean()
        .default(false)
        .describe(
          "When true, stops any playing clip slot in this track and follow clips in the Arranger (unless firedSlotIndex triggers another Session clip)"
        ),
    },
    async (args) => callLiveApi("write-track", args)
  );
}
