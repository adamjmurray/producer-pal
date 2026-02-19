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
      .describe("path (e.g., 't1/d0', 't1/d0/c0', 't1/d0/pC1', 't1/d0/rc0')"),
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
        'chains, return-chains, drum-pads = rack contents (use maxDepth). params, param-values = parameters. drum-map = note names. sample = Simpler file. "*" = all',
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
