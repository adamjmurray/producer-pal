import { z } from "zod";
import { defineTool } from "../shared/define-tool.js";

export const toolDefReadSong = defineTool("ppal-read-song", {
  title: "Read Song",
  description: `Read details about the Ableton Live Set including global settings, tracks, scenes, devices, and clips.
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
          "instruments",
          "audio-effects",
          "all-devices",
          "rack-chains",
          "drum-chains",
          "drum-maps",
          "session-clips",
          "arrangement-clips",
          "clip-notes",
          "*",
        ]),
      )
      .default(["regular-tracks", "instruments", "drum-maps"])
      .describe(
        `Data to include. Options:
- "regular-tracks"
- "return-tracks"
- "master-track"
- "all-tracks" → regular + return + master tracks
- "routings" → track input/output routings
- "scenes"
- "midi-effects"
- "instruments"
- "audio-effects"
- "all-devices" → midi effects + instruments + audio effects
- "rack-chains" → device chains in rack devices
- "drum-chains" → drum pad and return chains in drum racks
- "drum-maps" → drum pad mappings without chain data
- "session-clips"
- "arrangement-clips"
- "clip-notes" → MIDI notes (slow with many clips)
- "*" → everything (avoid unless simple Live Set)`,
      ),
  },
});
