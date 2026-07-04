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
    "scope=project (default): facts about THIS Live Set (single blob). " +
    "scope=global (~/.producer-pal): cross-project user memory.\n" +
    "Global actions: read (name → one memory; no name → pinned context.md), " +
    "write (replace context.md), remember (save/update a memory: name+type+content), " +
    "forget (delete by name), list (the memory index).\n" +
    "Reuse an existing name to UPDATE, not duplicate. One fact per memory. " +
    "write/remember/forget are destructive — read the same scope first.",

  annotations: {
    readOnlyHint: false,
    destructiveHint: true, // write/remember/forget mutate stored content
  },

  inputSchema: {
    action: z
      .enum(["read", "write", "remember", "forget", "list"])
      .describe("read | write | remember | forget | list"),

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
      .describe(
        "write: full context.md | remember: the memory body (the fact)",
      ),

    name: z
      .string()
      .max(200)
      .optional()
      .describe(
        "memory entry name (read one, remember, forget — global scope)",
      ),

    type: z
      .enum(["user", "feedback", "project", "reference"])
      .optional()
      .describe(
        "memory bucket (remember): user=who they are | feedback=how to work with them | project=cross-project goal | reference=external pointer",
      ),

    description: z
      .string()
      .max(500)
      .optional()
      .describe("one-line recall hook shown in the index (remember)"),
  },
});
