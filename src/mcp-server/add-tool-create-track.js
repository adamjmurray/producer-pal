// src/mcp-server/add-tool-create-track.js
import { z } from "zod";
import { MAX_AUTO_CREATED_TRACKS } from "../tools/constants";

export function addToolCreateTrack(server, callLiveApi) {
  server.tool(
    "create-track",
    `Creates new tracks at the specified index. Tracks will be inserted at the given index and existing tracks will shift right. All properties are optional except trackIndex. Maximum ${MAX_AUTO_CREATED_TRACKS} tracks can be created.`,
    {
      trackIndex: z.number().int().min(0).describe("Track index (0-based) where to insert new tracks"),
      count: z.number().int().min(1).default(1).describe("Number of tracks to create (default: 1)"),
      name: z.string().optional().describe("Base name for the tracks (auto-increments for count > 1)"),
      color: z.string().optional().describe("Color in #RRGGBB hex format"),
      type: z.enum(["midi", "audio"]).default("midi").describe("Type of tracks to create (default: midi)"),
      mute: z.boolean().optional().describe("Set mute state for the tracks"),
      solo: z.boolean().optional().describe("Set solo state for the tracks"),
      arm: z.boolean().optional().describe("Set arm state for the tracks"),
    },
    async (args) => callLiveApi("create-track", args)
  );
}
