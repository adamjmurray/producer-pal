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
    path: param(z.coerce.string().optional(), {
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
        "applied after creation — array of {name, value}. name = a param name, or a param id from read-device; value in display units (enum string, note name, number) — use the `unit` read-device reports for that param, or no unit at all; a param with no `unit` takes a bare number. Many params only accept a coarse ladder of values, so a request lands on the nearest one — the response reports what each param reads as afterward. For a Drum Rack, prefix the name with a pad path to address a pad's device, e.g. {name:'pC1/d0/sample', value:'<abs file path>'} loads a sample into pad C1 (auto-creates the pad's Simpler) — build a full kit in one call",
      // See update-device: small mode has no devices fragment, so the value
      // format and the sample write both have to survive the trim.
      smallModel:
        "applied after creation — array of {name, value}. name = a param name, or a param id from read-device; value in display units (enum string, note name, number). A value snaps to the nearest one the param accepts; the response reports what it reads as. Load a sample with {name:'sample', value:'<abs path>'} (there is no top-level sample arg); for a Drum Rack pad prefix it, e.g. {name:'pC1/d0/sample'}",
    }),
  },
});
