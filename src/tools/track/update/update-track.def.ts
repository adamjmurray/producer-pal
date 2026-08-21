// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { MONITORING_STATE } from "#src/tools/constants.ts";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import { aliasParam } from "#src/tools/shared/tool-framework/hidden-param.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";
import { optionalNumber } from "#src/tools/shared/tool-framework/optional-number.ts";

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
        "name for all, or comma-separated for each (extras keep existing name), ideally unique",
      smallModel: "name, ideally unique",
    }),
    color: param(z.string().optional(), {
      default:
        "#RRGGBB for all, or comma-separated for each (cycles if fewer than the tracks)",
      smallModel: "#RRGGBB",
    }),
    gainDb: optionalNumber(z.coerce.number().min(-70).max(6)).describe(
      "track gain in dB",
    ),
    pan: optionalNumber(z.coerce.number().min(-1).max(1)).describe(
      "pan: -1 (left) to 1 (right)",
    ),
    panningMode: param(z.enum(["stereo", "split"]).optional(), {
      default: "panning mode: stereo or split",
      smallModel: null,
    }),
    leftPan: param(optionalNumber(z.coerce.number().min(-1).max(1)), {
      default: "left channel pan in split mode (-1 to 1)",
      smallModel: null,
    }),
    rightPan: param(optionalNumber(z.coerce.number().min(-1).max(1)), {
      default: "right channel pan in split mode (-1 to 1)",
      smallModel: null,
    }),
    mute: z.boolean().optional().describe("muted?"),
    solo: z.boolean().optional().describe("soloed?"),
    arm: z.boolean().optional().describe("record armed?"),

    inputRoutingTypeId: param(z.coerce.string().optional(), {
      default: "from availableInputRoutingTypes, set before channel",
      smallModel: null,
    }),
    inputRoutingChannelId: param(z.coerce.string().optional(), {
      default: "from availableInputRoutingChannels",
      smallModel: null,
    }),
    outputRoutingTypeId: param(z.coerce.string().optional(), {
      default: "from availableOutputRoutingTypes, set before channel",
      smallModel: null,
    }),
    outputRoutingChannelId: param(z.coerce.string().optional(), {
      default: "from availableOutputRoutingChannels",
      smallModel: null,
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
    sendGainDb: param(optionalNumber(z.coerce.number().min(-70).max(0)), {
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
