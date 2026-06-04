// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefContext = defineTool("ppal-context", {
  title: "Context",
  description:
    "Read or write project memory.\n" +
    "CRITICAL: Writes replace the entire memory. " +
    "Always read first because the user may have edited memory out-of-band, and unread changes will be silently lost.",

  annotations: {
    readOnlyHint: false,
    destructiveHint: true, // write is destructive
  },

  inputSchema: {
    action: z
      .enum(["read", "write"])
      .describe("read: view memory | write: replace memory"),

    content: z
      .string()
      .max(10_000)
      .optional()
      .describe("content to write (required for write)"),
  },
});
