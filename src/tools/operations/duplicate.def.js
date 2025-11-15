import { z } from "zod";
import { defineTool } from "../shared/define-tool.js";

export const toolDefDuplicate = defineTool("ppal-duplicate", {
  title: "Duplicate Track/Scene/Clip",
  description: "Duplicate an object",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    type: z
      .enum(["track", "scene", "clip"])
      .describe("type of object to duplicate"),
    id: z.string().describe("object to duplicate"),
    count: z.number().int().min(1).default(1).describe("number of copies"),
    destination: z
      .enum(["session", "arrangement"])
      .optional()
      .describe("scenes and clips can be copied to the session or arrangement"),
    arrangementStart: z
      .string()
      .optional()
      .describe("starting bar|beat position in arrangement"),
    arrangementLength: z
      .string()
      .optional()
      .describe(
        "duration (beats or bar:beat) in arrangement, auto-fills with loops",
      ),
    name: z.string().optional().describe("name (appended with counts > 1)"),
    withoutClips: z.boolean().default(false).describe("exclude clips?"),
    withoutDevices: z.boolean().default(false).describe("exclude devices?"),
    routeToSource: z
      .boolean()
      .optional()
      .describe(
        "route new track to source's instrument? (for MIDI layering/polyrhythms)",
      ),
    switchView: z
      .boolean()
      .optional()
      .default(false)
      .describe("auto-switch view?"),
    toTrackIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("destination track index (for session clips)"),
    toSceneIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("destination scene index (for session clips)"),
  },
});
