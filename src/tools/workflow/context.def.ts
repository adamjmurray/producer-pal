// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefContext = defineTool("ppal-context", {
  title: "Context",
  description:
    "Read/write project memory or search configured sample folder for audio files",

  annotations: {
    readOnlyHint: false,
    destructiveHint: true, // write is destructive
  },

  inputSchema: {
    action: z
      .enum(["read", "write", "search"])
      .describe(
        "read: view memory | write: update memory | search: find audio samples",
      ),

    content: z
      .string()
      .max(10_000)
      .optional()
      .describe("content to write (required for write)"),

    search: z
      .string()
      .optional()
      .describe("case-insensitive substring filter (search only)"),
  },
});
