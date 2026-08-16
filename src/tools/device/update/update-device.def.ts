// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { paramsInputSchema } from "#src/tools/device/update/device-params-schema.ts";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";

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
    path: param(z.string().optional(), {
      default:
        "comma-separated path(s) (e.g., 't1/d0', 't1/d0/c0', 't1/d0/pC1')",
      smallModel: "device path like 't0/d0' (track 0, device 0)",
    }),

    toPath: param(z.string().optional(), {
      default:
        "move to path (e.g., 't2', 't0/d0/c1', 't0/d0/pD1'). To move a whole drum pad (chain trim, choke group and devices together), target the pad path (e.g. path 't0/d0/pC1', toPath 't0/d0/pD1') rather than its device",
      smallModel: "destination path to move device to",
    }),
    name: param(z.string().optional(), {
      default:
        "name for all, or comma-separated for each (extras keep existing name, not drum pads)",
      smallModel: "display name (not drum pads)",
    }),
    // Kept for potential future use
    // collapsed: z.boolean().optional().describe("collapse/expand device view"),
    params: param(paramsInputSchema, {
      default:
        "array of {name, value}. name = param name or read-device id; value in display units (enum string, note name, number). For a Drum Rack target, prefix the name with a pad path, e.g. {name:'pC1/d0/sample', value:'<abs file path>'} sets pad C1's sample (auto-creates the pad's Simpler)",
      // Small mode ships no devices skills fragment, so this is the only place
      // saying a value is a display value (not a normalized 0-1) AND the only
      // place teaching the sample write. getting-help-basic promises samples on
      // Simpler and Drum Rack pads, so the how has to ship with the promise.
      smallModel:
        "array of {name, value}. name = param name or id; value in display units (enum string, note name, number). Load a sample with {name:'sample', value:'<abs path>'} (there is no top-level sample arg); for a Drum Rack pad prefix it, e.g. {name:'pC1/d0/sample'}",
    }),
    // Intentionally an array (not the usual comma-separated string): action
    // arguments themselves contain commas (e.g. setModulation('x','y',0.5)), so
    // a delimited string would be ambiguous. One action string per element.
    actions: param(z.array(z.string()).optional(), {
      default:
        'Device-specific action(s), function-call syntax: bare name or name(args). E.g. "reverse", "warpAs(4)", "setModulation(\'Osc 1 Pos\',\'Env 2\',0.5)"',
      smallModel: null,
    }),
    macroVariation: param(
      z.enum(["create", "load", "delete", "revert", "randomize"]).optional(),
      {
        default:
          "Rack only: create/load/delete/revert variation, or randomize macros. load/delete require macroVariationIndex. create always appends.",
        smallModel: null,
      },
    ),
    macroVariationIndex: param(z.coerce.number().int().min(0).optional(), {
      default:
        "Rack only: variation index for load/delete operations (0-based)",
      smallModel: null,
    }),
    macroCount: param(z.coerce.number().int().min(0).max(16).optional(), {
      default: "Rack only: set visible macro count (0-16)",
      smallModel: null,
    }),
    abCompare: param(z.enum(["a", "b", "save"]).optional(), {
      default:
        "AB Compare: switch to 'a' or 'b' preset, or 'save' current to other slot",
      smallModel: null,
    }),

    mute: z.boolean().optional().describe("mute state (chains/drum pads only)"),
    solo: z.boolean().optional().describe("solo state (chains/drum pads only)"),
    color: param(z.string().optional(), {
      default:
        "#RRGGBB for all, or comma-separated for each (cycles if fewer than ids; chains only)",
      smallModel: "#RRGGBB (chains only)",
    }),
    gainDb: param(z.coerce.number().min(-70).max(6).optional(), {
      default: "chain's own gain in dB (chains/drum pads only)",
      smallModel: null,
    }),
    pan: param(z.coerce.number().min(-1).max(1).optional(), {
      default:
        "chain's own pan, -1 (left) to 1 (right) (chains/drum pads only)",
      smallModel: null,
    }),
    chokeGroup: param(z.coerce.number().int().min(0).max(16).optional(), {
      default: "choke group 0-16, 0=none (drum chains only)",
      smallModel: null,
    }),
    mappedPitch: param(z.string().optional(), {
      default: "output MIDI note e.g. 'C3' (drum chains only)",
      smallModel: null,
    }),
    wrapInRack: param(z.boolean().optional(), {
      default: "Wrap device(s) in a new rack (auto-detects type from device)",
      smallModel: null,
    }),
  },
});
