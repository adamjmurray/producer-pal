// device/mcp-server/add-tool-write-clip.mjs
import { z } from "zod";
import { TONE_LANG_DESCRIPTION } from "./tone-lang-description.mjs";

export function addToolWriteClip(server, callLiveApi) {
  server.tool(
    "write-clip",
    "Creates and updates a MIDI clip at the specified location. " +
      "For Session view, provide trackIndex and clipSlotIndex. " +
      "For Arranger view, provide trackIndex and arrangerStartTime. " +
      "Alternatively, provide a clipId to update an existing clip directly. " +
      "When creating a new clip, existing notes will be replaced. " +
      "When updating an existing clip by ID, new notes will be merged with existing notes.",
    {
      view: z
        .enum(["Session", "Arranger"])
        .default("Session")
        .describe("Location of the clip - either in Live's 'Session' or 'Arranger' view"),
      trackIndex: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Track index (0-based). Required when not providing clipId."),
      clipSlotIndex: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("Clip slot index (0-based). Required when view is 'Session' and not providing clipId."),
      clipId: z.string().optional().describe("Clip ID to directly update an existing clip."),
      arrangerStartTime: z
        .number()
        .optional()
        .describe(
          "Start time in beats for Arranger view clips. Required when view is 'Arranger' and not providing clipId."
        ),

      name: z.string().optional().describe("Name for the clip"),
      color: z.string().optional().describe("Color in #RRGGBB hex format"),

      startMarker: z
        .number()
        .optional()
        .describe("Start marker position in beats (the start of both looped and un-looped clips)"),
      endMarker: z.number().optional().describe("End marker position in beats (only applicable to un-looped clips)"),

      loop: z.boolean().optional().describe("Enable or disable looping for the clip"),
      loopStart: z
        .number()
        .optional()
        .describe("Loop start position in beats (not necessarily the same as startMarker)"),
      loopEnd: z.number().optional().describe("Loop end position in beats"),

      notes: z
        .string()
        .optional()
        .describe(`Musical notation in ToneLang format. Replaces existing notes. ${TONE_LANG_DESCRIPTION}`),

      trigger: z
        .boolean()
        .default(false)
        .describe(
          "Play the clip (only applicable to Session view clips). Can be used when creating new clips to automatically play them after creation."
        ),
    },
    async (args) => callLiveApi("write-clip", args)
  );
}
