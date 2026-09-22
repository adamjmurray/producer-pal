// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import {
  DUPLICATE_TYPES,
  MAX_CODE_LENGTH,
  TAKE_LANE_NOTE,
} from "#src/tools/constants.ts";
import { boundedString } from "#src/tools/shared/tool-framework/bounded-string.ts";
import { addressingAliases } from "#src/tools/shared/schema/addressing-params.ts";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import { deprecatedParam } from "#src/tools/shared/tool-framework/hidden-param.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";
import {
  booleanList,
  numberList,
} from "#src/tools/shared/validation/lists/typed-lists.ts";

/** How a per-source param pairs with the sources the call names. */
const PER_SOURCE = " One for all, or comma-separated one per source, in order.";

export const toolDefDuplicate = defineTool("ppal-duplicate", {
  title: "Duplicate",
  description: {
    default:
      "Duplicate an object, or several — id takes a comma-separated list. Supports tracks, scenes, clips, devices, and drum pads. " +
      "Use count for multiple track/scene copies, and toPath for the destination: a clip slot, a spot on " +
      "the arrangement, a track, a device chain, or a drum pad. " +
      "Params with no list form apply to every copy.",
    smallModel:
      "Duplicate an object, or several (id takes a list). Supports tracks, scenes, clips, devices, and drum pads. " +
      "Use toPath for the destination: clip slot, arrangement spot, device, or pad.",
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
        "id(s) of the object(s) to duplicate, comma-separated for multiple " +
          "(type 'track' also takes a take lane's id, which needs a lane or track toPath)",
      ),

    ...addressingAliases(),
    path: param(z.coerce.string().optional(), {
      default:
        "path(s) of the object(s) to duplicate, instead of or alongside id, comma-separated for multiple " +
        "(e.g. 't0', 's1', 't0/s1', 't0[5|1]', 't0/d0', 't0/d0/pC1'; 't0/l0' names a take lane, and needs a lane or track toPath)",
      smallModel:
        "path of the object to duplicate instead of id (e.g., 't0' or 't0/s1')",
    }),

    type: z.enum(DUPLICATE_TYPES).describe("type of object to duplicate"),

    name: param(z.string().optional(), {
      default: "name for all, or comma-separated one per copy, in order",
      smallModel: "name",
    }),
    color: param(z.string().optional(), {
      default: "#RRGGBB for all, or comma-separated one per copy, in order",
      smallModel: "#RRGGBB",
    }),

    count: param(numberList({ min: 1, int: true }).default("1"), {
      default: `copies per source, a whole number 1 or more (tracks/scenes only, ignored for clips/devices).${PER_SOURCE}`,
      smallModel: null,
    }),

    withoutClips: param(booleanList().optional(), {
      default: `exclude clips? true/false.${PER_SOURCE}`,
      smallModel: null,
    }),
    withoutDevices: param(booleanList().optional(), {
      default: `exclude devices? true/false.${PER_SOURCE}`,
      smallModel: null,
    }),

    arrangementStart: deprecatedParam(z.coerce.string().optional(), {
      replacedBy: "toPath",
      example: "t2[5|1]",
    }),
    locator: deprecatedParam(z.coerce.string().optional(), {
      replacedBy: "toPath",
      example: "t2[loc:Verse]",
    }),
    arrangementLength: z
      .string()
      .optional()
      .describe(
        "duration: <count>bar (e.g., '4bar'), n<fraction> note value (e.g., 'n/4'), or <count>bar+n<fraction> (e.g., '1bar+n/4'); song meter. " +
          "Shorter than the source trims the copy; longer tiles copies to fill the span (many clips, not one) — for a single clip use ppal-update-clip with looping false and notes for the full length." +
          PER_SOURCE,
      ),
    toSlot: deprecatedParam(z.coerce.string().optional(), {
      replacedBy: "toPath",
    }),
    toPath: param(z.coerce.string().optional(), {
      default:
        "destination(s), comma-separated for multiple. Clips: 't2/s1' = a clip slot, third track and second scene (both count from 0, and scenes are created up to that index); " +
        "'t2[5|1]' = that spot on that track's arrangement, and '[5|1]' the same spot on the source clip's " +
        "own track (a position is bar|beat or loc:<locator name or id> — 't2[loc:Chorus]' names a " +
        "section instead of counting bars; an arrangement track must match " +
        "the clip's MIDI/audio type); 't2/l0' = its first take lane, and lanes are created up to that " +
        "index; " +
        "'t2' alone needs a position, and omitting toPath uses the source clip's own track. Devices: 't1/d+' appends, 't1/d0' inserts at 0. " +
        "Chains: 't1/d0/c+' appends the copy to that rack (any rack of the same kind); omitting toPath appends to the chain's own rack. " +
        "Scenes: '[5|1]' = that spot on the arrangement, across every track. " +
        "Tracks: 't2/l0' (or 't2/l+') copies the source's arrangement clips onto that take lane, " +
        "at the positions they already have. A track source copies its main lane, a 't2/l0' source that lane. " +
        "A 't2/l0' source onto a bare 't2' promotes the lane's clips to the main lane, over the clips already there. " +
        "Clips only, and the two tracks must match MIDI/audio type; name/color label the copies. " +
        "A track copy needs no toPath otherwise. " +
        "Drum pads: 't0/d0/pD1', required, and must be in the same rack as the source pad (id or path names the source). " +
        "One arrangement position covers every source; a list pairs one per copy, in order, and never cycles. " +
        "A clip slot, device or pad holds one object, so name one per copy — any other count is refused",
      smallModel:
        "destination(s): clip slot 't2/s1', clip arrangement spot 't2[5|1]', device 't1/d0', drum pad 't0/d0/pD1'",
    }),

    routeToSource: param(booleanList().optional(), {
      default: `tracks only (errors otherwise), true/false: the copy gets no clips or devices of its own and plays the source track's instrument (for MIDI layering/polyrhythms).${PER_SOURCE}`,
      smallModel: null,
    }),

    transforms: param(z.string().optional(), {
      default:
        "transform expressions (broadcast across copies; clips only); newline-separated for multiple. Use clip.index / clipseq() for per-copy variation. Note-count operations (ratchet()/repeat()/split()/merge()) change how many notes exist",
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
      note: TAKE_LANE_NOTE,
    }),

    // Deprecated: naming a lane is a property of the lane, not something a
    // clip call should carry. Still honored for 2.2.0 callers.
    takeLaneName: deprecatedParam(z.string().optional(), {
      guidance:
        'name the lane with ppal-update-track (path "t0/l0" and the name)',
    }),
  },
});
