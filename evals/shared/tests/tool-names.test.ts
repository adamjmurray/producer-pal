// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { TOOL_NAMES } from "#src/mcp-server/create-mcp-server.ts";
import { TOOLS } from "#evals/shared/tool-names.ts";

describe("TOOLS", () => {
  it("lists exactly the registered tools", () => {
    expect(Object.values(TOOLS).toSorted()).toStrictEqual(
      TOOL_NAMES.toSorted(),
    );
  });

  it("keys each tool by its camelCased name", () => {
    for (const [key, name] of Object.entries(TOOLS)) {
      const camel = name
        .replace(/^ppal-/, "")
        .replaceAll(/-(\w)/g, (_m, c: string) => c.toUpperCase());

      expect(key).toBe(camel);
    }
  });
});
