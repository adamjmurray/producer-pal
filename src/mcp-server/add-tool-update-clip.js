// src/mcp-server/add-tool-update-clip.js
import { z } from "zod";
import { notationDescription } from "../notation/notation";

export function addToolUpdateClip(server, callLiveApi) {
  server.tool(
    "update-clip",
    "Updates properties of existing clips by ID. Supports bulk operations when provided with comma-separated clip IDs. All properties except ids are optional. Use this tool to modify clips that already exist, including clips created by duplicating scenes or tracks. To create new clips in empty clip slots, use create-clip instead.",
    {
      ids: z.string().describe("Clip ID or comma-separated list of clip IDs to update"),

      name: z.string().optional().describe("Name for the clips"),
      color: z.string().optional().describe("Color in #RRGGBB hex format"),

      timeSignature: z.string().optional().describe('Time signature in format "n/m" (e.g. "4/4").'),

      startMarker: z
        .string()
        .optional()
        .describe("Start marker position in bar|beat format (the start of both looped and un-looped clips)"),
      endMarker: z
        .string()
        .optional()
        .describe("End marker position in bar|beat format (only applicable to un-looped clips)"),

      loop: z.boolean().optional().describe("Enable or disable looping for the clips"),
      loopStart: z
        .string()
        .optional()
        .describe("Loop start position in bar|beat format (not necessarily the same as startMarker)"),
      loopEnd: z.string().optional().describe("Loop end position in bar|beat format"),

      notes: z
        .string()
        .optional()
        .describe(
          `Musical notation in the following BarBeat notation format. Replaces existing notes when clearExistingNotes is true, adds to existing notes when clearExistingNotes is false. ${notationDescription}`
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
