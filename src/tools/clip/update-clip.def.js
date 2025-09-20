import { z } from "zod";
import { defineTool } from "../shared/define-tool.js";

const description = `Updates properties of existing clips.
Time formats: bar|beat for positions (1|1 = first beat), bar:beat for durations (4:0 = 4 bars). Beats can be fractional.
Clip MIDI notes use bar|beat notation: [bar|beat] [v0-127] [t<dur>] [p0-1] notes.`;
// Use this tool to modify clips that already exist, including clips created by duplicating scenes or tracks. To create new clips in empty clip slots, use create-clip instead.
// All properties except ids are optional.
// Supports bulk operations when provided with comma-separated clip IDs.

// IMPORTANT: All timing parameters (startMarker, length) and note positions in the bar|beat notation are relative to the clip's start time, not the global arrangement timeline.

// TIME FORMATS: Uses bar|beat for positions, bar:beat for durations. See create-clip for details.

// RANGE TIP: To ensure compatibility with most instruments, a generally safe default pitch range is C1-C5. Only use extreme ranges when you're certain the instrument supports them or the user asks for it.`;

export const toolDefUpdateClip = defineTool("ppal-update-clip", {
  title: "Update Clip",
  description,
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    ids: z
      .string()
      .describe("Clip ID or comma-separated list of clip IDs to update"),
    name: z.string().optional().describe("Name for the clip"),
    color: z.string().optional().describe("Hex color (#RRGGBB)"),
    timeSignature: z
      .string()
      .optional()
      .describe('Time signature in format "n/m"'),
    startMarker: z
      .string()
      .optional()
      .describe("Clip start marker position (bar|beat)"),
    length: z
      .string()
      .optional()
      .describe(
        "Clip duration (bar:beat), sets end/loop markers. Clip length defaults to fit the notes.",
      ),
    loop: z.boolean().optional().describe("Enable or disable looping"),
    loopStart: z.string().optional().describe("Loop start position (bar|beat)"),
    notes: z
      .string()
      .optional()
      .describe(
        `The MIDI notes in the clip expressed as bar|beat notation:
[bar|beat] [v0-127] [t<dur>] [p0-1] notes (e.g. 1|2.5 v100 C3 = C3 at bar 1, beat 2.5).
Deletion: with noteUpdateMode:"merge", v0 deletes notes at exact position/pitch. Call ppal-read-clip to get precise positions.`,
      ),
    noteUpdateMode: z
      .enum(["replace", "merge"])
      .describe(
        "REQUIRED: How to handle existing notes. " +
          "'replace' = Delete all existing notes first (fresh start). " +
          "'merge' = Add to existing notes. Overlapping notes will be replaced. Use v0 velocity to delete specific notes at exact positions.",
      ),
  },
});
