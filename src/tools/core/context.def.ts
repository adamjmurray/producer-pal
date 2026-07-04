// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";

export const toolDefContext = defineTool("ppal-context", {
  title: "Context",
  description:
    "Read or write user context/memory/skills.\n" +
    "scope=project (default): facts about THIS Live Set (single blob). " +
    "scope=global (~/.producer-pal): cross-project user memory.\n" +
    "Global actions: read (name → one memory; no name → pinned context.md), " +
    "write (replace context.md), remember (save/update a memory: name+type+content), " +
    "forget (delete by name), list (the memory index).\n" +
    "scope=skills (~/.producer-pal): user-authored skills (instruction packs) " +
    "loaded on demand. Actions: read (name → a skill's instructions), " +
    "remember (save/update: name+content+description), forget, list. " +
    "Create or edit a skill only when the user asks.\n" +
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
      .enum(["project", "global", "skills"])
      .optional()
      .describe(
        "project (default): this Live Set | global: user memory & context | skills: user-authored skills",
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
        "entry name (read one, remember, forget — global memory & skills scopes)",
      ),

    type: z
      .enum(["user", "feedback", "goal", "reference"])
      .optional()
      .describe(
        "memory bucket (remember): user=who they are | feedback=how to work with them | goal=cross-project creative goal | reference=external pointer",
      ),

    description: z
      .string()
      .max(500)
      .optional()
      .describe("one-line recall hook shown in the index (remember)"),
  },
});
