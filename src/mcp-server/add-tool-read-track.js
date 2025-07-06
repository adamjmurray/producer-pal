// src/mcp-server/add-tool-read-track.js
import { z } from "zod";
import { DEVICE_TYPES } from "../tools/read-track.js";

export function addToolReadTrack(server, callLiveApi) {
  server.registerTool(
    "read-track",
    {
      title: "Read Track in Ableton Live",
      description:
        "Read comprehensive information about a track. Returns sessionClips and arrangementClips arrays containing clip objects with time-based properties in bar|beat format. " +
        "Understanding track state helps determine which clips are currently playing and whether tracks are following the Arrangement timeline. " +
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
        includeDrumChains: z
          .boolean()
          .default(false)
          .describe(
            "Whether to include drum pad chains and return chains in rack devices (default: false). When false, drum pads only include basic properties (name, note, state, hasInstrument) without chain objects, and return chains are omitted from device output.",
          ),
        includeNotes: z
          .boolean()
          .default(true)
          .describe(
            "Whether to include notes data in clip objects (default: true). When false, clips return without notes property for lighter responses.",
          ),
        includeRackChains: z
          .boolean()
          .default(true)
          .describe(
            "Whether to include chains in rack devices (default: true). When false, non-drum rack devices return without chains property for lighter responses. This is separate from includeDrumChains which controls drum pad chains.",
          ),
      },
    },
    async (args) => callLiveApi("read-track", args),
  );
}
