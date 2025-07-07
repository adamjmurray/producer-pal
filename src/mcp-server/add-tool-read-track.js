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
        includeDrumChains: z
          .boolean()
          .default(false)
          .describe(
            "Whether to include drum pad chains and return chains in rack devices (default: false). When false, drum pads only include basic properties (name, note, state) without chain objects, and return chains are omitted from device output.",
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
        includeMidiEffects: z
          .boolean()
          .default(false)
          .describe(
            "Whether to include MIDI effects array (default: false). When true, returns midiEffects array containing MIDI effect devices with chain information if includeRackChains is true.",
          ),
        includeInstrument: z
          .boolean()
          .default(true)
          .describe(
            "Whether to include instrument object (default: true). When true, returns instrument property containing the first instrument device found, or null if none. Multiple instruments log a console warning.",
          ),
        includeAudioEffects: z
          .boolean()
          .default(false)
          .describe(
            "Whether to include audio effects array (default: false). When true, returns audioEffects array containing audio effect devices with chain information if includeRackChains is true.",
          ),
        includeRoutings: z
          .boolean()
          .default(false)
          .describe(
            "Whether to include input/output routing information (default: false). When true, returns available routing channels/types and current routing settings.",
          ),
      },
    },
    async (args) => callLiveApi("read-track", args),
  );
}
