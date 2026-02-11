// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefSession = defineTool("ppal-session", {
  title: "Session Management",
  description:
    "Manage the Producer Pal session. Call with no arguments to connect to Ableton Live — required before using other ppal-* tools.",

  annotations: {
    readOnlyHint: false,
    destructiveHint: true, // write-memory is destructive
  },

  inputSchema: {
    action: z
      .enum(["connect", "read-memory", "write-memory", "search-samples"])
      .default("connect")
      .describe(
        "connect: initialize | read-memory: view | write-memory: update | search-samples: find audio",
      ),

    content: z
      .string()
      .max(10_000)
      .optional()
      .describe("notes content (required for write-memory)"),

    search: z
      .string()
      .optional()
      .describe("case-insensitive substring filter (search-samples only)"),
  },
});
