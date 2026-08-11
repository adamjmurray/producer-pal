// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { paramsInputSchema } from "#src/tools/device/update/device-params-schema.ts";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";

export const toolDefCreateDevice = defineTool("ppal-create-device", {
  title: "Create Device",
  description:
    "Create a native Live device (instrument, MIDI effect, or audio effect) on a track or inside a chain.",
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },
  inputSchema: {
    deviceName: z
      .string()
      .optional()
      .describe("device name, omit to list available devices"),
    path: param(z.string().optional(), {
      default:
        "insertion path(s), required with deviceName, comma-separated for multiple (e.g., 't0' or 't0,t1,t0/d0/c0')",
      smallModel:
        "insertion path, required with deviceName (e.g., 't0', 't0/d1', 't0/d0/c0')",
    }),
    name: param(z.string().optional(), {
      default: "name for all, or comma-separated for each",
      smallModel: "display name",
    }),
    params: param(paramsInputSchema, {
      default:
        "applied after creation — array of {name, value}. name = param name or read-device id; value in display units (enum string, note name, number). For a Drum Rack, prefix the name with a pad path to address a pad's device, e.g. {name:'pC1/d0/sample', value:'<abs file path>'} loads a sample into pad C1 (auto-creates the pad's Simpler) — build a full kit in one call",
      // See update-device: small mode has no devices fragment, so the value
      // format has to survive the trim even though the pad example doesn't.
      smallModel:
        "applied after creation — array of {name, value}. name = param name or id; value in display units (enum string, note name, number)",
    }),
  },
});
