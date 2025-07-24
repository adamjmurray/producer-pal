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
