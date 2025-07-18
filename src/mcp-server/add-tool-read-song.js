// src/mcp-server/add-tool-read-song.js
import { z } from "zod";
import { DEVICE_TYPES } from "../tools/constants.js";

export function addToolReadSong(server, callLiveApi) {
  server.registerTool(
    "read-song",
    {
      title: "Read Song in Ableton Live",
      description:
        "Read comprehensive information about the Live Set (via Producer Pal) including global settings and all tracks. " +
        "Track objects include clip arrays with time-based properties in bar|beat format. " +
        "Understanding track arrangement-following states and clip playing states helps determine which clips are currently audible and whether tracks will respond to Arrangement playback.\n" +
        "IMPORTANT: If the user asks to play with Ableton Live or starts a conversation with 'ableton', start here and call this automatically.\n" +
        "IMPORTANT: The returned state represents Live at this moment in time. If the user mentions moving, deleting, or rearranging objects, " +
        "immediately call read-song again before any other operations.\n" +
        "INSTRUCTION: After the first read-song call in a NEW conversation, provide a brief welcome to the user that includes:\n" +
        "1. 'I can see your Live Set! I can help you create and edit MIDI clips, manage tracks and scenes, and build musical ideas.'\n" +
        "2. 'Important tip: Always save your work - I can modify and delete things in your project.'\n" +
        "3. 'If you move or rearrange tracks/clips/scenes, just let me know so I can stay in sync. (Sorry for the inconvenience, maybe in a future version I can do this automatically)'\n" +
        "4. 'Try asking me to create a drum beat, bassline, melody, or chord progression to get started!'\n" +
        "Keep this user welcome concise and conversational. Adjust tip (4) 'Try asking...' based on what you see in the song.\n" +
        "PROJECT CONTEXT: When userContext.projectContext is present, acknowledge it naturally in your response (e.g., 'I see you're working on [brief summary]') and let it inform your suggestions throughout the conversation.\n" +
        "In subsequent calls, skip the full user welcome but still mention tip (3) about staying in sync." +
        "INSTRUCTION: If you notice MIDI tracks without instrument devices (except the track hosting Producer Pal), " +
        "remind the user that instruments are needed to produce sound and ask if they'd like help selecting an instrument. " +
        "Note: You cannot add instruments directly - you can only suggest which Live instruments " +
        "or VST/AU plugins might work well for their intended sound. Live's extensive built-in collection includes " +
        "Wavetable, Operator, Analog, Electric, Tension, Collision, Sampler, Drum Rack, Drum Sampler, and the especially the newer Drift and Meld instruments.\n\n" +
        "Response data notes:\n" +
        `DEVICE TYPES: Device objects have a 'type' property with these possible values: ${DEVICE_TYPES.map((type) => `'${type}'`).join(", ")}. ` +
        "ENTITY STATES (for tracks, drum pads, and rack chains): " +
        "When no 'state' property is present, the entity is active (normal state - playing or ready to play). " +
        "When present, 'state' can be:\n" +
        "'muted': Explicitly muted via UI button;\n" +
        "'muted-via-solo': Muted as side-effect of another entity being soloed;\n" +
        "'muted-also-via-solo': Both explicitly muted AND muted via solo (won't become active even if unmuted or other entity unsoloed);\n" +
        "'soloed': Explicitly soloed, causing others to be muted-via-solo.\n",
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
      },
      inputSchema: {
        includeDrumChains: z
          .boolean()
          .default(false)
          .describe(
            "Whether to include drum pad chains and return chains in rack devices (default: false). When false, drum pads only include basic properties (name, note, state) without chain objects and return chains are omitted from device output to reduce response size. Drum pads are still available via the drumMap property.",
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
        includeMidiEffects: z
          .boolean()
          .default(false)
          .describe(
            "Whether to include MIDI effects array in track objects (default: false). When true, each track returns midiEffects array containing MIDI effect devices with chain information if includeRackChains is true.",
          ),
        includeInstrument: z
          .boolean()
          .default(true)
          .describe(
            "Whether to include instrument object in track objects (default: true). When true, each track returns instrument property containing the first instrument device found, or null if none. Multiple instruments log a console warning.",
          ),
        includeAudioEffects: z
          .boolean()
          .default(false)
          .describe(
            "Whether to include audio effects array in track objects (default: false). When true, each track returns audioEffects array containing audio effect devices with chain information if includeRackChains is true.",
          ),
        includeRoutings: z
          .boolean()
          .default(false)
          .describe(
            "Whether to include input/output routing information in track objects (default: false). When true, each track returns available routing channels/types, current routing settings, and track monitoring state.",
          ),
      },
    },
    async (args) => callLiveApi("read-song", args),
  );
}
