import { z } from "zod";
import { VALID_PITCH_CLASS_NAMES } from "../../notation/pitch-class-name-to-number.js";
import { VALID_SCALE_NAMES } from "../constants.js";
import { defineTool } from "../shared/define-tool.js";

export const toolDefUpdateSong = defineTool("ppal-update-song", {
  title: "Update Live Set",
  description:
    "Updates song properties in the Live Set including tempo, time signature, and scale.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
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
  },
});
