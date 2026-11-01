// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Every write tool trims a string arg the same way whether it is one value or
// a list entry: spaces around any of them change nothing that gets written.

import { type ZodType } from "zod";
import { describe, expect, it } from "vitest";
import { STANDARD_TOOL_DEFS } from "#src/mcp-server/create-mcp-server.ts";
import { ADAPTERS } from "./write-conformance-adapters.ts";
import { freshLive, runTool, writesMade } from "./write-conformance-support.ts";
import {
  type Scenario,
  type ToolArgs,
  type WriteToolAdapter,
} from "./write-conformance-types.ts";

describe.each(ADAPTERS.filter((adapter) => adapter.many != null))(
  "trim: $tool",
  (adapter) => {
    it.each([1, 2])("%i targets: padded strings write the same", async (n) => {
      const many = adapter.many as (n: number) => Scenario;
      const plain = await callWith(adapter, () => many(n).args);
      const padded = await callWith(adapter, () =>
        padStrings(adapter.tool, many(n).args),
      );

      expect(padded).toStrictEqual(plain);
    });
  },
);

/**
 * Run a call on a fresh Live Set.
 * @param adapter - The tool
 * @param build - Sets up the mocks and returns the call's args
 * @returns What the tool returned and wrote
 */
async function callWith(
  adapter: WriteToolAdapter,
  build: () => ToolArgs,
): Promise<{ result: unknown; writes: unknown[] }> {
  freshLive();
  const result = await runTool(adapter, build());

  return { result, writes: writesMade() };
}

/**
 * Put spaces around every free-text string arg. Enums are left alone: the
 * schema refuses a padded one before the tool runs.
 * @param tool - The tool's name, to look up its schema
 * @param args - The call
 * @returns The call with its strings padded
 */
function padStrings(tool: string, args: ToolArgs): ToolArgs {
  const schema = STANDARD_TOOL_DEFS.find((def) => def.toolName === tool)
    ?.toolOptions.inputSchema;

  return Object.fromEntries(
    Object.entries(args).map(([key, value]) => [
      key,
      typeof value === "string" && isString(schema?.[key])
        ? `  ${value} `
        : value,
    ]),
  );
}

/**
 * Whether a param takes free text, under any optional or default wrapper.
 * @param schema - The param's schema
 * @returns True for a string param
 */
function isString(schema: ZodType | undefined): boolean {
  let inner = schema?.def as { type: string; innerType?: ZodType } | undefined;

  while (inner?.innerType != null) {
    inner = inner.innerType.def as typeof inner;
  }

  return inner?.type === "string";
}
