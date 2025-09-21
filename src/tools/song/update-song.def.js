import { z } from "zod";
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
    scale: z
      .string()
      .optional()
      .describe(
        `Scale in format 'Root ScaleName' (e.g., 'C Major', 'F# Minor', 'Bb Dorian'). Empty string string disables the scale.`,
      ),
  },
});
