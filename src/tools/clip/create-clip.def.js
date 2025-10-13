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
    arrangementStartTime: z
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
    startMarker: z.string().optional().describe("starting bar|beat position"),
    length: z
      .string()
      .optional()
      .describe(
        "bar:beat duration relative to startMarker. Defaults to next full bar after latest note start.",
      ),
    loop: z.boolean().optional().describe("looping?"),
    loopStart: z
      .string()
      .optional()
      .describe("bar|beat position of loop start"),
    notes: z
      .string()
      .optional()
      .describe(
        "MIDI in Producer Pal notation syntax (see Producer Pal Skills for notation details)",
      ),
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
