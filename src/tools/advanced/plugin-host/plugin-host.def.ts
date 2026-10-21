// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefPluginHost = defineTool("ppal-plugin-host", {
  title: "Plug-in Host",
  description:
    "Spike: read and set VST3 plug-in parameters through a plug-in host wrapper device. " +
    "`info` shows the loaded plug-in, `load` loads one by name, " +
    "`params` lists parameters (value 0..1 plus the plug-in's own display text), " +
    "`set` sets some and reads them back, `raw` sends vst~ a message.",

  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },

  // Only these two change anything.
  changesSet: ({ action }) => action === "load" || action === "set",

  inputSchema: {
    deviceId: z.coerce
      .string()
      .describe("Live device id of the plug-in host wrapper device"),
    action: z.enum(["info", "load", "params", "set", "raw"]),
    plugin: z.string().optional().describe("Plug-in name, for load"),
    names: z
      .array(z.string())
      .optional()
      .describe("Parameter names to read, for params (default: all)"),
    params: z
      .array(
        z.object({
          index: z.coerce.number().optional(),
          name: z.string().optional(),
          value: z.coerce.number().min(0).max(1),
        }),
      )
      .optional()
      .describe("For set: each by index or name, value 0..1"),
    message: z
      .array(z.string())
      .optional()
      .describe("For raw: a message sent to vst~ as is (debug)"),
  },
});
