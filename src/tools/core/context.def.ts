// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";

export const toolDefContext = defineTool("ppal-context", {
  title: "Context",
  description: {
    default:
      "Read or write user context/memory.\n" +
      "scope=project (default): facts about THIS Live Set. scope=global " +
      "(~/.producer-pal/context.md): pinned cross-project context. Both are " +
      "single documents — actions: read, write (replace).\n" +
      "scope=memory (~/.producer-pal/memory/): indexed memories, loaded on " +
      "demand. Actions: remember (save/update: name+content), " +
      "forget (delete by name), list (the index), read (name → one memory).\n" +
      "Reuse an existing name to UPDATE, not duplicate. One fact per memory. " +
      "write/remember/forget are destructive — read the same scope first.",
    smallModel:
      "Read or write user context.\n" +
      "scope=project (default): facts about THIS Live Set. scope=global: " +
      "pinned cross-project context. Actions: read, write (replace the whole " +
      "document).\n" +
      "write is destructive — read the same scope first.",
  },

  annotations: {
    readOnlyHint: false,
    destructiveHint: true, // write/remember/forget mutate stored content
  },

  inputSchema: {
    action: param(
      z
        .enum(["read", "write", "remember", "forget", "list"])
        // Default required so the smallModel excludeEnumValues override can
        // filter it — filterEnumValues only accepts a schema with a top-level
        // .default(). Matches library.ts's action param. "read" is the safe,
        // non-destructive fallback; large models are always taught to pass
        // action explicitly, so this default is inert for them.
        .optional()
        .default("read"),
      {
        default: "read | write | remember | forget | list",
        smallModel: {
          description: "read | write",
          excludeEnumValues: ["remember", "forget", "list"],
        },
      },
    ),

    scope: param(
      z
        .enum(["project", "global", "memory"])
        .optional()
        // Default required so the smallModel excludeEnumValues override can
        // filter it (see action above); "project" already matches the
        // documented default.
        .default("project"),
      {
        default:
          "project (default): this Live Set | global: pinned user context | memory: indexed user memories",
        smallModel: {
          description:
            "project (default): this Live Set | global: pinned user context",
          excludeEnumValues: ["memory"],
        },
      },
    ),

    content: param(z.string().max(10_000).optional(), {
      default: "write: full context.md | remember: the memory body (the fact)",
      smallModel: "write: the full document content",
    }),

    name: param(z.string().max(200).optional(), {
      default: "entry name (read, remember, forget — memory scope)",
      smallModel: null,
    }),

    description: param(z.string().max(500).optional(), {
      default: "one-line recall hook shown in the index (remember)",
      smallModel: null,
    }),
  },
});
