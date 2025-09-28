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
    arrangementStartTime: z
      .string()
      .optional()
      .describe("starting bar|beat position in arrangement"),
    arrangementLength: z
      .string()
      .optional()
      .describe("bar:beat duration in arrangement, auto-fills with loops"),
    name: z.string().optional().describe("name (appended with counts > 1)"),
    withoutClips: z.boolean().default(false).describe("exclude clips?"),
    withoutDevices: z.boolean().default(false).describe("exclude devices?"),
    routeToSource: z
      .boolean()
      .optional()
      .describe(
        "Route new track to source's instrument? (for MIDI layering/polyrhythms)",
      ),
    switchView: z
      .boolean()
      .optional()
      .default(false)
      .describe("Auto-switch view?"),
  },
});
