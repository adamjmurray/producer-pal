// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefContext = defineTool("ppal-context", {
  title: "Context",
  description:
    "Read or write user context/memory.\n" +
    "scope=project (default): facts about THIS Live Set. " +
    "scope=global: facts that apply across ALL projects (~/.producer-pal/context.md).\n" +
    "CRITICAL: Writes replace the entire context for that scope. " +
    "Always read the same scope first because the user may have edited it out-of-band, and unread changes will be silently lost.",

  annotations: {
    readOnlyHint: false,
    destructiveHint: true, // write is destructive
  },

  inputSchema: {
    action: z
      .enum(["read", "write"])
      .describe("read: view context | write: replace context"),

    scope: z
      .enum(["project", "global"])
      .optional()
      .describe(
        "project (default): this Live Set | global: all projects & sessions",
      ),

    content: z
      .string()
      .max(10_000)
      .optional()
      .describe("content to write (required for write)"),
  },
});
