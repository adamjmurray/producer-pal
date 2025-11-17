import { z } from "zod";
import { defineTool } from "../shared/define-tool.js";

export const toolDefTransformClips = defineTool("ppal-transform-clips", {
  title: "Transform Clips",
  description:
    "Shuffle arrangement positions and/or randomize parameters for multiple clips efficiently",
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
  },
  inputSchema: {
    clipIds: z
      .string()
      .optional()
      .describe("comma-separated clip IDs to transform"),
    arrangementTrackId: z
      .string()
      .optional()
      .describe(
        "track ID to query arrangement clips from (ignored if clipIds provided)",
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
    shuffleOrder: z.boolean().optional().describe("randomize clip positions"),
    // Audio clip parameters
    gainMin: z
      .number()
      .optional()
      .describe("min gain multiplier (audio clips)"),
    gainMax: z
      .number()
      .optional()
      .describe("max gain multiplier (audio clips)"),
    pitchMin: z
      .number()
      .optional()
      .describe("min pitch shift in semitones (audio clips)"),
    pitchMax: z
      .number()
      .optional()
      .describe("max pitch shift in semitones (audio clips)"),
    // MIDI clip parameters - randomized
    velocityMin: z
      .number()
      .int()
      .optional()
      .describe("min velocity offset to add (MIDI clips)"),
    velocityMax: z
      .number()
      .int()
      .optional()
      .describe("max velocity offset to add (MIDI clips)"),
    transposeMin: z
      .number()
      .int()
      .optional()
      .describe("min transpose in semitones (MIDI clips)"),
    transposeMax: z
      .number()
      .int()
      .optional()
      .describe("max transpose in semitones (MIDI clips)"),
    durationMin: z
      .number()
      .optional()
      .describe("min duration multiplier (MIDI clips)"),
    durationMax: z
      .number()
      .optional()
      .describe("max duration multiplier (MIDI clips)"),
    // MIDI clip properties - set to specific values
    velocityRange: z
      .number()
      .int()
      .optional()
      .describe("velocity deviation offset to add (MIDI clips, -127 to +127)"),
    probability: z
      .number()
      .optional()
      .describe("probability offset to add (MIDI clips, -1.0 to +1.0)"),
    seed: z.number().int().optional().describe("RNG seed for reproducibility"),
  },
});
