import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefCreateClip = defineTool("ppal-create-clip", {
  title: "Create Clip",
  description:
    "Create MIDI or audio clip(s).\n" +
    "For audio: use sampleFile (absolute path), otherwise omit sampleFile to create a MIDI clip. " +
    "Cannot use both notes and sampleFile.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },

  inputSchema: {
    view: z.enum(["session", "arrangement"]).describe("location of the clip"),

    trackIndex: z
      .number()
      .int()
      .min(0)
      .describe("0-based track index for session clips"),

    sceneIndex: z.coerce
      .string()
      .optional()
      .describe(
        "scene index(es), comma-separated for multiple (e.g., '0' or '0,2,5')",
      ),

    arrangementStart: z.coerce
      .string()
      .optional()
      .describe(
        "bar|beat position(s), comma-separated for multiple (e.g., '1|1' or '1|1,2|1,3|3')",
      ),

    name: z
      .string()
      .optional()
      .describe("clip name (numbered suffix for multiple clips)"),

    color: z.string().optional().describe("#RRGGBB"),

    timeSignature: z
      .string()
      .optional()
      .describe(`N/D (4/4), default: global time signature)`),

    start: z
      .string()
      .optional()
      .describe("bar|beat position where loop/clip region begins"),

    length: z
      .string()
      .optional()
      .describe(
        "duration in bar:beat format. When looping, this is the loop duration (from start to end). When not looping, this is the clip duration (from start to end). end = start + length. Defaults to next full bar after latest note start.",
      ),

    looping: z.boolean().optional().describe("enable looping for the clip"),

    firstStart: z
      .string()
      .optional()
      .describe(
        "bar|beat position for initial playback start (only for looping clips, only needed when different from start)",
      ),

    notes: z
      .string()
      .optional()
      .describe(
        "MIDI in bar|beat notation: [bar|beat] [v0-127] [t<dur>] [p0-1] note(s) - MIDI clips only",
      ),

    modulations: z
      .string()
      .optional()
      .describe("modulation expressions (parameter: expression per line)"),

    sampleFile: z
      .string()
      .optional()
      .describe("absolute path to audio file - audio clips only"),

    auto: z
      .enum(["play-scene", "play-clip"])
      .optional()
      .describe("auto-play session clips (play-scene keeps scene in sync)"),

    switchView: z
      .boolean()
      .optional()
      .default(false)
      .describe("auto-switch view?"),
  },

  smallModelModeConfig: {
    excludeParams: ["modulations"],
  },
});
