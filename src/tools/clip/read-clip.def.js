import { z } from "zod";
import { defineTool } from "../shared/define-tool.js";

export const toolDefReadClip = defineTool("ppal-read-clip", {
  title: "Read Clip",
  description: `Retrieves clip information including notes.
Time formats: bar|beat for positions (1|1 = first beat), bar:beat for durations (4:0 = 4 bars). Beats can be fractional.
Clip MIDI notes use bar|beat notation: [bar|beat] [v0-127] [t<dur>] [p0-1] notes."
  `,
  // Returns type ('midi' or 'audio'), name, and time-based properties for all clips. " +
  // "Time-based properties (length, startMarker, loopStart, arrangementStartTime) are returned in bar|beat format (e.g. '2|3.5') using musical beats. " +
  // "The 'length' field shows the effective playing duration: for looping clips, this is the loop length; for non-looping clips, this is the total playback duration. " +
  // "arrangementStartTime respects the song's time signature, while other time-based properties depend on the clip's time signature (which may be different from the song). " +
  // "For MIDI clips, also returns noteCount and notes as a string in bar|beat notation format. " +
  // "For audio clips, notes and noteCount are null. Returns null values for all fields when the clip slot is empty. " +
  // "Understanding clip state helps determine which clips are currently playing and whether tracks are following the Arrangement timeline. " +
  // "Can be used to read clips by trackIndex and clipSlotIndex (for Session clips) or directly by clipId. " +
  // "For complete bar|beat notation syntax reference, see the create-clip tool description.",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema: {
    trackIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        "Track index (0-based), used with clipSlotIndex for reading Session clips.",
      ),
    clipSlotIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        "Clip slot index (0-based), used with trackIndex for reading Session clips. This is the sceneIndex of the containing scene.",
      ),
    clipId: z
      .string()
      .optional()
      .describe(
        "Clip ID to directly access any clip without trackIndex + clipSlotIndex.",
      ),
    include: z
      .array(z.enum(["*", "clip-notes"]))
      .default(["clip-notes"])
      .describe("Data to include. Pass empty array to omit clip notes."),
  },
});
