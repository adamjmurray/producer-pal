// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { paramsInputSchema } from "#src/tools/device/update/device-params-schema.ts";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import { aliasParam } from "#src/tools/shared/tool-framework/hidden-param.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";

export const toolDefUpdateDevice = defineTool("ppal-update-device", {
  title: "Update Device",
  description: "Update device(s), chain(s), or drum pad(s).",

  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },

  inputSchema: {
    id: z.coerce
      .string()
      .optional()
      .describe(
        "ID(s) to update (device, chain, or drum pad), comma-separated for multiple",
      ),

    ids: aliasParam(z.coerce.string().optional(), {
      canonical: "id",
    }),
    path: param(z.coerce.string().optional(), {
      default:
        "comma-separated path(s) (e.g., 't1/d0', 't1/d0/c0', 't1/d0/pC1')",
      smallModel: "device path like 't0/d0' (track 0, device 0)",
    }),

    paths: aliasParam(z.coerce.string().optional(), { canonical: "path" }),

    toPath: param(z.coerce.string().optional(), {
      default:
        "move to path (e.g., 't2', 't0/d0/c1', 't0/d0/pD1'). To move a whole drum pad (chain trim, choke group and devices together), target the pad path (e.g. path 't0/d0/pC1', toPath 't0/d0/pD1') rather than its device; a pad move stays within one rack and layers onto an occupied destination rather than replacing it. Moving just a device carries its chain's trim only when the destination chain is empty and untouched, and warns otherwise",
      smallModel: "destination path to move device to",
    }),
    name: param(z.string().optional(), {
      default:
        "name for all, or comma-separated one per device, in order (blank entry = unchanged; not drum pads)",
      smallModel: "display name (not drum pads)",
    }),
    // Kept for potential future use
    // collapsed: z.boolean().optional().describe("collapse/expand device view"),
    params: param(paramsInputSchema, {
      default:
        "array of {name, value}. name = a param name, or a param id from read-device; value in display units (enum string, note name, number) — use the `unit` read-device reports for that param, or no unit at all; a param with no `unit` takes a bare number. Many params only accept a coarse ladder of values, so a request lands on the nearest one — the response reports what each param reads as afterward. For a Drum Rack target, prefix the name with a pad path, e.g. {name:'pC1/d0/sample', value:'<abs file path>'} sets pad C1's sample (auto-creates the pad's Simpler)",
      // Small mode ships no devices skills fragment, so this is the only place
      // saying a value is a display value (not a normalized 0-1) AND the only
      // place teaching the sample write. getting-help-basic promises samples on
      // Simpler and Drum Rack pads, so the how has to ship with the promise.
      smallModel:
        "array of {name, value}. name = a param name, or a param id from read-device; value in display units (enum string, note name, number). A value snaps to the nearest one the param accepts; the response reports what it reads as. Load a sample with {name:'sample', value:'<abs path>'} (there is no top-level sample arg); for a Drum Rack pad prefix it, e.g. {name:'pC1/d0/sample'}",
    }),
    // The escape hatch for the drum-pad instrument-swap guard
    // (nested-param-target.ts), and deliberately NOT taught in the skills: the
    // model learns of it from the warning, at the moment it is relevant, so it
    // never reaches for it casually. Scoped to drum pads — a `sample` write to
    // an explicit device path never creates or replaces anything, so it has no
    // guard to unlock. Declared in EVERY mode — including small-model, whose
    // `params` description teaches the sample write — because a guard whose only
    // way out is hidden from the tier that hits it would deadlock the write.
    force: z
      .boolean()
      .optional()
      .describe(
        "Only when a sample write was skipped for replacing a pad's " +
          "instrument: true replaces it anyway.",
      ),
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
        "#RRGGBB for all, or comma-separated one per chain, in order (blank entry = unchanged; chains only)",
      smallModel: "#RRGGBB (chains only)",
    }),
    gainDb: param(z.coerce.number().min(-70).max(6).optional(), {
      default:
        "chain's own gain in dB (chains only; a pad path works unless the " +
        "pad has layers, which take a layer path like 't0/d0/pC1/c1')",
      smallModel: null,
    }),
    pan: param(z.coerce.number().min(-1).max(1).optional(), {
      default:
        "chain's own pan, -1 (left) to 1 (right) (chains only; a pad path " +
        "works unless the pad has layers, which take a layer path)",
      smallModel: null,
    }),
    sendGainDb: param(z.coerce.number().min(-70).max(0).optional(), {
      default: "chain's send level in dB, requires sendReturn (chains only)",
      smallModel: null,
    }),
    sendReturn: param(z.coerce.string().optional(), {
      default:
        'rack return chain for sendGainDb: id, exact name (e.g. "a Reverb"), or letter (e.g. "a"); requires sendGainDb',
      smallModel: null,
    }),
    sends: param(
      z
        .array(
          z.object({
            return: z.coerce.string(),
            gainDb: z.coerce.number().min(-70).max(0),
          }),
        )
        .optional(),
      {
        default:
          "set several of a chain's sends at once: [{return, gainDb}], where return is a rack return chain's id, exact name, or letter — the `return`/`returnId` read-device reports. Use instead of sendGainDb + sendReturn, which set one",
        smallModel: null,
      },
    ),
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
