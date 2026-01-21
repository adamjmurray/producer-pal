import { z } from "zod";
import { MAX_SLICES } from "#src/tools/constants.ts";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefTransformClips = defineTool("ppal-transform-clips", {
  title: "Transform Clips",

  description:
    "Slice clips into repeating segments, shuffle arrangement positions, and/or randomize parameters for multiple clips efficiently",

  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
  },

  inputSchema: {
    clipIds: z.coerce
      .string()
      .optional()
      .describe("comma-separated clip IDs to transform"),
    arrangementTrackIndex: z.coerce
      .string()
      .optional()
      .describe(
        "track index(es) to query arrangement clips from, comma-separated for multiple (ignored if clipIds provided)",
      ),
    arrangementStart: z
      .string()
      .optional()
      .describe(
        "bar|beat position (e.g., '1|1.0') for arrangement range start",
      ),
    arrangementLength: z
      .string()
      .optional()
      .describe(
        "bar:beat duration (e.g., '4:0.0') for arrangement range length",
      ),
    slice: z
      .string()
      .optional()
      .describe(
        `bar:beat slice size (e.g., '1:0.0') - tiles clips into repeating segments (max ${MAX_SLICES} slices total)`,
      ),
    shuffleOrder: z.boolean().optional().describe("randomize clip positions"),

    // Audio clip parameters
    gainDbMin: z
      .number()
      .min(-24)
      .max(24)
      .optional()
      .describe("min gain offset in dB to add (audio clips)"),
    gainDbMax: z
      .number()
      .min(-24)
      .max(24)
      .optional()
      .describe("max gain offset in dB to add (audio clips)"),

    // Transpose parameters (audio and MIDI clips)
    transposeMin: z
      .number()
      .min(-128)
      .max(128)
      .optional()
      .describe("min transpose in semitones (audio/MIDI clips)"),
    transposeMax: z
      .number()
      .min(-128)
      .max(128)
      .optional()
      .describe("max transpose in semitones (audio/MIDI clips)"),
    transposeValues: z
      .string()
      .optional()
      .describe(
        "comma-separated semitone values to randomly pick from (audio/MIDI clips, ignores transposeMin/transposeMax)",
      ),

    // MIDI clip parameters - randomized
    velocityMin: z
      .number()
      .int()
      .min(-127)
      .max(127)
      .optional()
      .describe("min velocity offset to add (MIDI clips)"),
    velocityMax: z
      .number()
      .int()
      .min(-127)
      .max(127)
      .optional()
      .describe("max velocity offset to add (MIDI clips)"),
    durationMin: z
      .number()
      .min(0.01)
      .max(100)
      .optional()
      .describe("min duration multiplier (MIDI clips)"),
    durationMax: z
      .number()
      .min(0.01)
      .max(100)
      .optional()
      .describe("max duration multiplier (MIDI clips)"),

    // MIDI clip properties - set to specific values
    velocityRange: z
      .number()
      .int()
      .min(-127)
      .max(127)
      .optional()
      .describe("velocity deviation offset to add (MIDI clips)"),
    probability: z
      .number()
      .min(-1.0)
      .max(1.0)
      .optional()
      .describe("probability offset to add (MIDI clips)"),
    seed: z.number().int().optional().describe("RNG seed for reproducibility"),
  },

  smallModelModeConfig: {
    toolDescription: "Randomize velocity and probability for MIDI clips",
    excludeParams: [
      "slice",
      "shuffleOrder",
      "transposeMin",
      "transposeMax",
      "transposeValues",
      "gainDbMin",
      "gainDbMax",
      "durationMin",
      "durationMax",
      "seed",
    ],
  },
});
