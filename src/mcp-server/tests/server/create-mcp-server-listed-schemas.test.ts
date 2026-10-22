// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it } from "vitest";
import { createMcpServer } from "#src/mcp-server/create-mcp-server.ts";
import { connectMcpClient } from "#src/mcp-server/tests/server/mcp-client-test-helpers.ts";

type Profile = NonNullable<Parameters<typeof createMcpServer>[1]>;

const PROFILES: Array<[string, Profile]> = [
  ["default", {}],
  ["small-model", { smallModelMode: true }],
  ["midi-json", { notation: "midi-json" }],
];

describe("tools/list schemas", () => {
  it.each(PROFILES)(
    "leaves $schema and a top-level additionalProperties off every tool (%s)",
    async (_label, profile) => {
      const { client, received } = await connectMcpClient(profile);
      const { tools } = await client.listTools();

      expect(tools.length).toBeGreaterThan(0);

      for (const tool of tools) {
        expect(tool.inputSchema).not.toHaveProperty("$schema");
        expect(tool.inputSchema).not.toHaveProperty("additionalProperties");
        expect(tool.inputSchema.type).toBe("object");
      }

      // The wire carries no $schema either, not just the client's parse of it.
      expect(JSON.stringify(received)).not.toContain("json-schema.org");
      expect(JSON.stringify(received)).not.toContain("additionalProperties");
    },
  );

  it("still lets an unknown argument reach the handler", async () => {
    const { client } = await connectMcpClient();
    const result = (await client.callTool({
      name: "ppal-update-track",
      arguments: { path: "t5", bogus: 1 },
    })) as CallToolResult;
    const text = result.content
      .map((part) => (part.type === "text" ? part.text : ""))
      .join("\n");

    expect(result.isError).toBeUndefined();
    expect(text).toContain("ignored unexpected argument(s): bogus");
  });

  it("builds a server with no tools registered", () => {
    expect(() =>
      createMcpServer(() => Promise.resolve({}), { tools: [] }),
    ).not.toThrow();
  });
});
