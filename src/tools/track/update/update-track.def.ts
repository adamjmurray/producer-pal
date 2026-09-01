// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { MONITORING_STATE } from "#src/tools/constants.ts";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import {
  aliasParam,
  deprecatedParam,
} from "#src/tools/shared/tool-framework/hidden-param.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";

export const toolDefUpdateTrack = defineTool("ppal-update-track", {
  title: "Update Track",
  description: "Update track(s).",

  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },

  inputSchema: {
    id: z.coerce
      .string()
      .optional()
      .describe("track ID(s) to update, comma-separated for multiple"),

    ids: aliasParam(z.coerce.string().optional(), {
      canonical: "id",
    }),
    name: param(z.string().optional(), {
      default:
        "name for all, or comma-separated one per track, in order (blank entry = unchanged), ideally unique",
      smallModel: "name, ideally unique",
    }),
    color: param(z.string().optional(), {
      default:
        "#RRGGBB for all, or comma-separated one per track, in order (blank entry = unchanged)",
      smallModel: "#RRGGBB",
    }),
    gainDb: z.coerce
      .number()
      .min(-70)
      .max(6)
      .optional()
      .describe("track gain in dB"),
    pan: z.coerce
      .number()
      .min(-1)
      .max(1)
      .optional()
      .describe("pan: -1 (left) to 1 (right)"),
    panningMode: param(z.enum(["stereo", "split"]).optional(), {
      default: "panning mode: stereo or split",
      smallModel: null,
    }),
    leftPan: param(z.coerce.number().min(-1).max(1).optional(), {
      default: "left channel pan in split mode (-1 to 1)",
      smallModel: null,
    }),
    rightPan: param(z.coerce.number().min(-1).max(1).optional(), {
      default: "right channel pan in split mode (-1 to 1)",
      smallModel: null,
    }),
    mute: z.boolean().optional().describe("muted?"),
    solo: z.boolean().optional().describe("soloed?"),
    arm: z.boolean().optional().describe("record armed?"),

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
    monitoringState: param(
      z
        .enum(Object.values(MONITORING_STATE) as [string, ...string[]])
        .optional(),
      {
        default: "input monitoring",
        smallModel: null,
      },
    ),
    sendGainDb: param(z.coerce.number().min(-70).max(0).optional(), {
      default: "send gain in dB, requires sendReturn",
      smallModel: null,
    }),
    sendReturn: param(z.coerce.string().optional(), {
      default:
        'return track: id, exact name (e.g., "A-Reverb"), or letter (e.g., "A")',
      smallModel: null,
    }),
  },
});
