// src/mcp-server/add-tool-update-clip.js
import { z } from "zod";

export function addToolUpdateClip(server, callLiveApi) {
  server.tool(
    "update-clip",
    "Updates properties of existing clips by ID. Supports bulk operations when provided with comma-separated clip IDs. All properties except ids are optional. Use this tool to modify clips that already exist, including clips created by duplicating scenes or tracks. To create new clips in empty clip slots, use create-clip instead. " +
      "IMPORTANT: All timing parameters (startMarker, endMarker, loopStart, loopEnd) and note positions in the BarBeat notation are relative to the clip's start time, not the global arrangement timeline.",
    {
      ids: z.string().describe("Clip ID or comma-separated list of clip IDs to update"),
      name: z.string().optional().describe("Name for the clips"),
      color: z.string().optional().describe("Color in #RRGGBB hex format"),
      timeSignature: z.string().optional().describe('Time signature in format "n/m" (e.g. "4/4").'),
      startMarker: z
        .string()
        .optional()
        .describe(
          "Clip start marker in bar|beat position format using pipe separator (e.g., '1|1' = first beat of first bar of the clip). Relative to clip start."
        ),
      endMarker: z
        .string()
        .optional()
        .describe(
          "Clip end marker in bar|beat position format using pipe separator (e.g., '5|1' = first beat of fifth bar of the clip). Relative to clip start."
        ),
      loop: z.boolean().optional().describe("Enable or disable looping for the clips"),
      loopStart: z
        .string()
        .optional()
        .describe(
          "Clip loop start in bar|beat position format using pipe separator (e.g., '1|1' = first beat of first bar of the clip). Relative to clip start."
        ),
      loopEnd: z
        .string()
        .optional()
        .describe(
          "Clip loop end in bar|beat position format using pipe separator (e.g., '5|1' = first beat of fifth bar of the clip). Relative to clip start."
        ),
      notes: z
        .string()
        .optional()
        .describe(
          "Musical notation in BarBeat notation format. Replaces existing notes when clearExistingNotes is true, adds to existing notes when clearExistingNotes is false. For complete BarBeat notation syntax reference, see the create-clip tool description."
        ),
      clearExistingNotes: z
        .boolean()
        .default(true)
        .describe(
          "When true (the default), replaces all existing notes with the provided notes. When false, adds the provided notes to existing notes without removing any (but overlapping notes will overwrite existing notes)."
        ),
    },
    async (args) => callLiveApi("update-clip", args)
  );
}
