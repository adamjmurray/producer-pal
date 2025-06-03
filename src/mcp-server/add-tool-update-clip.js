// src/mcp-server/add-tool-update-clip.js
import { z } from "zod";

export function addToolUpdateClip(server, callLiveApi) {
  server.tool(
    "update-clip",
    "Updates properties of existing clips by ID. Supports bulk operations when provided with comma-separated clip IDs. All properties except ids are optional. Use this tool to modify clips that already exist, including clips created by duplicating scenes or tracks. To create new clips in empty clip slots, use create-clip instead. " +
      "IMPORTANT: All timing parameters (startMarker, length) and note positions in the BarBeat notation are relative to the clip's start time, not the global arrangement timeline.",
    {
      ids: z.string().describe("Clip ID or comma-separated list of clip IDs to update"),
      name: z.string().optional().describe("Name for the clips"),
      color: z.string().optional().describe("Color in #RRGGBB hex format"),
      timeSignature: z.string().optional().describe('Time signature in format "n/m" (e.g. "4/4").'),
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
      loop: z.boolean().optional().describe("Enable or disable looping for the clips"),
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
          "Musical notation in BarBeat notation format. Replaces existing notes when clearExistingNotes is true, adds to existing notes when clearExistingNotes is false. For complete BarBeat notation syntax reference, see the create-clip tool description.",
        ),
      clearExistingNotes: z
        .boolean()
        .default(true)
        .describe(
          "When true (the default), replaces all existing notes - use for complete rewrites. When false, adds to existing notes - use for incremental changes like 'add hi-hats' or 'adjust snare velocity'. Overlapping notes will overwrite existing notes at the same pitch and time.",
        ),
    },
    async (args) => callLiveApi("update-clip", args),
  );
}
