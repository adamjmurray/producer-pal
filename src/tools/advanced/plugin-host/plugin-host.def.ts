// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefPluginHost = defineTool("ppal-plugin-host", {
  title: "Plug-in Host",
  description:
    "Spike: read and set VST3, AU and VST2 plug-in parameters through a plug-in host wrapper device. " +
    "`info` shows the loaded plug-in, `load` loads one by the name Live's browser shows, " +
    "`params` lists parameters (value 0..1 plus the plug-in's own display text), " +
    "`set` sets some and reads them back, `raw` sends vst~ a message. " +
    "`map` links an automation slot to a param (by `name` or `index`) and sets the slot's dial to the param's value " +
    "(unless the slot already drives it, or the dial has arrangement automation), `unmap` frees a slot, " +
    "`slots` lists the links and the slot count.",

  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },

  // Only these change anything.
  changesSet: ({ action }) =>
    action === "load" ||
    action === "set" ||
    action === "map" ||
    action === "unmap",

  inputSchema: {
    deviceId: z.coerce
      .string()
      .describe("Live device id of the plug-in host wrapper device"),
    action: z.enum([
      "info",
      "load",
      "params",
      "set",
      "raw",
      "map",
      "unmap",
      "slots",
    ]),
    plugin: z
      .string()
      .optional()
      .describe("Plug-in name as in Live's browser, for load"),
    names: z
      .array(z.string())
      .optional()
      .describe("Exact parameter names to read, for params"),
    search: z
      .string()
      .optional()
      .describe("For params: case-insensitive name match"),
    offset: z.coerce.number().int().min(0).optional().describe("For params"),
    limit: z.coerce
      .number()
      .int()
      .min(1)
      .optional()
      .describe("For params: default 100. The reply has `total` matches"),
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
    slot: z.coerce
      .number()
      .int()
      .min(1)
      .optional()
      .describe("For map and unmap: automation slot, from 1"),
    name: z.string().optional().describe("For map: exact parameter name"),
    index: z.coerce
      .number()
      .int()
      .min(1)
      .optional()
      .describe("For map: the plug-in's 1-based parameter index"),
    message: z
      .array(z.string())
      .optional()
      .describe("For raw: a message sent to vst~ as is (debug)"),
  },
});
