import { z } from "zod";
import { defineTool } from "../shared/define-tool.js";

export const toolDefCreateScene = defineTool("ppal-create-scene", {
  title: "Create Scene",
  description: "Create empty scene(s) or capture playing session clips",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    sceneIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        "0-based index for new scene(s), shifts existing scenes. Required when capture=false, optional when capture=true",
      ),
    count: z.number().int().min(1).default(1).describe("number to create"),
    capture: z
      .boolean()
      .default(false)
      .describe("copy playing session clips instead of creating empty?"),
    name: z.string().optional().describe("name (appended with counts > 1)"),
    color: z.string().optional().describe("#RRGGBB"),
    tempo: z.number().optional().describe("BPM (-1 disables when capturing)"),
    timeSignature: z
      .string()
      .optional()
      .describe('N/D (4/4) or "disabled" when capturing'),
    switchView: z
      .boolean()
      .optional()
      .default(false)
      .describe("show session view?"),
  },
});
