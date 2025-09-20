import { z } from "zod";
import { defineTool } from "../shared/define-tool.js";

const description = `Updates properties of existing clips.
Use this tool to modify clips that already exist, including clips created by duplicating scenes or tracks. To create new clips in empty clip slots, use create-clip instead. 
All properties except ids are optional.
Supports bulk operations when provided with comma-separated clip IDs.

IMPORTANT: All timing parameters (startMarker, length) and note positions in the bar|beat notation are relative to the clip's start time, not the global arrangement timeline.

TIME FORMATS: Uses bar|beat for positions, bar:beat for durations. See create-clip for details.

RANGE TIP: To ensure compatibility with most instruments, a generally safe default pitch range is C1-C5. Only use extreme ranges when you're certain the instrument supports them or the user asks for it.`;

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
    name: z.string().optional().describe("Name for the clips"),
    color: z.string().optional().describe("Color in #RRGGBB hex format"),
    timeSignature: z
      .string()
      .optional()
      .describe('Time signature in format "n/m" (e.g. "4/4").'),
    startMarker: z
      .string()
      .optional()
      .describe(
        "Clip start marker in bar|beat position format using pipe separator (e.g., '1|1' = first beat of first bar of the clip). Relative to clip start.",
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
        "Clip loop start in bar|beat position format using pipe separator (e.g., '1|1' = first beat of first bar of the clip). Relative to clip start.",
      ),
    notes: z
      .string()
      .optional()
      .describe(
        "Musical notation in bar|beat notation format. Replaces existing notes when noteUpdateMode is 'replace', adds to existing notes when noteUpdateMode is 'merge'. ARRANGEMENT TIP: Professional producers often improve tracks by removing notes rather than adding them. Consider whether additional density truly serves the music. DELETION FEATURE: Use 'v0' (velocity 0) with noteUpdateMode: 'merge' to delete existing notes at exact bar|beat position and pitch (e.g., '2|1.5 v0 Gb1' deletes hi-hat at bar 2, beat 1.5). CRITICAL: Use read-clip first to identify exact positions - guessing will fail due to precise timing/pitch requirements. For complete bar|beat notation syntax reference, see the create-clip tool description.",
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
