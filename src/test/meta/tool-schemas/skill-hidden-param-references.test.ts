// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude Code (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { builtinFragments } from "#src/skills/builtin-fragments.ts";
import { resolveToolSchema } from "#src/tools/shared/tool-framework/resolve-tool-schema.ts";
import { TOOL_DEFS } from "./tool-defs-test-helpers.ts";

// A Skill that teaches a deprecated param sends the model to a name no tool
// publishes. Only camelCase names are checked: the plain-word ones (`count`,
// `slot`, `split`) are ordinary English in Skill prose.

describe("Skill param references", () => {
  it("names no param that every tool has deprecated", () => {
    const deprecated = deprecatedCamelCaseParams();
    const found = Object.entries(builtinFragments(true)).flatMap(
      ([fragment, body]) =>
        deprecated
          .filter((name) => new RegExp(`\\b${name}\\b`).test(body))
          .map((name) => `${fragment} names \`${name}\``),
    );

    expect(found).toStrictEqual([]);
  });

  it("has deprecated names to look for", () => {
    // Guards the test above against passing because nothing was collected.
    expect(deprecatedCamelCaseParams()).toContain("arrangementStart");
  });
});

/**
 * The camelCase params some tool deprecated and no tool publishes.
 * @returns Param names, sorted
 */
function deprecatedCamelCaseParams(): string[] {
  const context = { notation: "barbeat", smallModelMode: false } as const;
  const published = new Set<string>();
  const deprecated = new Set<string>();

  for (const def of TOOL_DEFS) {
    const resolved = resolveToolSchema(def.toolOptions.inputSchema, context);

    for (const name of Object.keys(resolved.published)) {
      published.add(name);
    }

    for (const [name, info] of Object.entries(resolved.hidden)) {
      if (info.kind === "deprecated") {
        deprecated.add(name);
      }
    }
  }

  return [...deprecated]
    .filter((name) => /[A-Z]/.test(name) && !published.has(name))
    .toSorted();
}
