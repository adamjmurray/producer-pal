// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { TOOL_NAMES } from "#src/mcp-server/create-mcp-server.ts";
import { getManifestTools } from "./desktop-extension-tools.ts";

describe("getManifestTools", () => {
  it("names the tools by id, matching TOOL_NAMES", () => {
    const names = getManifestTools().map((tool) => tool.name);

    expect(names).toStrictEqual([...TOOL_NAMES]);
    expect(names.every((name) => name.startsWith("ppal-"))).toBe(true);
  });

  it("gives every tool a one-line description", () => {
    for (const tool of getManifestTools()) {
      expect(tool.description).not.toBe("");
      expect(tool.description).not.toContain("\n");
    }
  });
});
