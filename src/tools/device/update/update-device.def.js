import { z } from "zod";
import { defineTool } from "../../shared/tool-framework/define-tool.js";

export const toolDefUpdateDevice = defineTool("ppal-update-device", {
  title: "Update Device",
  description: "Update device(s), chain(s), or drum pad(s)",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    ids: z
      .string()
      .describe("comma-separated ID(s) to update (device, chain, or drum pad)"),
    name: z.string().optional().describe("display name"),
    collapsed: z.boolean().optional().describe("collapse/expand device view"),
    params: z
      .string()
      .optional()
      .describe(
        'JSON: {"paramId": value}. Values in display units: enum string, note name, pan -1 to 1, or number',
      ),
    macroVariation: z
      .enum(["create", "load", "delete", "revert", "randomize"])
      .optional()
      .describe(
        "Rack only: create/load/delete/revert variation, or randomize macros. load/delete require macroVariationIndex. create always appends.",
      ),
    macroVariationIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        "Rack only: variation index for load/delete operations (0-based)",
      ),
    macroCount: z
      .number()
      .int()
      .min(0)
      .max(16)
      .optional()
      .describe("Rack only: set visible macro count (0-16)"),
    abCompare: z
      .enum(["a", "b", "save"])
      .optional()
      .describe(
        "AB Compare: switch to 'a' or 'b' preset, or 'save' current to other slot",
      ),
    mute: z.boolean().optional().describe("mute state (chains/drum pads only)"),
    solo: z.boolean().optional().describe("solo state (chains/drum pads only)"),
    color: z.string().optional().describe("color #RRGGBB (chains only)"),
    chokeGroup: z
      .number()
      .int()
      .min(0)
      .max(16)
      .optional()
      .describe("choke group 0-16, 0=none (drum chains only)"),
    mappedPitch: z
      .string()
      .optional()
      .describe("output MIDI note e.g. 'C3' (drum chains only)"),
  },
});
