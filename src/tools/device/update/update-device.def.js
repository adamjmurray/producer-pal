import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.js";

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
      .optional()
      .describe("comma-separated ID(s) to update (device, chain, or drum pad)"),
    path: z
      .string()
      .optional()
      .describe(
        "Comma-separated device/chain/drum-pad path(s): t=track, rt=return, mt=master, d=device, c=chain, rc=return chain, p=drum pad. " +
          "E.g., 't1/d0' (device), 't1/d0/c0,t1/d0/c1' (chains), 't1/d0/pC1' (drum pad)",
      ),
    toPath: z
      .string()
      .optional()
      .describe(
        "Move device or drum chain to path. Devices: 't2' (track), 't0/d0/c1' (chain). " +
          "Drum chains: move to pad via 't0/d0/pD1'. Pad path (pC1) moves all chains, chain path (pC1/c0) moves one.",
      ),
    name: z.string().optional().describe("display name (not drum pads)"),
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
    wrapInRack: z
      .boolean()
      .optional()
      .describe("Wrap device(s) in a new rack (auto-detects type from device)"),
  },
  smallModelModeConfig: {
    excludeParams: [
      "macroVariation",
      "macroVariationIndex",
      "macroCount",
      "abCompare",
      "chokeGroup",
      "mappedPitch",
      "wrapInRack",
    ],
    descriptionOverrides: {
      path: "device path like 't0/d0' (track 0, device 0)",
      toPath: "destination path to move device to",
    },
  },
});
