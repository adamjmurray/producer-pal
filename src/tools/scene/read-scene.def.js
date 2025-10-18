import { z } from "zod";
import { defineTool } from "../shared/define-tool.js";

export const toolDefReadScene = defineTool("ppal-read-scene", {
  title: "Read Scene",
  description: "Read scene settings, clips",
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },
  inputSchema: {
    sceneId: z.string().optional().describe("provide this or sceneIndex"),
    sceneIndex: z.number().int().min(0).optional().describe("0-based index"),
    include: z
      .array(z.enum(["*", "clips", "clip-notes", "color"]))
      .default([])
      .describe('data: clips, clip-notes, "*" for all'),
  },
});
