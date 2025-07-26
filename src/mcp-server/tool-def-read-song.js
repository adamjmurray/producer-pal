// src/mcp-server/tool-def-read-song.js
import { z } from "zod";
import { DEVICE_TYPES } from "../tools/constants.js";
import { defineTool } from "./define-tool.js";

const description = `Read comprehensive information about the Live Set including global settings and all tracks:
- Tracks includes clip arrays with time-based properties in bar|beat format.
- Devices have a 'type' property with these possible values: ${DEVICE_TYPES.map((type) => `'${type}'`).join(", ")}.
- Tracks, drum pads, and rack chains may have a 'state' property:
  - No 'state' property means the entity is active (normal state - playing or ready to play)
  - When present, 'state' can be:
    - 'muted': Explicitly muted via UI button;
    - 'muted-via-solo': Muted as side-effect of another entity being soloed;
    - 'muted-also-via-solo': Both explicitly muted AND muted via solo (won't become active even if unmuted or other entity unsoloed);
    - 'soloed': Explicitly soloed, causing others to be muted-via-solo.

Understanding track arrangement-following states and clip playing states helps determine
which clips are currently audible and whether tracks will respond to Arrangement playback.

IMPORTANT: The returned state represents Live at this moment in time. If the user mentions moving, deleting,
or rearranging objects, immediately call ppal-read-song again before any other operations.

If this is the start of a new Producer Pal session call ppal-init before calling this.`;

export const toolDefReadSong = defineTool("ppal-read-song", {
  title: "Read Song",
  description,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema: {
    include: z
      .array(
        z.enum([
          "drum-chains",
          "notes",
          "rack-chains",
          "empty-scenes",
          "midi-effects",
          "instrument",
          "audio-effects",
          "routings",
          "session-clips",
          "arrangement-clips",
          "regular-tracks",
          "return-tracks",
          "master-track",
        ]),
      )
      .default(["regular-tracks", "instrument", "rack-chains"])
      .describe(
        "Array of data to include in the response. Available options: " +
          "'drum-chains' (include drum pad chains and return chains in rack devices), " +
          "'notes' (include notes data in clip objects), " +
          "'rack-chains' (include chains in rack devices), " +
          "'empty-scenes' (include scenes that contain no clips), " +
          "'midi-effects' (include MIDI effects array in track objects), " +
          "'instrument' (include instrument object in track objects), " +
          "'audio-effects' (include audio effects array in track objects), " +
          "'routings' (include input/output routing information in track objects), " +
          "'session-clips' (include full session clip data in track objects), " +
          "'arrangement-clips' (include full arrangement clip data in track objects), " +
          "'regular-tracks' (include regular tracks array), " +
          "'return-tracks' (include return tracks array), " +
          "'master-track' (include master track object). " +
          "Default: ['rack-chains', 'instrument', 'regular-tracks'].",
      ),
  },
});
