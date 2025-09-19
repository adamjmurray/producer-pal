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
          "*",
          "drum-chains",
          "notes",
          "rack-chains",
          "scenes",
          "midi-effects",
          "instrument",
          "audio-effects",
          "routings",
          "session-clips",
          "arrangement-clips",
          "regular-tracks",
          "return-tracks",
          "master-track",
          "all-tracks",
          "all-devices",
        ]),
      )
      .default(["regular-tracks", "instrument", "rack-chains"])
      .describe(
        `Array of data to include in the response. Available options:
"regular-tracks": include regular tracks array
"return-tracks": include return tracks array
"master-track": include master track object
"all-tracks": regular-tracks + return-tracks + master-track
"routings": include input/output routing information in track objects
"scenes": include full scene details
"midi-effects": include MIDI effects array in track objects
"instrument": include instrument object in track objects
"audio-effects": include audio effects array in track objects
"all-devices": midi-effects + instrument + audio-effects
"rack-chains": include chains inside rack devices
"drum-chains": include drum pad chains and return chains inside drum rack devices
"session-clips": include full session clip data in track objects
"arrangement-clips": include full arrangement clip data in track objects
"notes": include notes data in clip objects (avoid with many tracks/clips)
"*": include all available options (avoid except in very simple Live Sets)`,
      ),
  },
});
