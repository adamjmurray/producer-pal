// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import { deprecatedParam } from "#src/tools/shared/tool-framework/hidden-param.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";
import { booleanList } from "#src/tools/shared/validation/lists/typed-lists.ts";
import { trackPathFromIndex } from "#src/tools/shared/validation/helpers/path-from-index.ts";

/** How every per-track param pairs with the tracks the call makes. */
const PER_TRACK = " One for all, or comma-separated one per track, in order.";

export const toolDefCreateTrack = defineTool("ppal-create-track", {
  title: "Create Track",
  description:
    "Create track(s). Params with no list form apply to every track.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    path: param(z.coerce.string().optional(), {
      default:
        "where it goes: 't+' appends, 't<index>' inserts there (t0 is the first track, so a user's \"track 3\" is t2), 'rt+' adds a return track. Comma-separated for several, one entry per track, in order (e.g. 't+,t+,t+' appends three, 't2,t2' inserts two at 2)",
      smallModel:
        "'t+' to append, or 't<index>' to insert there (t0 is the first track, so a user's \"track 3\" is t2)",
    }),

    trackIndex: deprecatedParam(z.coerce.number().int().min(-1).optional(), {
      replacedBy: "path",
      example: trackPathFromIndex,
    }),

    count: deprecatedParam(z.coerce.number().int().min(1).optional(), {
      replacedBy: "path",
      example: "t+,t+,t+",
      note: "path names every track, so repeat it once per track instead of counting",
    }),

    name: param(z.string().optional(), {
      default: `name.${PER_TRACK}`,
      smallModel: "track name",
    }),
    color: param(z.string().optional(), {
      default: `#RRGGBB.${PER_TRACK}`,
      smallModel: "#RRGGBB",
    }),
    type: param(z.enum(["midi", "audio", "return"]).default("midi"), {
      // "return" still works for a caller that hasn't moved to "rt+", but the
      // path is the way to ask for one now, so it isn't offered.
      default: { description: "type", excludeEnumValues: ["return"] },
    }),
    mute: param(booleanList().optional(), {
      default: `muted? true/false.${PER_TRACK}`,
      smallModel: null,
    }),
    solo: param(booleanList().optional(), {
      default: `soloed? true/false.${PER_TRACK}`,
      smallModel: null,
    }),
    arm: param(booleanList().optional(), {
      default: `record armed? true/false.${PER_TRACK}`,
      smallModel: null,
    }),
  },
});
