// device/mcp-server/add-tool-write-clip.mjs
import { z } from "zod";
import { TONE_LANG_DESCRIPTION } from "./tone-lang-description.mjs";

export function addToolWriteClip(server, callLiveApi) {
  server.tool(
    "write-clip",
    //"Creates or updates a MIDI clip at the specified track and clip slot",
    "Creates and updates a MIDI clip at the specified track and clip slot. " +
      "By default, this function will merge new notes with existing clip content unless 'deleteExistingNotes' is set to true. " +
      "This means that providing notes will add to or modify the existing clip without completely replacing it, " +
      "and you can omit notes when updating other properties like name or color",
    {
      trackIndex: z.number().int().min(0).describe("Track index (0-based)"),
      clipSlotIndex: z
        .number()
        .int()
        .min(0)
        .describe(
          "Clip slot index (0-based). This is the same as the sceneIndex of the scene containing this clip. Scenes will be auto-created if needed to insert the clip at the given slot, up to a maximum of 100 scenes."
        ),
      name: z.string().optional().describe("Name for the clip"),
      color: z.string().optional().describe("Color in #RRGGBB hex format"),
      notes: z.string().optional().describe(`Musical notation in ToneLang format. ${TONE_LANG_DESCRIPTION}`),
      start_marker: z
        .number()
        .optional()
        .describe("Start marker position in beats (the start of both looped and un-looped clips)"),
      end_marker: z.number().optional().describe("End marker position in beats (only applicable to un-looped clips)"),
      loop_start: z
        .number()
        .optional()
        .describe("Loop start position in beats (not necessarily the same as start_marker)"),
      loop_end: z.number().optional().describe("Loop end position in beats"),
      loop: z.boolean().optional().describe("Enable or disable looping for the clip"),
      autoplay: z.boolean().default(false).describe("Automatically play the clip after creating it"),
      deleteExistingNotes: z
        .boolean()
        .default(false)
        .describe("Whether to delete existing notes before adding new ones"),
    },
    async (args) => callLiveApi("write-clip", args)
  );
}
