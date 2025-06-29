// src/mcp-server/add-tool-create-clip.js
import { z } from "zod";
import { notationDescription } from "../notation/notation.js";
import { MAX_AUTO_CREATED_SCENES } from "../tools/constants.js";

export function addToolCreateClip(server, callLiveApi) {
  server.tool(
    "create-clip",
    "Creates MIDI clips in Session or Arrangement. " +
      "For Session view, provide trackIndex and clipSlotIndex. " +
      "Creating a clip in Session view fails if a clip already exists at the specified trackIndex/clipSlotIndex combination. For modifying clips in slots that already contain clips (e.g., after duplicating scenes), use update-clip instead. " +
      "For Arrangement view, provide trackIndex and arrangementStartTime. Existing arrangement clips will have overlapping areas overwritten. " +
      "When count > 1, Session clips are created in successive clip slots, and Arrangement clips are placed back-to-back. " +
      `Scenes will be auto-created if needed to insert clips at the given index, up to a maximum of ${MAX_AUTO_CREATED_SCENES} scenes (sceneIndex == clipSlotIndex). ` +
      "IMPORTANT: For Arrangement view clips, all timing parameters (startMarker, length) and note positions in the BarBeat notation are relative to the clip's start time, not the global arrangement timeline. A clip placed at arrangementStartTime '17|1' with notes starting at '1|1' will play those notes at global arrangement bar 17. " +
      "Clip length defaults to fit the notes, or can be explicitly set with the length parameter.",
    {
      view: z
        .enum(["session", "arrangement"])
        .describe("Location of the clips - either in Session or Arrangement"),
      trackIndex: z.number().int().min(0).describe("Track index (0-based)"),
      clipSlotIndex: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          "Clip slot index (0-based). Required when view is 'Session'.",
        ),
      arrangementStartTime: z
        .string()
        .optional()
        .describe(
          "Arrangement view start time in bar|beat position format using pipe separator (e.g., '1|1' = first beat of first bar of the arrangement, '2|3.5' = halfway through third beat of second bar of the arrangement). Uses song's time signature for conversion. Required when view is 'Arrangement'.",
        ),
      count: z
        .number()
        .int()
        .min(1)
        .default(1)
        .describe("Number of clips to create (default: 1)"),
      name: z
        .string()
        .optional()
        .describe("Base name for the clips (auto-increments for count > 1)"),
      color: z.string().optional().describe("Color in #RRGGBB hex format"),
      timeSignature: z
        .string()
        .optional()
        .describe(
          'Time signature in format "n/m" (e.g. "4/4"). Defaults to the song\'s time signature for new clips.',
        ),
      startMarker: z
        .string()
        .optional()
        .describe(
          "Clip start marker in bar|beat position format using pipe separator (e.g., '1|1' = first beat of first bar of the clip). Relative to clip start. Uses clip's time signature.",
        ),
      length: z
        .string()
        .optional()
        .describe(
          "Clip length in bar:beat duration format using colon separator (e.g., '4:0' = exactly 4 bars, '2:1.5' = 2 bars + 1.5 beats). When provided, automatically sets the clip end marker and loop end. If loopStart is also specified, the effective loop length may be shorter than this total length. Uses clip's time signature.",
        ),
      loop: z
        .boolean()
        .optional()
        .describe("Enable or disable looping for the clips"),
      loopStart: z
        .string()
        .optional()
        .describe(
          "Clip loop start in bar|beat position format using pipe separator (e.g., '1|1' = first beat of first bar of the clip). Relative to clip start. Uses clip's time signature.",
        ),
      notes: z
        .string()
        .optional()
        .describe(
          `Musical notation in the following BarBeat notation format. ${notationDescription}`,
        ),
      auto: z
        .enum(["play-scene", "play-clip"])
        .optional()
        .describe(
          "Automatic playback action after clip creation. 'play-scene' relaunches the entire scene for synchronization. Use this when: building multi-instrument arrangements, adding to existing grooves, or when other clips should play together. 'play-clip' plays only the created clip(s). Use this when: auditioning standalone ideas or creating clips that shouldn't trigger other instruments. Default to 'play-scene' unless you specifically need isolation. Omit for no automatic playback. Session clips only - Arrangement clips ignore this parameter. IMPORTANT: Both options put the affected track into non-arrangement-following state - it will play Session clips instead of Arrangement clips until restored via the transport tool's followingTrackIndexes parameter.",
        ),
    },
    async (args) => callLiveApi("create-clip", args),
  );
}
