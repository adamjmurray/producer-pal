// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { z } from "zod";
import { MONITORING_STATE } from "#src/tools/constants.ts";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefUpdateTrack = defineTool("ppal-update-track", {
  title: "Update Track",
  description: "Update track(s)",

  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },

  inputSchema: {
    ids: z.coerce.string().describe("comma-separated track ID(s) to update"),
    name: z.string().optional().describe("name, ideally unique"),
    color: z.string().optional().describe("#RRGGBB"),
    gainDb: z.number().min(-70).max(6).optional().describe("track gain in dB"),
    pan: z
      .number()
      .min(-1)
      .max(1)
      .optional()
      .describe("pan: -1 (left) to 1 (right)"),
    panningMode: z
      .enum(["stereo", "split"])
      .optional()
      .describe("panning mode: stereo or split"),
    leftPan: z
      .number()
      .min(-1)
      .max(1)
      .optional()
      .describe("left channel pan in split mode (-1 to 1)"),
    rightPan: z
      .number()
      .min(-1)
      .max(1)
      .optional()
      .describe("right channel pan in split mode (-1 to 1)"),
    mute: z.boolean().optional().describe("muted?"),
    solo: z.boolean().optional().describe("soloed?"),
    arm: z.boolean().optional().describe("record armed?"),

    inputRoutingTypeId: z
      .string()
      .optional()
      .describe("from availableInputRoutingTypes, set before channel"),
    inputRoutingChannelId: z
      .string()
      .optional()
      .describe("from availableInputRoutingChannels"),
    outputRoutingTypeId: z
      .string()
      .optional()
      .describe("from availableOutputRoutingTypes, set before channel"),
    outputRoutingChannelId: z
      .string()
      .optional()
      .describe("from availableOutputRoutingChannels"),
    monitoringState: z
      .enum(Object.values(MONITORING_STATE) as [string, ...string[]])
      .optional()
      .describe("input monitoring"),
    arrangementFollower: z
      .boolean()
      .optional()
      .describe("track follows the arrangement?"),
    sendGainDb: z
      .number()
      .min(-70)
      .max(0)
      .optional()
      .describe("send gain in dB, requires sendReturn"),
    sendReturn: z
      .string()
      .optional()
      .describe(
        'return track: exact name (e.g., "A-Reverb") or letter (e.g., "A")',
      ),
  },

  smallModelModeConfig: {
    excludeParams: [
      "panningMode",
      "leftPan",
      "rightPan",
      "inputRoutingTypeId",
      "inputRoutingChannelId",
      "outputRoutingTypeId",
      "outputRoutingChannelId",
      "monitoringState",
      "arrangementFollower",
      "sendGainDb",
      "sendReturn",
    ],
  },
});
