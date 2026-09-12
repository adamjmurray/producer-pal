// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect, it } from "vitest";
import { type ZodType } from "zod";
import { resolveToolSchema } from "#src/tools/shared/tool-framework/resolve-tool-schema.ts";
import { TOOL_DEF_CASES } from "./tool-defs-test-helpers.ts";

// Models send both strings and numbers, and the MCP SDK validates before our
// handler runs — so a param that coerces in one tool and not in the next takes
// the call down depending on which tool the model reached for. This pins every
// shared param name to one answer. What it catches is always the same slip: a
// `z.string()` where the tool next door wrote `z.coerce.string()`.
//
// Hidden params are included. A retired name a caller still scripts against has
// to behave like the name that replaced it.

/**
 * Whether a schema takes this value's type at all. A range or enum complaint
 * means the type got through, so only `invalid_type` counts as a refusal.
 * @param schema - The param schema
 * @param value - A value of the type being probed
 * @returns True when the type is accepted
 */
function takesType(schema: ZodType, value: unknown): boolean {
  const result = schema.safeParse(value);

  return (
    result.success ||
    !result.error.issues.some((issue) => issue.code === "invalid_type")
  );
}

it("coerces a param name the same way in every tool", () => {
  // param name -> "takes a string / takes a number" -> the tools that do that
  const byName = new Map<string, Map<string, Set<string>>>();

  for (const [label, def, context] of TOOL_DEF_CASES) {
    const { validating } = resolveToolSchema(
      def.toolOptions.inputSchema,
      context,
    );

    for (const [name, schema] of Object.entries(validating)) {
      const kind = `string: ${takesType(schema, "5")}, number: ${takesType(schema, 5)}`;
      const kinds = byName.get(name) ?? new Map<string, Set<string>>();

      byName.set(name, kinds);
      kinds.set(kind, (kinds.get(kind) ?? new Set()).add(label));
    }
  }

  const mismatches = [...byName]
    .filter(([, kinds]) => kinds.size > 1)
    .map(
      ([name, kinds]) =>
        `${name} — ` +
        [...kinds]
          .map(([kind, labels]) => `${kind}: ${[...labels].join(", ")}`)
          .join(" | "),
    );

  expect(mismatches, "same param name, different coercion").toStrictEqual([]);
});
