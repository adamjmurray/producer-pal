// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi, type Mock } from "vitest";
import { type McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type ZodRawShape, type ZodType } from "zod";
import { type McpOptions } from "#src/tools/shared/tool-framework/define-tool.ts";
import { toolDefContext } from "../context.def.ts";

type MockServer = McpServer & { registerTool: Mock };

/**
 * Register toolDefContext with a mock server and return the registered config.
 * @param options - small-model/notation mode to register under
 * @returns the config object passed to server.registerTool
 */
function registerContext(options?: McpOptions): Record<string, unknown> {
  const mockServer = {
    registerTool: vi.fn(),
  } as unknown as MockServer;

  toolDefContext(mockServer, vi.fn(), options);

  return mockServer.registerTool.mock.calls[0]![1] as Record<string, unknown>;
}

/**
 * Read the schema shape's param descriptions from a registered config.
 * @param config - the config object returned by registerContext
 * @returns the param names mapped to their description/enum-values
 */
function getShape(
  config: Record<string, unknown>,
): Record<string, { description?: string; options?: string[] }> {
  const shape = (config.inputSchema as { shape: ZodRawShape }).shape;

  return shape as unknown as Record<
    string,
    { description?: string; options?: string[] }
  >;
}

/**
 * Read a param's enum options by unwrapping .default()/.optional() wrappers.
 * @param schema - the param's Zod schema
 * @returns the enum's option values
 */
function enumOptions(schema: ZodType): string[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- unwrap chained zod wrappers to read the enum options
  let current: any = schema;

  while (current?.def?.innerType) {
    current = current.def.innerType;
  }

  return current.options as string[];
}

describe("ppal-context modal config — default (large-model) mode", () => {
  it("keeps the description and schema byte-identical to the base text", () => {
    const config = registerContext();

    expect(config.description).toBe(
      "Read or write user context/memory.\n" +
        "scope=project (default): facts about THIS Live Set. scope=global " +
        "(~/.producer-pal/context.md): pinned cross-project context. Both are " +
        "single documents — actions: read, write (replace).\n" +
        "scope=memory (~/.producer-pal/memory/): indexed memories, loaded on " +
        "demand. Actions: remember (save/update: name+description+content), " +
        "forget (delete by name), list (the index), read (name → one memory).\n" +
        "Reuse an existing name to UPDATE, not duplicate. One fact per memory. " +
        "write/remember/forget are destructive — read the same scope first.",
    );

    const shape = getShape(config);

    expect(Object.keys(shape)).toStrictEqual([
      "action",
      "scope",
      "content",
      "name",
      "description",
    ]);
    expect(enumOptions(shape.action as unknown as ZodType)).toStrictEqual([
      "read",
      "write",
      "remember",
      "forget",
      "list",
    ]);
    expect(enumOptions(shape.scope as unknown as ZodType)).toStrictEqual([
      "project",
      "global",
      "memory",
    ]);
  });
});

describe("ppal-context modal config — small-model mode", () => {
  it("narrows action to read | write", () => {
    const config = registerContext({ smallModelMode: true });
    const shape = getShape(config);

    expect(enumOptions(shape.action as unknown as ZodType)).toStrictEqual([
      "read",
      "write",
    ]);
    expect(shape.action?.description).toBe("read | write");
  });

  it("narrows scope to project | global", () => {
    const config = registerContext({ smallModelMode: true });
    const shape = getShape(config);

    expect(enumOptions(shape.scope as unknown as ZodType)).toStrictEqual([
      "project",
      "global",
    ]);
  });

  it("hides name and description", () => {
    const config = registerContext({ smallModelMode: true });
    const shape = getShape(config);

    expect(Object.keys(shape)).toStrictEqual(["action", "scope", "content"]);
  });

  it("overrides the content description to drop the remember clause", () => {
    const config = registerContext({ smallModelMode: true });
    const shape = getShape(config);

    expect(shape.content?.description).toBe("write: the full document content");
  });

  it("uses the shorter blobs-only tool description", () => {
    const config = registerContext({ smallModelMode: true });

    expect(config.description).toBe(
      "Read or write user context.\n" +
        "scope=project (default): facts about THIS Live Set. scope=global: " +
        "pinned cross-project context. Actions: read, write (replace the whole " +
        "document).\n" +
        "write is destructive — read the same scope first.",
    );
  });
});
