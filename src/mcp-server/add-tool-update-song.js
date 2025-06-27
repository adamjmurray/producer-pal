// src/mcp-server/add-tool-update-song.js
import { z } from "zod";
import { VALID_PITCH_CLASS_NAMES } from "../notation/pitch-class-name-to-number.js";
import { VALID_SCALE_NAMES } from "../tools/update-song.js";

export function addToolUpdateSong(server, callLiveApi) {
  server.tool(
    "update-song",
    "Updates song properties in the Live Set including view state, tempo, time signature, and scale. " +
      "Note: changes to scale properties affect currently selected clips and set defaults for new clips.",
    {
      tempo: z
        .number()
        .min(20)
        .max(999)
        .optional()
        .describe("Set tempo in BPM (20.0-999.0)"),
      timeSignature: z
        .string()
        .optional()
        .describe('Time signature in format "n/m" (e.g. "4/4")'),
      view: z
        .enum(["session", "arrangement"])
        .optional()
        .describe("Switch between Session and Arrangement views"),
      scaleRoot: z
        .enum(VALID_PITCH_CLASS_NAMES)
        .optional()
        .describe(
          "Scale root note (C, C#, Db, D, D#, Eb, E, F, F#, Gb, G, G#, Ab, A, A#, Bb, B) - applies to currently selected clips and sets the default for new clips",
        ),
      scale: z
        .enum(VALID_SCALE_NAMES)
        .optional()
        .describe(
          "Scale name - applies to currently selected clips and sets the default for new clips",
        ),
      scaleEnabled: z
        .boolean()
        .optional()
        .describe(
          "Enable/disable scale - applies to currently selected clips and sets the default for new clips",
        ),
      deselectAllClips: z
        .boolean()
        .optional()
        .describe(
          "Clear all clip selections before setting scale properties (ensures predictable behavior)",
        ),
    },
    async (args) => callLiveApi("update-song", args),
  );
}
