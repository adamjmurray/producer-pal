// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type ListToolsResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";
import { createMcpServer } from "#src/mcp-server/create-mcp-server.ts";
import { connectClient } from "#src/mcp-server/tests/server/mcp-client-test-helpers.ts";
import {
  buildFallbackTools,
  type FallbackToolsOptions,
} from "#src/portal/fallback-tools.ts";

// A client that lists tools while Live is unreachable caches the offline list,
// so it must match what the device lists once it's up.

const VARIANTS: FallbackToolsOptions[] = [
  {},
  { smallModelMode: true },
  { liveApiEnabled: true },
  { smallModelMode: true, liveApiEnabled: true },
  { notation: "midi-json" },
  { notation: "stark" },
];

interface JsonSchemaObject {
  properties?: Record<string, { default?: unknown }>;
  required?: string[];
}

/**
 * List tools through a real MCP client on a server built with these options.
 * @param options - Server options
 * @returns The tools as they came off the wire
 */
async function deviceTools(
  options: FallbackToolsOptions,
): Promise<ListToolsResult["tools"]> {
  const server = createMcpServer(vi.fn(), options);
  const { client, clientTransport } = await connectClient(server);
  const received: unknown[] = [];
  const onmessage = clientTransport.onmessage;

  // Keep the raw message: the client's own parse may reshape it.
  clientTransport.onmessage = (message, extra) => {
    received.push(structuredClone(message));
    onmessage?.(message, extra);
  };

  await client.listTools();
  await client.close();

  return (received.at(-1) as { result: ListToolsResult }).result.tools;
}

/**
 * @param tools - Listed tools
 * @returns The fields the fallback list carries, per tool
 */
function listed(
  tools: {
    name: string;
    title?: string;
    description?: string;
    inputSchema: object;
  }[],
): object[] {
  return tools.map(({ name, title, description, inputSchema }) => ({
    name,
    title,
    description,
    inputSchema,
  }));
}

describe("buildFallbackTools", () => {
  it.each(VARIANTS)(
    "lists every tool exactly as the device's tools/list does (%o)",
    async (options) => {
      const device = await deviceTools(options);
      const { tools } = buildFallbackTools(options);

      expect(tools.length).toBeGreaterThan(0);
      expect(listed(tools)).toStrictEqual(listed(device));
    },
  );

  it.each(VARIANTS)(
    "never lists a param with a default as required (%o)",
    (options) => {
      const { tools } = buildFallbackTools(options);
      let defaulted = 0;

      for (const tool of tools) {
        const schema = tool.inputSchema as JsonSchemaObject;
        const required = new Set(schema.required ?? []);

        for (const [param, prop] of Object.entries(schema.properties ?? {})) {
          if ("default" in prop) {
            defaulted++;
            expect(required.has(param), `${tool.name}.${param}`).toBe(false);
          }
        }
      }

      // Guards against the check passing because nothing has a default.
      expect(defaulted).toBeGreaterThan(0);
    },
  );

  it("leaves ppal-library's action and kind optional", () => {
    const library = buildFallbackTools().tools.find(
      (tool) => tool.name === "ppal-library",
    );
    const schema = library?.inputSchema as JsonSchemaObject;

    expect(schema.properties).toHaveProperty("action");
    expect(schema.properties).toHaveProperty("kind");
    expect(schema.required ?? []).not.toContain("action");
    expect(schema.required ?? []).not.toContain("kind");
  });
});
