// src/mcp-server/add-tool-create-clip.js
import { z } from "zod";
import { notationDescription } from "../notation/notation";
import { MAX_AUTO_CREATED_SCENES } from "../tools/constants";

export function addToolCreateClip(server, callLiveApi) {
  server.tool(
    "create-clip",
    "Creates MIDI clips in Session or Arrangement view. " +
      "For Session view, provide trackIndex and clipSlotIndex. " +
      "Creating a clip in Session view fails if a clip already exists at the specified trackIndex/clipSlotIndex combination. For modifying clips in slots that already contain clips (e.g., after duplicating scenes), use update-clip instead. " +
      "For Arrangement view, provide trackIndex and arrangementStartTime. Existing arrangement clips will have overlapping areas overwritten. " +
      "When count > 1, Session clips are created in successive clip slots, and Arrangement clips are placed back-to-back. " +
      `Scenes will be auto-created if needed to insert clips at the given index, up to a maximum of ${MAX_AUTO_CREATED_SCENES} scenes (sceneIndex == clipSlotIndex). ` +
      "IMPORTANT: For Arrangement view clips, all timing parameters (startMarker, endMarker, loopStart, loopEnd) and note positions in the BarBeat notation are relative to the clip's start time, not the global arrangement timeline. A clip placed at arrangementStartTime '17|1' with notes starting at '1|1' will play those notes at global arrangement bar 17. " +
      "Clip length is set to the nearest whole beat after the last note end time. To ensure correct clip length, it is necessary to set endMarker and loopEnd (these should usually be the same).",
    {
      view: z
        .enum(["session", "arrangement"])
        .describe("Location of the clips - either in Live's 'Session' or 'Arrangement' view"),
      trackIndex: z.number().int().min(0).describe("Track index (0-based)"),
      clipSlotIndex: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Clip slot index (0-based). Required when view is 'Session'."),
      arrangementStartTime: z
        .string()
        .optional()
        .describe(
          "Arrangement view start time in bar|beat position format using pipe separator (e.g., '1|1' = first beat of first bar of the arrangement, '2|3.5' = halfway through third beat of second bar of the arrangement). Uses song's time signature for conversion. Required when view is 'Arrangement'."
        ),
      count: z.number().int().min(1).default(1).describe("Number of clips to create (default: 1)"),
      name: z.string().optional().describe("Base name for the clips (auto-increments for count > 1)"),
      color: z.string().optional().describe("Color in #RRGGBB hex format"),
      timeSignature: z
        .string()
        .optional()
        .describe('Time signature in format "n/m" (e.g. "4/4"). Defaults to the song\'s time signature for new clips.'),
      startMarker: z
        .string()
        .optional()
        .describe(
          "Clip start marker in bar|beat position format using pipe separator (e.g., '1|1' = first beat of first bar of the clip). Relative to clip start. Uses clip's time signature."
        ),
      endMarker: z
        .string()
        .optional()
        .describe(
          "Clip end marker in bar|beat position format using pipe separator (e.g., '5|1' = first beat of fifth bar of the clip). Relative to clip start. Uses clip's time signature."
        ),
      loop: z.boolean().optional().describe("Enable or disable looping for the clips"),
      loopStart: z
        .string()
        .optional()
        .describe(
          "Clip loop start in bar|beat position format using pipe separator (e.g., '1|1' = first beat of first bar of the clip). Relative to clip start. Uses clip's time signature."
        ),
      loopEnd: z
        .string()
        .optional()
        .describe(
          "Clip loop end in bar|beat position format using pipe separator (e.g., '5|1' = first beat of fifth bar of the clip). Relative to clip start. Uses clip's time signature."
        ),
      notes: z
        .string()
        .optional()
        .describe(`Musical notation in the following BarBeat notation format. ${notationDescription}`),
      autoplay: z
        .boolean()
        .default(false)
        .describe(
          "Play the clips (only applicable to Session view clips). Puts tracks into non-following state, stopping any currently playing Arrangement clips. Can be used when creating new clips to automatically play them after creation."
        ),
    },
    async (args) => callLiveApi("create-clip", args)
  );
}
