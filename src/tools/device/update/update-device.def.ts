// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { paramsInputSchema } from "#src/tools/device/update/device-params-schema.ts";
import {
  AB_COMPARE_ACTIONS,
  MACRO_VARIATIONS,
} from "#src/tools/device/update/device-value-enums.ts";
import {
  booleanList,
  enumList,
  numberList,
} from "#src/tools/shared/validation/lists/typed-lists.ts";
import { sendsInputSchema } from "#src/tools/shared/sends/sends-schema.ts";
import { addressingAliases } from "#src/tools/shared/schema/addressing-params.ts";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";

/** How every per-target param pairs with the targets the call names. */
const PER_TARGET = " One for all, or comma-separated one per target, in order.";

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
        "move to path ('t2/d+' appends to that track, 't2/d1' inserts at 1, 't0/d0/c1/d+', 't0/d0/pD1'; 't0/d0/c+' appends a new chain to that rack and moves the device into it). Comma-separated, one destination per id/path, in order — a destination holds one object, so it never covers several targets. To move a whole drum pad (chain trim, choke group and devices together), target the pad path (e.g. path 't0/d0/pC1', toPath 't0/d0/pD1') rather than its device; a pad move stays within one rack and layers onto an occupied destination rather than replacing it. Moving just a device carries its chain's trim only when the destination chain is empty and untouched, and warns otherwise",
      smallModel: "destination path to move device to",
    }),
    name: param(z.string().optional(), {
      default: `display name (not drum pads).${PER_TARGET}`,
      smallModel: "display name (not drum pads)",
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
    macroVariation: param(enumList(MACRO_VARIATIONS).optional(), {
      default:
        "Rack only: create, load, delete or revert a macro variation, or " +
        "randomize macros. load/delete need macroVariationIndex; create " +
        `appends.${PER_TARGET}`,
      smallModel: null,
    }),
    macroVariationIndex: param(numberList({ min: 0, int: true }).optional(), {
      default:
        "Rack only: variation index for load/delete, a whole number 0 or " +
        `greater (0-based).${PER_TARGET}`,
      smallModel: null,
    }),
    macroCount: param(numberList({ min: 0, max: 16, int: true }).optional(), {
      default:
        "Rack only: set visible macro count, a whole number 0-16. Macros " +
        "come in pairs, so an odd count rounds up; the entry says where the " +
        `count landed.${PER_TARGET}`,
      smallModel: null,
    }),
    abCompare: param(enumList(AB_COMPARE_ACTIONS).optional(), {
      default: `AB Compare: a, b, or save current to the other slot.${PER_TARGET}`,
      smallModel: null,
    }),

    mute: booleanList()
      .optional()
      .describe(`muted? true/false (chains/drum pads only).${PER_TARGET}`),
    solo: booleanList()
      .optional()
      .describe(`soloed? true/false (chains/drum pads only).${PER_TARGET}`),
    color: param(z.string().optional(), {
      default: `#RRGGBB (chains only).${PER_TARGET}`,
      smallModel: "#RRGGBB (chains only)",
    }),
    gainDb: param(numberList({ min: -70, max: 6 }).optional(), {
      default:
        "chain's own gain in dB, -70 to 6 (chains only; a pad path works " +
        "unless the pad has layers, which take a layer path like " +
        `'t0/d0/pC1/c1').${PER_TARGET}`,
      smallModel: null,
    }),
    pan: param(numberList({ min: -1, max: 1 }).optional(), {
      default:
        "chain's own pan, -1 (left) to 1 (right) (chains only; a pad path " +
        `works unless the pad has layers, which take a layer path).${PER_TARGET}`,
      smallModel: null,
    }),
    sendGainDb: param(numberList({ min: -70, max: 0 }).optional(), {
      default:
        "chain's send level in dB, -70 to 0, requires sendReturn (chains " +
        `only).${PER_TARGET}`,
      smallModel: null,
    }),
    sendReturn: param(z.coerce.string().optional(), {
      default:
        'rack return chain for sendGainDb: id, exact name (e.g. "a Reverb"), or letter (e.g. "a"); requires sendGainDb',
      smallModel: null,
    }),
    sends: param(sendsInputSchema, {
      default:
        "set several of a chain's sends at once: [{return, gainDb}], where return is a rack return chain's id, exact name, or letter — the `return`/`returnId` read-device reports. Use instead of sendGainDb + sendReturn, which set one",
      smallModel: null,
    }),
    chokeGroup: param(numberList({ min: 0, max: 16, int: true }).optional(), {
      default: `choke group, a whole number 0-16, 0=none (drum chains only).${PER_TARGET}`,
      smallModel: null,
    }),
    mappedPitch: param(z.string().optional(), {
      default: "output MIDI note e.g. 'C3' (drum chains only)",
      smallModel: null,
    }),
    wrapInRack: param(z.boolean().optional(), {
      default:
        "Wrap device(s) in a new rack (auto-detects type from device); only one instrument at a time, and MIDI and audio effects can't share a rack",
      smallModel: null,
    }),
  },
});
