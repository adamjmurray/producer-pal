// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { z } from "zod";
import { addressingAliases } from "#src/tools/shared/schema/addressing-params.ts";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";

export const toolDefReadDevice = defineTool("ppal-read-device", {
  title: "Read Device",
  description:
    "Read information about a device, chain, or drum pad by ID or path. Returns overview by default. Use include to add detail.",

  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
  },

  inputSchema: {
    id: z.coerce
      .string()
      .optional()
      .describe("device, chain or drum pad id(s), comma-separated"),

    ...addressingAliases({ idAlias: "deviceId" }),
    path: z.coerce
      .string()
      .optional()
      .describe(
        "path(s) to read, comma-separated (e.g., 't1/d0', 't1/inst', 't1/d0/c0', 't1/d0/pC1', 't1/d0/rc0')",
      ),

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
          'chains, return-chains, drum-pads = rack contents (use maxDepth; chains on a Drum Rack gives its pads with their layers). params, param-values = parameters of the addressed device only (read a nested device by its own path). drum-map = pad names keyed by note (drum name in stark, MIDI number in midi-json), plus drumRackPath naming the rack they belong to. sample = Simpler sample file path (flat top-level field; other sample params are in params). actions = device-specific actions for update-device. options = valid pseudo-param values + dynamic catalogs for specialized devices (IR files, sidechain sources, wavetables) + Wavetable mod routes. "*" = all',
        // `actions` goes because its only consumer is update-device's `actions`
        // param, which small mode hides — the whole option is dead there.
        smallModel: {
          description:
            "chains = rack contents (use maxDepth; a Drum Rack gives its pads with their layers). params, param-values = parameters of the addressed device only (read a nested device by its own path). drum-map = pad names keyed by note (drum name in stark, MIDI number in midi-json), plus drumRackPath naming the rack they belong to. sample = Simpler sample file path. options = valid param values + device catalogs",
          excludeEnumValues: ["actions", "drum-pads", "return-chains", "*"],
        },
      },
    ),
    maxDepth: param(z.coerce.number().int().min(0).default(0), {
      default:
        "Device tree depth for chains/drum-pads. 0=chains only with deviceCount, 1=direct devices, 2+=deeper",
      smallModel:
        "Device tree depth for chains. 0=chains only with deviceCount, 1=direct devices, 2+=deeper",
    }),
    paramSearch: z
      .string()
      .optional()
      .describe(
        "Filter parameters by case-insensitive substring match on name (implies params)",
      ),
  },
});
