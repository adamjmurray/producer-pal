// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefReadDevice = defineTool("ppal-read-device", {
  title: "Read Device",
  description:
    "Read information about a device, chain, or drum pad by ID or path.\nReturns overview by default. Use include to add detail.",

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },

  inputSchema: {
    deviceId: z.coerce.string().optional().describe("Device ID to read"),
    path: z
      .string()
      .optional()
      .describe(
        "Device/chain/drum-pad path: t=track, rt=return, mt=master, d=device, c=chain, rc=return chain, p=drum pad. " +
          "E.g., 't1/d0' (device), 't1/d0/c0' (chain), 't1/d0/pC1' (drum pad), 't1/d0/rc0' (return chain)",
      ),
    include: z
      .array(
        z.enum([
          "chains",
          "drum-map",
          "drum-pads",
          "params",
          "param-values",
          "return-chains",
          "sample",
          "*",
        ]),
      )
      .default([])
      .describe(
        'data: chains, drum-map, drum-pads, params, param-values, return-chains, sample, "*" for all',
      ),
    maxDepth: z.coerce
      .number()
      .int()
      .min(0)
      .default(0)
      .describe(
        "Device tree depth for chains/drum-pads. 0=chains only with deviceCount, 1=direct devices, 2+=deeper",
      ),
    paramSearch: z
      .string()
      .optional()
      .describe(
        "Filter parameters by case-insensitive substring match on name",
      ),
  },
});
