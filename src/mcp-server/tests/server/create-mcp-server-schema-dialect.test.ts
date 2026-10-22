// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { createMcpServer } from "#src/mcp-server/create-mcp-server.ts";
import { connectMcpClient } from "#src/mcp-server/tests/server/mcp-client-test-helpers.ts";

type Profile = NonNullable<Parameters<typeof createMcpServer>[1]>;

const PROFILES: Array<[string, Profile]> = [
  ["default", {}],
  ["small-model", { smallModelMode: true }],
  ["midi-json", { notation: "midi-json" }],
];

describe("tools/list schema dialect", () => {
  it.each(PROFILES)(
    "leaves $schema off every tool in tools/list (%s)",
    async (_label, profile) => {
      const { client, received } = await connectMcpClient(profile);
      const { tools } = await client.listTools();

      expect(tools.length).toBeGreaterThan(0);

      for (const tool of tools) {
        expect(tool.inputSchema).not.toHaveProperty("$schema");
        expect(tool.inputSchema.type).toBe("object");
      }

      // The wire carries no $schema either, not just the client's parse of it.
      expect(JSON.stringify(received)).not.toContain("json-schema.org");
    },
  );

  it("builds a server with no tools registered", () => {
    expect(() =>
      createMcpServer(() => Promise.resolve({}), { tools: [] }),
    ).not.toThrow();
  });
});
