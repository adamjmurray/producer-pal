// src/mcp-server/tool-def-create-track.js
import { z } from "zod/v3";
import { MAX_AUTO_CREATED_TRACKS } from "../tools/constants.js";
import { defineTool } from "./define-tool.js";

export const toolDefCreateTrack = defineTool("ppal-create-track", {
  title: "Create Track",
  description: `Creates new tracks at the specified index. Tracks will be inserted at the given index and existing tracks will shift right. All properties are optional except trackIndex. Maximum ${MAX_AUTO_CREATED_TRACKS} tracks can be created. TIP: After creating tracks, you can use the duplicate tool with routeToSource=true to layer multiple MIDI patterns through a single instrument. This enables polyrhythmic and phasing techniques.`,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    trackIndex: z
      .number()
      .int()
      .min(0)
      .describe("Track index (0-based) where to insert new tracks"),
    count: z
      .number()
      .int()
      .min(1)
      .default(1)
      .describe("Number of tracks to create (default: 1)"),
    name: z
      .string()
      .optional()
      .describe(
        "Base name for the tracks (auto-increments for count > 1). " +
          "TIP: Use descriptive, unique names to avoid routing ambiguity. " +
          "Duplicate track names can cause issues with routing operations.",
      ),
    color: z.string().optional().describe("Color in #RRGGBB hex format"),
    type: z
      .enum(["midi", "audio"])
      .default("midi")
      .describe("Type of tracks to create (default: midi)"),
    mute: z.boolean().optional().describe("Set mute state for the tracks"),
    solo: z.boolean().optional().describe("Set solo state for the tracks"),
    arm: z.boolean().optional().describe("Set arm state for the tracks"),
  },
});
