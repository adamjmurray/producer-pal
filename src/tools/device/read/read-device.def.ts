// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import { aliasParam } from "#src/tools/shared/tool-framework/hidden-param.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";
import { optionalNumber } from "#src/tools/shared/tool-framework/optional-number.ts";

export const toolDefReadDevice = defineTool("ppal-read-device", {
  title: "Read Device",
  description:
    "Read information about a device, chain, or drum pad by ID or path. Returns overview by default. Use include to add detail.",

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },

  inputSchema: {
    id: z.coerce.string().optional().describe("device or drum pad ID to read"),

    deviceId: aliasParam(z.coerce.string().optional(), {
      canonical: "id",
    }),
    path: z.coerce
      .string()
      .optional()
      .describe("path (e.g., 't1/d0', 't1/d0/c0', 't1/d0/pC1', 't1/d0/rc0')"),
    include: param(
      z
        .array(
          z.enum([
            "actions",
            "chains",
            "drum-map",
            "drum-pads",
            "params",
            "param-values",
            "return-chains",
            "sample",
            "options",
            "*",
          ]),
        )
        .default([]),
      {
        default:
          'chains, return-chains, drum-pads = rack contents (use maxDepth; a chain lists its own gainDb/pan/sends only when non-default). params, param-values = parameters. drum-map = pad names keyed by note (drum name in stark, MIDI number in midi-json). sample = Simpler sample file path (flat top-level field; gainDb and other sample params are in params). actions = device-specific actions for update-device (name, signature, description). options = valid pseudo-param values (paramOptions) + dynamic catalogs for specialized devices (IR files, sidechain sources, wavetables) + Wavetable mod routes. "*" = all',
        // `actions` goes because its only consumer is update-device's `actions`
        // param, which small mode hides — the whole option is dead there. See
        // ADR-0026.
        smallModel: {
          description:
            "chains = rack contents (use maxDepth). params, param-values = parameters. drum-map = pad names keyed by note (drum name in stark, MIDI number in midi-json). sample = Simpler sample file path. options = valid param values + device catalogs",
          excludeEnumValues: ["actions", "drum-pads", "return-chains", "*"],
        },
      },
    ),
    maxDepth: param(optionalNumber(z.coerce.number().int().min(0).default(0)), {
      default:
        "Device tree depth for chains/drum-pads. 0=chains only with deviceCount, 1=direct devices, 2+=deeper",
      smallModel:
        "Device tree depth for chains. 0=chains only with deviceCount, 1=direct devices, 2+=deeper",
    }),
    paramSearch: z
      .string()
      .optional()
      .describe(
        "Filter parameters by case-insensitive substring match on name",
      ),
  },
});
