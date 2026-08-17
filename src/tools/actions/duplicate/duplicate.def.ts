// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { MAX_CODE_LENGTH } from "#src/tools/constants.ts";
import { boundedString } from "#src/tools/shared/tool-framework/bounded-string.ts";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import { deprecatedParam } from "#src/tools/shared/tool-framework/hidden-param.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";

export const toolDefDuplicate = defineTool("ppal-duplicate", {
  title: "Duplicate",
  description: {
    default:
      "Duplicate an object. Supports tracks, scenes, clips, devices, and drum pads. " +
      "Use count for multiple track/scene copies; arrangementStart or locator for clip placement, " +
      "and toPath for the destination track, session slot, device chain, or drum pad.",
    smallModel:
      "Duplicate an object. Supports tracks, scenes, clips, devices, and drum pads. " +
      "Use arrangementStart for clip placement; toPath for the destination track, session slot, device, or pad.",
  },

  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },

  inputSchema: {
    id: param(z.coerce.string().optional(), {
      default: "object to duplicate (required except for drum pads)",
      smallModel: "object to duplicate (not drum pads: use path)",
    }),
    path: param(z.coerce.string().optional(), {
      default: "drum pad to duplicate, e.g. 't0/d0/pC1' (drum pads only)",
      smallModel: "drum pad to duplicate, e.g. 't0/d0/pC1'",
    }),
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
        "number of copies (tracks/scenes only, ignored for clips/devices)",
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
        "destination path(s), comma-separated for multiple. Clips: 't2/s1' = session slot (track 2, scene 1), " +
        "'t2' = track 2's arrangement (needs arrangementStart or locator, and a track matching the clip's MIDI/audio type), " +
        "'t2/l1' = a take lane on it and 't2/l+' appends a fresh one (MIDI only); " +
        "omit for the source clip's own track. Devices: 't1/d0'. " +
        "Drum pads: 't0/d0/pD1', required, and must be in the same rack as the source pad. " +
        "Cycles against arrangementStart when the lists differ in length",
      smallModel:
        "destination path(s): clip session slot 't2/s1', clip arrangement track 't2', device 't1/d0', drum pad 't0/d0/pD1'",
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
