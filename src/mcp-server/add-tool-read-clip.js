// src/mcp-server/add-tool-read-clip.js
import { z } from "zod";
import { notationDescription } from "../notation/notation";

export function addToolReadClip(server, callLiveApi) {
  server.tool(
    "read-clip",
    "Retrieves clip information including notes. Returns type ('midi' or 'audio'), name, and time-based properties for all clips. " +
      "Time-based properties (length, startMarker, endMarker, loopStart, loopEnd, arrangerStartTime) are returned in bar:beat format (e.g. '2:3.5') using musical beats. arrangerStartTime respects the song's time signature, while the other time-based properties depend on the clip's time signature (which may be different from the song). " +
      "For MIDI clips, also returns noteCount and notes as a string in the BarBeat notation format explained below. " +
      "For audio clips, notes and noteCount are null. Returns null values for all fields when the clip slot is empty.\n" +
      "Can be used to read clips by trackIndex and clipSlotIndex (for Session view) or directly by clipId.\n" +
      notationDescription,
    {
      trackIndex: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Track index (0-based) for reading Session view clips. Can be omitted only if clipId is provided."),
      clipSlotIndex: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          "Clip slot index (0-based) for reading Session view clips. This is the same as the sceneIndex of the scene containing this clip. Can be omitted only if clipId is provided."
        ),
      clipId: z
        .string()
        .optional()
        .describe("Clip ID to directly access any clip. Either this or trackIndex and clipSlotIndex must be provided."),
    },
    async (args) => callLiveApi("read-clip", args)
  );
}
