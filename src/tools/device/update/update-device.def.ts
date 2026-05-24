// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { paramsInputSchema } from "#src/tools/device/update/device-params-schema.ts";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefUpdateDevice = defineTool("ppal-update-device", {
  title: "Update Device",
  description: "Update device(s), chain(s), or drum pad(s).",

  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },

  inputSchema: {
    ids: z.coerce
      .string()
      .optional()
      .describe("comma-separated ID(s) to update (device, chain, or drum pad)"),
    path: z
      .string()
      .optional()
      .describe(
        "comma-separated path(s) (e.g., 't1/d0', 't1/d0/c0', 't1/d0/pC1')",
      ),

    toPath: z
      .string()
      .optional()
      .describe("move to path (e.g., 't2', 't0/d0/c1', 't0/d0/pD1')"),
    name: z
      .string()
      .optional()
      .describe(
        "name for all, or comma-separated for each (extras keep existing name, not drum pads)",
      ),
    // Kept for potential future use
    // collapsed: z.boolean().optional().describe("collapse/expand device view"),
    params: paramsInputSchema.describe(
      "array of {name, value} (name = param name or read-device id; value in display units: enum string, note name, number)",
    ),
    // Intentionally an array (not the usual comma-separated string): action
    // arguments themselves contain commas (e.g. setModulation('x','y',0.5)), so
    // a delimited string would be ambiguous. One action string per element.
    actions: z
      .array(z.string())
      .optional()
      .describe(
        'Device-specific action(s), function-call syntax: bare name or name(args). E.g. "reverse", "warpAs(4)", "setModulation(\'Osc 1 Pos\',\'Env 2\',0.5)"',
      ),
    macroVariation: z
      .enum(["create", "load", "delete", "revert", "randomize"])
      .optional()
      .describe(
        "Rack only: create/load/delete/revert variation, or randomize macros. load/delete require macroVariationIndex. create always appends.",
      ),
    macroVariationIndex: z.coerce
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        "Rack only: variation index for load/delete operations (0-based)",
      ),
    macroCount: z.coerce
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
    color: z
      .string()
      .optional()
      .describe(
        "#RRGGBB for all, or comma-separated for each (cycles if fewer than ids; chains only)",
      ),
    chokeGroup: z.coerce
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
      "actions",
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
      name: "display name (not drum pads)",
      params: "array of {name, value} (name = param name or id)",
      color: "#RRGGBB (chains only)",
    },
  },
});
