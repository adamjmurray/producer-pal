// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { addressingAliases } from "#src/tools/shared/schema/addressing-params.ts";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import { deprecatedParam } from "#src/tools/shared/tool-framework/hidden-param.ts";
import { sendsInputSchema } from "#src/tools/shared/sends/sends-schema.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";
import {
  booleanList,
  enumList,
  numberList,
} from "#src/tools/shared/validation/lists/typed-lists.ts";
import { MONITORING_STATES, PANNING_MODES } from "#src/tools/constants.ts";

/** How every per-target param pairs with the targets the call names. */
const PER_TARGET = " One for all, or comma-separated one per target, in order.";

export const toolDefUpdateTrack = defineTool("ppal-update-track", {
  title: "Update Track",
  description:
    "Update track(s). Params with no list form apply to every target.",

  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },

  inputSchema: {
    id: z.coerce
      .string()
      .optional()
      .describe(
        "track or take lane ID(s) to update, comma-separated for multiple",
      ),

    ...addressingAliases(),
    path: param(z.coerce.string().optional(), {
      default:
        "track or take lane path(s) to update instead of id, comma-separated: 't<index>' (t0 is the first track, so a user's \"track 3\" is t2), 'rt<index>' (return), 'mt' (main), 't<index>/l<lane>' (a take lane, creating the lanes up to it), 't<index>/l+' (append a take lane). A lane takes only name - e.g. 't0,rt1' or 't2/l+'",
      smallModel:
        "track path to update instead of id: 't<index>', where t0 is the first track (a user's \"track 3\" is t2). 't0/l0' names a take lane and 't0/l+' adds one; a lane takes only name",
    }),

    name: param(z.string().optional(), {
      default: `name, ideally unique.${PER_TARGET}`,
      smallModel: "name, ideally unique",
    }),
    color: param(z.string().optional(), {
      default: `#RRGGBB.${PER_TARGET}`,
      smallModel: "#RRGGBB",
    }),
    gainDb: numberList({ min: -70, max: 6 })
      .optional()
      .describe(`track gain in dB, -70 to 6.${PER_TARGET}`),
    pan: numberList({ min: -1, max: 1 })
      .optional()
      .describe(`pan: -1 (left) to 1 (right).${PER_TARGET}`),
    panningMode: param(enumList(PANNING_MODES).optional(), {
      default: `stereo or split.${PER_TARGET}`,
      smallModel: null,
    }),
    leftPan: param(numberList({ min: -1, max: 1 }).optional(), {
      default: `left channel pan in split mode, -1 to 1.${PER_TARGET}`,
      smallModel: null,
    }),
    rightPan: param(numberList({ min: -1, max: 1 }).optional(), {
      default: `right channel pan in split mode, -1 to 1.${PER_TARGET}`,
      smallModel: null,
    }),
    mute: booleanList().optional().describe(`muted? true/false.${PER_TARGET}`),
    solo: booleanList().optional().describe(`soloed? true/false.${PER_TARGET}`),
    arm: booleanList()
      .optional()
      .describe(`record armed? true/false.${PER_TARGET}`),

    inputRoutingType: param(z.coerce.string().optional(), {
      default: "name from availableInputRoutingTypes, set before channel",
      smallModel: null,
    }),
    inputRoutingChannel: param(z.coerce.string().optional(), {
      default: "name from availableInputRoutingChannels",
      smallModel: null,
    }),
    outputRoutingType: param(z.coerce.string().optional(), {
      default: "name from availableOutputRoutingTypes, set before channel",
      smallModel: null,
    }),
    outputRoutingChannel: param(z.coerce.string().optional(), {
      default: "name from availableOutputRoutingChannels",
      smallModel: null,
    }),

    inputRoutingTypeId: deprecatedParam(z.coerce.string().optional(), {
      replacedBy: "inputRoutingType",
    }),
    inputRoutingChannelId: deprecatedParam(z.coerce.string().optional(), {
      replacedBy: "inputRoutingChannel",
    }),
    outputRoutingTypeId: deprecatedParam(z.coerce.string().optional(), {
      replacedBy: "outputRoutingType",
    }),
    outputRoutingChannelId: deprecatedParam(z.coerce.string().optional(), {
      replacedBy: "outputRoutingChannel",
    }),
    monitoringState: param(enumList(MONITORING_STATES).optional(), {
      default: `input monitoring: in, auto or off.${PER_TARGET}`,
      smallModel: null,
    }),
    sendGainDb: param(numberList({ min: -70, max: 0 }).optional(), {
      default: `send gain in dB, -70 to 0, requires sendReturn.${PER_TARGET}`,
      smallModel: null,
    }),
    sendReturn: param(z.coerce.string().optional(), {
      default:
        'return track: id, exact name (e.g., "A-Reverb"), or letter (e.g., "A")',
      smallModel: null,
    }),
    sends: param(sendsInputSchema, {
      default:
        "set several of the track's sends at once: [{return, gainDb}], where return is a return track's id, exact name, or letter — the `return`/`returnId` read-track reports. Use instead of sendGainDb + sendReturn, which set one",
      smallModel: null,
    }),
  },
});
