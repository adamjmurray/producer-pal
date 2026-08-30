// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { MAX_CODE_LENGTH } from "#src/tools/constants.ts";
import { boundedString } from "#src/tools/shared/tool-framework/bounded-string.ts";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import {
  aliasParam,
  deprecatedParam,
} from "#src/tools/shared/tool-framework/hidden-param.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";

export const toolDefDuplicate = defineTool("ppal-duplicate", {
  title: "Duplicate",
  description: {
    default:
      "Duplicate an object, or several — id takes a comma-separated list. Supports tracks, scenes, clips, devices, and drum pads. " +
      "Use count for multiple track/scene copies; arrangementStart or locator for clip placement, " +
      "and toPath for the destination track, clip slot, device chain, or drum pad.",
    smallModel:
      "Duplicate an object, or several (id takes a list). Supports tracks, scenes, clips, devices, and drum pads. " +
      "Use arrangementStart for clip placement; toPath for the destination track, clip slot, device, or pad.",
  },

  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },

  inputSchema: {
    id: z.coerce
      .string()
      .optional()
      .describe(
        "id(s) of the object(s) to duplicate, comma-separated for multiple",
      ),

    ids: aliasParam(z.coerce.string().optional(), { canonical: "id" }),
    path: z.coerce
      .string()
      .optional()
      .describe(
        "source drum pad path instead of id, e.g. 't0/d0/pC1' (drum pads only)",
      ),
    type: z
      .enum(["track", "scene", "clip", "device", "drum-pad"])
      .describe("type of object to duplicate"),

    name: param(z.string().optional(), {
      default: "name (comma-separated when duplicating multiple)",
      smallModel: "name",
    }),
    color: param(z.string().optional(), {
      default: "#RRGGBB (comma-separated when duplicating multiple, cycles)",
      smallModel: "#RRGGBB",
    }),

    count: param(z.coerce.number().int().min(1).default(1), {
      default:
        "copies per source (tracks/scenes only, ignored for clips/devices)",
      smallModel: null,
    }),

    withoutClips: param(z.boolean().default(false), {
      default: "exclude clips?",
      smallModel: null,
    }),
    withoutDevices: param(z.boolean().default(false), {
      default: "exclude devices?",
      smallModel: null,
    }),

    arrangementStart: param(z.coerce.string().optional(), {
      default:
        "arrangement bar|beat position(s) for clips/scenes, comma-separated for multiple (e.g., '1|1' or '1|1,2|1,3|1'). Song meter",
      smallModel: "arrangement bar|beat position (e.g., '1|1'). Song meter",
    }),
    locator: param(z.coerce.string().optional(), {
      default:
        "arrangement locator ID(s) or name(s), comma-separated for multiple (e.g., 'locator-0' or 'Verse' or 'locator-0,Chorus')",
      smallModel: null,
    }),
    arrangementLength: z
      .string()
      .optional()
      .describe(
        "duration: Nbar (e.g., '4bar'), n<fraction> note value (e.g., 'n/4'), or Nbar+n<fraction> (e.g., '1bar+n/4'); song meter. " +
          "Shorter than the source trims the copy; longer tiles copies to fill the span (many clips, not one) — for a single clip use ppal-update-clip with looping false and notes for the full length",
      ),
    toSlot: deprecatedParam(z.coerce.string().optional(), {
      replacedBy: "toPath",
    }),
    toPath: param(z.coerce.string().optional(), {
      default:
        "destination(s), comma-separated for multiple. Clips: 't2/s1' = clip slot (track 2, scene 1), " +
        "'t2' = track 2's arrangement (needs arrangementStart or locator, and a track matching the clip's MIDI/audio type), " +
        "'t2/l0' = its first take lane and 't2/l+' appends a fresh one; " +
        "omit for the source clip's own track. Devices: 't1/d0'. " +
        "Drum pads: 't0/d0/pD1', required, and must be in the same rack as the source pad (id or path names the source). " +
        "Cycles against arrangementStart when the lists differ in length. " +
        "With several sources, a track/take-lane destination goes to every source; clip slots, devices and pads are shared out, so name one per copy",
      smallModel:
        "destination(s): clip slot 't2/s1', clip arrangement track 't2', device 't1/d0', drum pad 't0/d0/pD1'",
    }),

    routeToSource: param(z.boolean().optional(), {
      default:
        "tracks only (errors otherwise): the copy gets no clips or devices of its own and plays the source track's instrument (for MIDI layering/polyrhythms)",
      smallModel: null,
    }),

    transforms: param(z.string().optional(), {
      default:
        "transform expressions (broadcast across copies; clips only); newline-separated for multiple. Use clip.index / clipseq() for per-copy variation",
      smallModel: null,
    }),
    ...(process.env.ENABLE_CODE_EXEC === "true"
      ? {
          code: param(boundedString(MAX_CODE_LENGTH).optional(), {
            default: `JS function body (broadcast across copies; clips only; max ${MAX_CODE_LENGTH} chars): receives (notes, context), returns notes array. context.clip.{index,count} for per-copy variation`,
            smallModel: null,
          }),
        }
      : {}),

    takeLane: deprecatedParam(z.coerce.string().optional(), {
      replacedBy: "toPath",
    }),

    takeLaneName: param(z.string().optional(), {
      default: "name for a take lane this call creates (toPath 't<track>/l+')",
      smallModel: null,
    }),
  },
});
