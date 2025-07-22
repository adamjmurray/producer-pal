// src/mcp-server/tool-def-read-song.js
import { z } from "zod";
import { DEVICE_TYPES } from "../tools/constants.js";
import { VERSION } from "../version.js";
import { defineTool } from "./define-tool.js";

export const toolDefReadSong = defineTool("read-song", {
  title: "Read Song",
  description:
    "Read comprehensive information about the Live Set (via Producer Pal) including global settings and all tracks. " +
    "Track objects include clip arrays with time-based properties in bar|beat format. " +
    "Understanding track arrangement-following states and clip playing states helps determine which clips are currently audible and whether tracks will respond to Arrangement playback.\n" +
    "IMPORTANT: If the user asks to play with Ableton Live or starts a conversation with 'ableton', start here and call this automatically. Do not include additional information the first time you call read-song as this can cause timeouts in complex Live Sets. The default args have been tuned to help ensure success, so use them! You can call again and collect more details for Sets without dozens of tracks or clips. Use read-track to extract more detailed information from individual tracks in Live Sets with lots of tracks.\n" +
    "IMPORTANT: The returned state represents Live at this moment in time. If the user mentions moving, deleting, or rearranging objects, " +
    "immediately call read-song again before any other operations.\n" +
    "INSTRUCTION: After the first `read-song` call in a NEW conversation, provide a welcome message:\n" +
    `- Producer Pal ${VERSION} connected to Ableton Live.\n` +
    "- Important tips:\n" +
    "    - **Save often!** I can modify and delete things in your project, and I make mistakes.'\n" +
    "    - If you rearrange tracks/clips/scenes, tell me so I stay in sync.'\n" +
    "- Try asking me to create a drum beat, bassline, melody, or chord progression to get started. [Note: Adjust this part of the welcome message based on the contents of the Ableton Live Set]" +
    "PROJECT NOTES: When userContext.projectNotes is present, acknowledge it naturally in your response (e.g., 'I see you're working on [brief summary]') and let it inform your suggestions throughout the conversation.\n" +
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
      .default(false)
      .describe(
        "Whether to include notes data in clip objects (default: false). When false, clips return without notes property for lighter responses.",
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
    includeSessionClips: z
      .boolean()
      .default(false)
      .describe(
        "Whether to include full session clip data in track objects (default: false). When false, session clips return minimal data with only clipId and clipSlotIndex for faster responses when detailed clip information is not needed.",
      ),
    includeArrangementClips: z
      .boolean()
      .default(false)
      .describe(
        "Whether to include full arrangement clip data in track objects (default: false). When false, arrangement clips return minimal data with only clipId for faster responses when detailed clip information is not needed.",
      ),
  },
});
