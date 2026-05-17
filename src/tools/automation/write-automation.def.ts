// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefWriteAutomation = defineTool("ppal-write-automation", {
  title: "Write Automation",
  description:
    "Write clip automation envelope breakpoints for a device parameter. Use only with a saved Live set.",

  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
  },

  inputSchema: {
    clipPath: z.string().describe("clip path (e.g. 'scene0/slot0')"),
    devicePath: z.string().describe("device path (e.g. 't0/d0')"),
    parameter: z.coerce.string().describe("parameter name or index"),
    breakpoints: z
      .string()
      .describe(
        "one 'time=value' per line, time in beats from clip start, value in raw parameter units",
      ),
    clear: z.coerce
      .boolean()
      .optional()
      .describe("clear existing envelope first (default true)"),
  },
});
