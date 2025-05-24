// src/mcp-server/add-tool-update-clip.js
import { z } from "zod";
import { notationDescription } from "../notation/notation";

export function addToolUpdateClip(server, callLiveApi) {
  server.tool(
    "update-clip",
    "Updates properties of existing clips by ID. Supports bulk operations when provided with comma-separated clip IDs. All properties except ids are optional.",
    {
      ids: z.string().describe("Clip ID or comma-separated list of clip IDs to update"),

      name: z.string().optional().describe("Name for the clips"),
      color: z.string().optional().describe("Color in #RRGGBB hex format"),

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
        .describe(
          `Musical notation in the following BarBeat notation format. Replaces existing notes. ${notationDescription}`
        ),
    },
    async (args) => callLiveApi("update-clip", args)
  );
}
