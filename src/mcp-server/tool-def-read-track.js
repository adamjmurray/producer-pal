// src/mcp-server/tool-def-read-track.js
import { z } from "zod";
import { defineTool } from "./define-tool.js";
import { DEVICE_TYPES } from "../tools/constants.js";

export const toolDefReadTrack = defineTool("ppal-read-track", {
  title: "Read Track",
  description:
    "Read comprehensive information about a track. Returns sessionClips and arrangementClips arrays containing clip objects with time-based properties in bar|beat format. " +
    "Understanding track state helps determine which clips are currently playing and whether tracks are following the Arrangement timeline. " +
    "Use includeRoutings to get input/output routing information including available channels and types. " +
    `DEVICE TYPES: Device objects have a 'type' property with these possible values: ${DEVICE_TYPES.map((type) => `'${type}'`).join(", ")}. ` +
    "ENTITY STATES (for tracks, drum pads, and rack chains): " +
    "When no 'state' property is present, the entity is active (normal state - playing or ready to play). " +
    "When present, 'state' can be: " +
    "'muted': Explicitly muted via UI button; " +
    "'muted-via-solo': Muted as side-effect of another entity being soloed; " +
    "'muted-also-via-solo': Both explicitly muted AND muted via solo (won't become active even if unmuted or other entity unsoloed); " +
    "'soloed': Explicitly soloed, causing others to be muted-via-solo.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema: {
    trackIndex: z.number().int().min(0).describe("Track index (0-based)"),
    include: z
      .array(
        z.enum([
          "*",
          "drum-chains",
          "notes",
          "rack-chains",
          "midi-effects",
          "instrument",
          "audio-effects",
          "routings",
          "available-routings",
          "session-clips",
          "arrangement-clips",
          "all-devices",
          "all-routings",
        ]),
      )
      .default([
        "notes",
        "rack-chains",
        "instrument",
        "session-clips",
        "arrangement-clips",
      ])
      .describe(
        "Array of data to include in the response. Available options: " +
          "'*' (include all available options), " +
          "'drum-chains' (include drum pad chains and return chains in rack devices), " +
          "'notes' (include notes data in clip objects), " +
          "'rack-chains' (include chains in rack devices), " +
          "'midi-effects' (include MIDI effects array), " +
          "'instrument' (include instrument object), " +
          "'audio-effects' (include audio effects array), " +
          "'routings' (include current routing settings), " +
          "'available-routings' (include available routing options), " +
          "'session-clips' (include full session clip data), " +
          "'arrangement-clips' (include full arrangement clip data), " +
          "'all-devices' (shortcut for midi-effects, instrument, audio-effects), " +
          "'all-routings' (shortcut for routings, available-routings). " +
          "Default: ['notes', 'rack-chains', 'instrument', 'session-clips', 'arrangement-clips'].",
      ),
  },
});
