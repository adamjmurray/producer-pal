import { z } from "zod";
import { defineTool } from "../shared/tool-framework/define-tool.js";

export const toolDefReadLiveSet = defineTool("ppal-read-live-set", {
  title: "Read Live Set",
  description: `Read Live Set global settings, tracks, scenes, devices, clips.
Re-read after moves/deletes for updated state.`,
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
          "all-clips",
          "clip-notes",
          "color",
          "warp-markers",
          "mixer",
          "*",
        ]),
      )
      .default(["regular-tracks", "instruments", "drum-maps"])
      .describe(
        'data: tracks (regular/return/master/all), routings, scenes, devices (midi-effects/instruments/audio-effects/all), chains (rack/drum), drum-maps, clips (session/arrangement/all), clip-notes, mixer, color, warp-markers, "*" for all (avoid in big sets).',
      ),
  },
});
