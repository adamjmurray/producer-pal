// src/mcp-server/add-tool-read-song.js
import { z } from "zod";
import { DEVICE_TYPES } from "../tools/read-track.js";

export function addToolReadSong(server, callLiveApi) {
  server.registerTool(
    "read-song",
    {
      title: "Read Song in Ableton Live",
      description:
        "Read comprehensive information about the Live Set (via Producer Pal) including global settings and all tracks. " +
        "Track objects include clip arrays with time-based properties in bar|beat format. " +
        "Understanding track arrangement-following states and clip playing states helps determine which clips are currently audible and whether tracks will respond to Arrangement playback. " +
        "IMPORTANT: If the user asks to play with Ableton Live, start here and call this automatically. " +
        "IMPORTANT: The returned state represents Live at this moment in time. If the user mentions moving, deleting, or rearranging objects, " +
        "immediately call read-song again before any other operations. " +
        "INSTRUCTION: After the first read-song call in a NEW conversation, provide a brief welcome to the user that includes: " +
        "(1) 'I can see your Live Set! I can help you create and edit MIDI clips, manage tracks and scenes, and build musical ideas.' " +
        "(2) 'Important tip: Always save your work - I can modify and delete things in your project.' " +
        "(3) 'If you move or rearrange tracks/clips/scenes, just let me know so I can stay in sync. (Sorry for the inconvenience, maybe in a future version I can do this automatically)' " +
        "(4) 'Try asking me to create a drum beat, bassline, melody, or chord progression to get started!' " +
        "Keep this user welcome concise and conversational. Adjust tip (4) 'Try asking...' based on what you see in the song. " +
        "In subsequent calls, skip the full user welcome but still mention tip (3) about staying in sync." +
        "INSTRUCTION: When reviewing the Live Set, if you notice MIDI tracks without instrument devices " +
        "(except the track hosting Producer Pal), mention to the user that instruments are needed to produce sound. " +
        "Ask if this is intentional or if they'd like help selecting an instrument." +
        "Note: You cannot add instruments directly - you can only suggest which Live instruments " +
        "or VST/AU plugins might work well for their intended sound. " +
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
        includeDrumChains: z
          .boolean()
          .default(false)
          .describe(
            "Whether to include drum pad chains and return chains in rack devices (default: false). When false, drum pads only include basic properties (name, note, state, hasInstrument) without chain objects and return chains are omitted from device output to reduce response size. Drum pads are still available via the drumMap property.",
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
        includeEmptyScenes: z
          .boolean()
          .default(false)
          .describe(
            "Whether to include scenes that contain no clips (default: false). When true, all scenes are returned regardless of clip content.",
          ),
      },
    },
    async (args) => callLiveApi("read-song", args),
  );
}
