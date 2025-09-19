import { z } from "zod";
import { defineTool } from "../shared/define-tool.js";

export const toolDefReadSong = defineTool("ppal-read-song", {
  title: "Read Song",
  description: `Read comprehensive Ableton Live Set info including global settings and track list.
Use this for an overview of the state of Live and call again after any moves/deletes by the user.`,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema: {
    include: z
      .array(
        z.enum([
          "regular-tracks",
          "return-tracks",
          "master-track",
          "all-tracks",
          "routings",
          "scenes",
          "midi-effects",
          "instrument",
          "audio-effects",
          "all-devices",
          "rack-chains",
          "drum-chains",
          "session-clips",
          "arrangement-clips",
          "notes",
          "*",
        ]),
      )
      .default(["regular-tracks", "instrument", "rack-chains"])
      .describe(
        `Data to include. Options:
- "regular-tracks"
- "return-tracks"
- "master-track"
- "all-tracks" → regular + return + master tracks
- "routings" → track input/output routings
- "scenes"
- "midi-effects"
- "instrument"
- "audio-effects"
- "all-devices" → midi effects + instrument + audio effects
- "rack-chains" → chains in rack devices
- "drum-chains" → drum pad and return chains in drum racks
- "session-clips"
- "arrangement-clips"
- "notes" → MIDI notes (slow with many clips)
- "*" → everything (avoid unless simple Live Set)`,
      ),
  },
});
