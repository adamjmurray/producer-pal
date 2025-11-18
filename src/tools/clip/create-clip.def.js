import { z } from "zod";
import { defineTool } from "../shared/define-tool.js";

export const toolDefCreateClip = defineTool("ppal-create-clip", {
  title: "Create Clip",
  description: "Create MIDI clip(s)",
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
    sceneIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("0-based scene index for session clips"),
    arrangementStart: z
      .string()
      .optional()
      .describe("start bar|beat position for arrangement clips"),
    count: z
      .number()
      .int()
      .min(1)
      .default(1)
      .describe(
        "number of copies (session fills successive slots, arrangement places back-to-back)",
      ),
    name: z.string().optional().describe("cip name (appended with counts > 1)"),
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
        "MIDI in bar|beat notation: [bar|beat] [v0-127] [t<dur>] [p0-1] note(s)",
      ),
    modulations: z
      .string()
      .optional()
      .describe("modulation expressions (parameter: expression per line)"),
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
});
