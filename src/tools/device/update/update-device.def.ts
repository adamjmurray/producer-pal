// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { paramsInputSchema } from "#src/tools/device/update/device-params-schema.ts";
import { sendsInputSchema } from "#src/tools/shared/sends/sends-schema.ts";
import { addressingAliases } from "#src/tools/shared/schema/addressing-params.ts";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";

export const toolDefUpdateDevice = defineTool("ppal-update-device", {
  title: "Update Device",
  description:
    "Update device(s), chain(s), or drum pad(s). Params with no list form " +
    "apply to every target.",

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

    ...addressingAliases(),
    path: param(z.coerce.string().optional(), {
      default:
        "comma-separated path(s) (e.g., 't1/d0', 't1/inst', 't1/d0/c0', 't1/d0/pC1')",
      smallModel: "device path like 't0/d0' (track 0, device 0)",
    }),

    toPath: param(z.coerce.string().optional(), {
      default:
        "move to path ('t2/d+' appends, 't2/d1' inserts at 1, 't0/d0/c1/d+'; 't0/d0/c+' appends a new chain to that rack and moves the device into it). Comma-separated, one per target. To move a whole drum pad (trim, choke group, devices), target the pad path (path 't0/d0/pC1', toPath 't0/d0/pD1'); it stays in its rack and layers onto an occupied pad. A device moved alone keeps its chain's trim only into an empty, untouched chain",
      smallModel: "destination path to move device to",
    }),
    name: param(z.string().optional(), {
      default: "name, or comma-separated one per target (not drum pads)",
      smallModel: "display name (not drum pads)",
    }),

    // Needs the remote script, which small-model mode never uses.
    preset: param(z.string().optional(), {
      default:
        "preset to load onto the device before the rest of the update (needs the Producer Pal remote script): a preset name, or a path from ppal-library; comma-separated one per target. A preset for another device, or a rack, replaces the device: its id changes and its automation is lost",
      smallModel: null,
    }),
    // Kept for potential future use
    // collapsed: z.boolean().optional().describe("collapse/expand device view"),
    params: param(paramsInputSchema, {
      default:
        "array of {name, value} or {id, value}. name = a param name; id = a param id from read-device; value in display units (enum string, note name, number) — use the `unit` read-device reports for that param, or no unit at all; a param with no `unit` takes a bare number. Many params only accept a coarse ladder of values, so a request lands on the nearest one. Every param sent comes back as one entry, in order: id and name alone when it took the value asked for, the value it reads as (plus a reason) when Live kept a different one, or `ok:false` and why nothing was written. For a Drum Rack target, prefix the name with a pad path, e.g. {name:'pC1/sample', value:'<abs file path>'} sets pad C1's sample (auto-creates the pad's Simpler)",
      // Small mode ships no devices skills fragment, so this is the only place
      // saying a value is a display value (not a normalized 0-1) AND the only
      // place teaching the sample write. getting-help-basic promises samples on
      // Simpler and Drum Rack pads, so the how has to ship with the promise.
      smallModel:
        "array of {name, value} or {id, value}. name = a param name; id = a param id from read-device; value in display units (enum string, note name, number). A value snaps to the nearest one the param accepts. Every param comes back as one entry: `{id, name}` when the value landed, the value it reads as when Live kept another, or `ok:false` and why nothing was written. Load a sample with {name:'sample', value:'<abs path>'} (there is no top-level sample arg); for a Drum Rack pad prefix it, e.g. {name:'pC1/sample'}",
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
        'Device-specific action(s), function-call syntax: bare name or name(args). E.g. "reverse", "warpAs(4)", "setModulation(\'Osc 1 Pos\',\'Env 2\',0.5)". Every action sent comes back as one entry, in order: the action alone when it ran, plus a reason when there was nothing to do, or `ok:false` and why nothing happened',
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
      default:
        "Rack only: set visible macro count (0-16). Macros come in pairs, so an odd count rounds up; the entry says where the count landed.",
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
      default: "#RRGGBB, or comma-separated one per target (chains only)",
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
        'rack return chain for sendGainDb: id, exact name (e.g. "a Reverb"), or letter (e.g. "a"), or comma-separated one per target; requires sendGainDb',
      smallModel: null,
    }),
    sends: param(sendsInputSchema, {
      default:
        "set several of a chain's sends at once: [{return, gainDb}], where return is a rack return chain's id, exact name, or letter — the `return`/`returnId` read-device reports. Use instead of sendGainDb + sendReturn, which set one",
      smallModel: null,
    }),
    chokeGroup: param(z.coerce.number().int().min(0).max(16).optional(), {
      default: "choke group 0-16, 0=none (drum chains only)",
      smallModel: null,
    }),
    mappedPitch: param(z.string().optional(), {
      default:
        "output MIDI note e.g. 'C3', or comma-separated one per target (drum chains only)",
      smallModel: null,
    }),
    wrapInRack: param(z.boolean().optional(), {
      default:
        "Wrap device(s) in a new rack (type auto-detected), in series in one chain: MIDI effects, instrument, audio effects, each kind in the order named. One instrument max; MIDI and audio effects together need an instrument",
      smallModel: null,
    }),
  },
});
