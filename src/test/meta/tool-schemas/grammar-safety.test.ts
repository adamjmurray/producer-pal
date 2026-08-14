// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { GBNF_REPETITION_LIMIT } from "#src/tools/shared/tool-framework/bounded-string.ts";

// llama.cpp-based runtimes compile every tool's JSON Schema into one GBNF
// grammar, turning a length constraint into a repetition (`char{0,n}`) and
// rejecting the whole grammar above MAX_REPETITION_THRESHOLD. One oversized
// param therefore breaks tool calling for ALL tools. Use boundedString() for
// caps at or above the limit and state them in the description. See ADR-0021.
const REPETITION_KEYWORDS = new Set(["maxLength", "maxItems"]);

// The `code` params only exist when this flag is on, and it is read when the
// tool defs load — so stub it before importing them.
vi.stubEnv("ENABLE_CODE_EXEC", "true");
const { STANDARD_TOOL_DEFS } =
  await import("#src/mcp-server/create-mcp-server.ts");
const { toolDefLiveApi } = await import("#src/tools/advanced/live-api.def.ts");

vi.unstubAllEnvs();

const TOOL_DEFS = [...STANDARD_TOOL_DEFS, toolDefLiveApi];

describe("tool schema grammar safety", () => {
  it.each(TOOL_DEFS.map((def) => [def.toolName, def] as const))(
    "%s has no length constraint a GBNF grammar would reject",
    (_name, def) => {
      const schema = z.toJSONSchema(
        z.object(def.toolOptions.inputSchema).loose(),
      );

      expect(oversizedConstraints(schema, "")).toStrictEqual([]);
    },
  );

  it("covers the code params, which are build-flag gated", () => {
    const codeTools = TOOL_DEFS.filter(
      (def) => "code" in def.toolOptions.inputSchema,
    ).map((def) => def.toolName);

    expect(codeTools).toStrictEqual([
      "ppal-create-clip",
      "ppal-update-clip",
      "ppal-duplicate",
    ]);
  });
});

function oversizedConstraints(node: unknown, path: string): string[] {
  if (node == null || typeof node !== "object") return [];

  if (Array.isArray(node)) {
    return node.flatMap((item, i) =>
      oversizedConstraints(item, `${path}[${i}]`),
    );
  }

  return Object.entries(node).flatMap(([key, value]) => {
    const here = `${path}.${key}`;
    const oversized =
      REPETITION_KEYWORDS.has(key) &&
      typeof value === "number" &&
      value >= GBNF_REPETITION_LIMIT;

    return oversized
      ? [`${here} = ${String(value)}`]
      : oversizedConstraints(value, here);
  });
}
