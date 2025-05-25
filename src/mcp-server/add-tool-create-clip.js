// src/mcp-server/add-tool-create-clip.js
import { z } from "zod";
import { notationDescription } from "../notation/notation";
import { MAX_AUTO_CREATED_SCENES } from "../tools/constants";

export function addToolCreateClip(server, callLiveApi) {
  server.tool(
    "create-clip",
    "Creates MIDI clips in Session or Arranger view. " +
      "For Session view, provide trackIndex and clipSlotIndex. " +
      "For Arranger view, provide trackIndex and arrangerStartTime. " +
      "When count > 1, Session clips are created in successive clip slots, and Arranger clips are placed back-to-back. " +
      `Scenes will be auto-created if needed to insert clips at the given index, up to a maximum of ${MAX_AUTO_CREATED_SCENES} scenes (sceneIndex == clipSlotIndex).`,
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
        .number()
        .optional()
        .describe("Start time in beats for Arranger view clips. Required when view is 'Arranger'."),
      count: z.number().int().min(1).default(1).describe("Number of clips to create (default: 1)"),

      name: z.string().optional().describe("Base name for the clips (auto-increments for count > 1)"),
      color: z.string().optional().describe("Color in #RRGGBB hex format"),

      timeSignature: z
        .string()
        .optional()
        .describe('Time signature in format "n/m" (e.g. "4/4"). Defaults to the song\'s time signature for new clips.'),

      startMarker: z
        .number()
        .optional()
        .describe("Start marker position in beats (the start of both looped and un-looped clips)"),
      endMarker: z.number().optional().describe("End marker position in beats (only applicable to un-looped clips)"),

      loop: z.boolean().optional().describe("Enable or disable looping for the clips"),
      loopStart: z
        .number()
        .optional()
        .describe("Loop start position in beats (not necessarily the same as startMarker)"),
      loopEnd: z.number().optional().describe("Loop end position in beats"),

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
