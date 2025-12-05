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
    params: z.string().optional().describe('JSON: {"paramId": value, ...}'),
    paramDisplayValues: z
      .string()
      .optional()
      .describe('JSON: {"paramId": "displayStr", ...}'),
  },
});
