import { z } from "zod";
import { defineTool } from "../../shared/tool-framework/define-tool.js";

export const toolDefUpdateDevice = defineTool("ppal-update-device", {
  title: "Update Device",
  description: "Update device(s)",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    ids: z.string().describe("comma-separated device ID(s) to update"),
    name: z.string().optional().describe("device display name"),
    collapsed: z.boolean().optional().describe("collapse/expand device view"),
    params: z
      .string()
      .optional()
      .describe(
        'JSON: {"paramId": value}. Values in display units: enum string, note name, pan -1 to 1, or number',
      ),
    macroVariation: z
      .enum(["store", "recall", "recall-last", "delete", "randomize"])
      .optional()
      .describe(
        "Rack only: store/recall/recall-last/delete selected variation, or randomize macros",
      ),
    macroVariationIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe("Rack only: select variation by index (0-based)"),
    macroCount: z
      .number()
      .int()
      .min(0)
      .max(16)
      .optional()
      .describe("Rack only: set visible macro count (0-16)"),
  },
});
