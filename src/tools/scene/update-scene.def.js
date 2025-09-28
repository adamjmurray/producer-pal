import { z } from "zod";
import { defineTool } from "../shared/define-tool.js";

export const toolDefUpdateScene = defineTool("ppal-update-scene", {
  title: "Update Scene",
  description: "Updates scene(s)",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    ids: z.string().describe("comma-separated scene ID(s) to update"),
    name: z.string().optional().describe("name"),
    color: z.string().optional().describe("#RRGGBB"),
    tempo: z.number().optional().describe("BPM (-1 disables)"),
    timeSignature: z
      .string()
      .optional()
      .describe('"N/D" ("4/4") or "disabled"'),
  },
});
