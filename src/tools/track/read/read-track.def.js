import { z } from "zod";
import { defineTool } from "../../shared/tool-framework/define-tool.js";

export const toolDefReadTrack = defineTool("ppal-read-track", {
  title: "Read Track",
  description: `Read track settings, clips, devices.`,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema: {
    trackId: z
      .string()
      .optional()
      .describe("provide this or category/trackIndex"),
    category: z
      .enum(["regular", "return", "master"])
      .default("regular")
      .describe(
        "regular and return tracks have independent trackIndexes, master has no index",
      ),
    trackIndex: z.number().int().min(0).optional().describe("0-based index"),
    include: z
      .array(
        z.enum([
          "session-clips",
          "arrangement-clips",
          "all-clips",
          "clip-notes",
          "midi-effects",
          "instruments",
          "audio-effects",
          "all-devices",
          "rack-chains",
          "drum-chains",
          "drum-maps",
          "routings",
          "available-routings",
          "all-routings",
          "color",
          "warp-markers",
          "mixer",
          "*",
        ]),
      )
      .default([
        "session-clips",
        "arrangement-clips",
        "clip-notes",
        "instruments",
        "drum-maps",
      ])
      .describe(
        'data: clips (session/arrangement/all), clip-notes, devices (midi-effects/instruments/audio-effects/all), chains (rack/drum), drum-maps, routings (current/available/all), mixer, color, warp-markers, "*" for all',
      ),
  },
});
