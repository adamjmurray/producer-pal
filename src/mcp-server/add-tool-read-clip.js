// src/mcp-server/add-tool-read-clip.js
import { z } from "zod";

export function addToolReadClip(server, callLiveApi) {
  server.tool(
    "read-clip",
    "Retrieves clip information including notes. Returns type ('midi' or 'audio'), name, and time-based properties for all clips. " +
      "Time-based properties (length, startMarker, loopStart, arrangementStartTime) are returned in bar|beat format (e.g. '2|3.5') using musical beats. " +
      "The 'length' field shows the effective playing duration: for looping clips, this is the loop length; for non-looping clips, this is the total playback duration. " +
      "arrangementStartTime respects the song's time signature, while other time-based properties depend on the clip's time signature (which may be different from the song). " +
      "For MIDI clips, also returns noteCount and notes as a string in BarBeat notation format. " +
      "For audio clips, notes and noteCount are null. Returns null values for all fields when the clip slot is empty. " +
      "Understanding clip state helps determine which clips are currently playing and whether tracks are following the Arrangement timeline. " +
      "Can be used to read clips by trackIndex and clipSlotIndex (for Session clips) or directly by clipId. " +
      "For complete BarBeat notation syntax reference, see the create-clip tool description.",
    {
      trackIndex: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          "Track index (0-based) for reading Session clips. Can be omitted only if clipId is provided.",
        ),
      clipSlotIndex: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
          "Clip slot index (0-based) for reading Session clips. This is the same as the sceneIndex of the scene containing this clip. Can be omitted only if clipId is provided.",
        ),
      clipId: z
        .string()
        .optional()
        .describe(
          "Clip ID to directly access any clip. Either this or trackIndex and clipSlotIndex must be provided.",
        ),
    },
    async (args) => callLiveApi("read-clip", args),
  );
}
