// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";
import { defineTool } from "#src/tools/shared/tool-framework/define-tool.ts";
import { param } from "#src/tools/shared/tool-framework/modal-config.ts";

export const toolDefContext = defineTool("ppal-context", {
  title: "Context",
  // Mechanical only: what each scope is, what each action does, how to address
  // a memory by name. The behavioral discipline (confirm before writing the
  // user-owned context layers; manage memory freely; avoid duplicate entries;
  // write precise recall hooks) lives in the customizable skills, not here — so
  // a user tuning their skills can't contradict a hardcoded rule in the schema.
  description: {
    default:
      "The user's persistent context and memory. `scope` picks the layer, " +
      "`action` reads or writes it. Prefer read before any write/delete.",
    smallModel:
      "The user's persistent context. `scope` picks the layer, `action` reads " +
      "or writes it. Read before you write.",
  },

  annotations: {
    readOnlyHint: false,
    destructiveHint: true, // write replaces, delete removes stored content
  },

  inputSchema: {
    action: param(
      z
        .enum(["read", "write", "delete"])
        // Default required so the smallModel excludeEnumValues override can
        // filter it — filterEnumValues only accepts a schema with a top-level
        // .default(). Matches library.ts's action param. "read" is the safe,
        // non-destructive fallback; large models are always taught to pass
        // action explicitly, so this default is inert for them.
        .optional()
        .default("read"),
      {
        default:
          "read (default): project/global → the document; memory → the entry " +
          "named `name`, or the whole index if no `name`. write: replace the " +
          "document, or create/update the memory entry `name`. delete: remove " +
          "the memory entry `name`.",
        smallModel: {
          description: "read (default): the document. write: replace it.",
          excludeEnumValues: ["delete"],
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
          "project (default): facts about THIS Live Set (genre, song " +
          "structure), always in its context. global: who the user is across " +
          "ALL projects (style, preferences, high-level goals), always in " +
          "context. memory: durable facts and rules that matter only in " +
          "CERTAIN situations, loaded on demand by name.",
        smallModel: {
          description:
            "project (default): facts about THIS Live Set. global: who the " +
            "user is across all projects (style, preferences, goals).",
          excludeEnumValues: ["memory"],
        },
      },
    ),

    content: param(z.string().max(10_000).optional(), {
      default:
        "Text to write — project/global: the whole document; memory: the " +
        "entry body (one fact).",
      smallModel: "The full document text to write.",
    }),

    name: param(z.string().max(200).optional(), {
      default:
        "Memory entry name (read/write/delete on scope:memory). Reuse a name " +
        "to update, not duplicate.",
      smallModel: null,
    }),

    description: param(z.string().max(500).optional(), {
      default:
        "Memory entry's one-line recall hook for the index — what's inside and " +
        "when it's relevant. Required on a memory write.",
      smallModel: null,
    }),

    // The escape hatch for the clobber guard (context-helpers.ts's
    // clobberWarning), and deliberately NOT taught in the skills: the model
    // learns of it from the warning, at the moment it is relevant, so it never
    // reaches for it casually. Declared in EVERY mode — including small-model,
    // where it costs a few tokens — because a guard whose only way out is hidden
    // from the tier that hits it would deadlock the write, which is worse than
    // the clobber it prevents.
    force: z
      .boolean()
      .optional()
      .describe(
        "Only when a write was skipped for dropping the whole document: " +
          "true replaces it anyway.",
      ),
  },
});
