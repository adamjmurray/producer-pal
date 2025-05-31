// src/mcp-server/add-tool-create-clip.js
import { z } from "zod";
import { notationDescription } from "../notation/notation";
import { MAX_AUTO_CREATED_SCENES } from "../tools/constants";

export function addToolCreateClip(server, callLiveApi) {
  server.tool(
    "create-clip",
    "Creates MIDI clips in Session or Arranger view. " +
      "For Session view, provide trackIndex and clipSlotIndex. " +
      "Creating a clip in Session view fails if a clip already exists at the specified trackIndex/clipSlotIndex combination. For modifying clips in slots that already contain clips (e.g., after duplicating scenes), use update-clip instead.",
    "For Arranger view, provide trackIndex and arrangerStartTime. Existing arrangement clips will have overlapping areas overwritten. " +
      "When count > 1, Session clips are created in successive clip slots, and Arranger clips are placed back-to-back. " +
      `Scenes will be auto-created if needed to insert clips at the given index, up to a maximum of ${MAX_AUTO_CREATED_SCENES} scenes (sceneIndex == clipSlotIndex). ` +
      "Time Signature Behavior: arrangerStartTime uses the song's time signature for conversion from bar:beat format. " +
      "All other timing parameters (startMarker, endMarker, loopStart, loopEnd) use the clip's time signature (either provided or defaulting to song's time signature). " +
      "bar:beat format: Uses 1-based numbering where '1:1' is the first beat of the first bar, '1:2' is the second beat of the first bar, '2:1' is the first beat of the second bar, etc. Fractional beats like 1:1.5 (the first \"upbeat\") are supported. Clip length is set to the nearest whole beat after the last note end time. To ensure correct clip length, it is necessary to set endMarker and loopEnd (these should usually be the same).",
    {
      view: z
        .enum(["Session", "Arranger"])
        .describe("Location of the clips - either in Live's 'Session' or 'Arranger' view"),
      trackIndex: z.number().int().min(0).describe("Track index (0-based)"),
      clipSlotIndex: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Clip slot index (0-based). Required when view is 'Session'."),
      arrangerStartTime: z
        .string()
        .optional()
        .describe(
          "Start time in bar:beat format for Arranger view clips. Format is 'bar:beat' where bar and beat are 1-based (e.g. '1:1' = first beat of first bar, '2:3.5' = halfway through third beat of second bar). Uses song's time signature for conversion. Required when view is 'Arranger'."
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
          "Start marker position in bar:beat format where bar and beat are 1-based. '1:1' = first beat of first bar (the default start position). Uses clip's time signature."
        ),
      endMarker: z
        .string()
        .optional()
        .describe(
          "End marker position in bar:beat format where bar and beat are 1-based. For an N-bar clip starting on the first beat of the first bar, the end position is (N+1):1. Uses clip's time signature."
        ),

      loop: z.boolean().optional().describe("Enable or disable looping for the clips"),
      loopStart: z
        .string()
        .optional()
        .describe(
          "Loop start position in bar:beat format where bar and beat are 1-based. '1:1' = first beat of first bar (the default start position). Uses clip's time signature."
        ),
      loopEnd: z
        .string()
        .optional()
        .describe(
          "Loop end position in bar:beat format where bar and beat are 1-based. For an N-bar clip starting on the first beat of the first bar, the end position is (N+1):1. Uses clip's time signature."
        ),

      notes: z
        .string()
        .optional()
        .describe(`Musical notation in the following BarBeat notation format. ${notationDescription}`),

      autoplay: z
        .boolean()
        .default(false)
        .describe(
          "Play the clips (only applicable to Session view clips). Can be used when creating new clips to automatically play them after creation."
        ),
    },
    async (args) => callLiveApi("create-clip", args)
  );
}
