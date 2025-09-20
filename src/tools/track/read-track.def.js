import { z } from "zod";
import { defineTool } from "../shared/define-tool.js";

export const toolDefReadTrack = defineTool("ppal-read-track", {
  title: "Read Track",
  description: `Read track details including clips, devices, and routing.
Clip time formats: bar|beat for positions (1|1 = first beat), bar:beat for durations (4:0 = 4 bars). Beats can be fractional.
Clip MIDI notes use bar|beat notation: [bar|beat] [v0-127] [t<dur>] [p0-1] notes.`,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema: {
    trackId: z
      .string()
      .optional()
      .describe("Provide this or trackType/trackIndex"),
    trackType: z
      .enum(["regular", "return", "master"])
      .default("regular")
      .describe(
        "Regular tracks and return tracks have independent trackIndexes. The master track has no index.",
      ),
    trackIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Track index (0-based)"),
    include: z
      .array(
        z.enum([
          "session-clips",
          "arrangement-clips",
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
        `Data to include. Options:
- "session-clips"
- "arrangement-clips"
- "clip-notes"
- "midi-effects"
- "instruments"
- "audio-effects"
- "all-devices" → midi-effects + instrument + audio-effects
- "rack-chains" → device chains in rack devices
- "drum-chains" → drum pad and return chains in drum racks
- "drum-maps" → drum pad mappings without chain data
- "routings" → current routing settings
- "available-routings" → available routing options
- "all-routings" → routings + available-routings
- "*" → everything (avoid unless simple Live Set)`,
      ),
  },
});
