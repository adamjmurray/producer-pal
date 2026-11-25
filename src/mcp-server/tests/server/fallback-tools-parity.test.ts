// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  ListToolsRequestSchema,
  type ListToolsResult,
} from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createMcpServer } from "#src/mcp-server/create-mcp-server.ts";
import {
  buildFallbackTools,
  type FallbackToolsOptions,
  listRegisteredTools,
} from "#src/portal/fallback-tools.ts";
import { trimListedInputSchema } from "#src/tools/shared/schema/listed-input-schema.ts";

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
 * List tools through a real MCP client, which validates the result.
 * @param server - The server to list
 * @returns The tools as they came off the wire, JSON-encoded and decoded as
 *   the device's HTTP transport does
 */
async function wireTools(
  server: Pick<McpServer, "connect">,
): Promise<ListToolsResult["tools"]> {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0" });

  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ]);

  const received: unknown[] = [];
  const onmessage = clientTransport.onmessage;

  // Keep the raw message: the client's own parse may reshape it.
  clientTransport.onmessage = (message, extra) => {
    received.push(JSON.parse(JSON.stringify(message)));
    onmessage?.(message, extra);
  };

  await client.listTools();
  await client.close();

  return (received.at(-1) as { result: ListToolsResult }).result.tools;
}

/**
 * @param options - Server options
 * @returns The tools the device lists with these options
 */
async function deviceTools(
  options: FallbackToolsOptions,
): Promise<ListToolsResult["tools"]> {
  return await wireTools(createMcpServer(vi.fn(), options));
}

describe("buildFallbackTools", () => {
  it.each(VARIANTS)(
    "lists every tool exactly as the device's tools/list does (%o)",
    async (options) => {
      const device = await deviceTools(options);
      const { tools } = buildFallbackTools(options);

      expect(tools.length).toBeGreaterThan(0);
      // Whole entries, so a field the device adds later fails here.
      expect(tools).toStrictEqual(device);
      // Key order too: byte-identical to the device's JSON.
      expect(JSON.stringify(tools)).toBe(JSON.stringify(device));
    },
  );

  it.each(VARIANTS)(
    "passes a real client's validation, served as the bridge serves it (%o)",
    async (options) => {
      const server = new McpServer(
        { name: "portal", version: "0" },
        { capabilities: { tools: {} } },
      );

      // As the bridge's tools/list handler does while the device is down.
      server.server.setRequestHandler(ListToolsRequestSchema, () =>
        buildFallbackTools(options),
      );

      expect(await wireTools(server)).toStrictEqual(await deviceTools(options));
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

describe("listRegisteredTools", () => {
  it("lists fields no Producer Pal tool uses yet as tools/list does", async () => {
    const server = new McpServer({ name: "test", version: "0" });

    server.registerTool(
      "full",
      {
        title: "Full",
        description: "Every optional field",
        inputSchema: { a: z.string().default("x") },
        outputSchema: { b: z.number() },
        annotations: { readOnlyHint: true },
        _meta: { k: "v" },
      },
      () => ({ content: [] }),
    );
    server.registerTool("bare", { description: "No params, no title" }, () => ({
      content: [],
    }));
    server
      .registerTool("off", { description: "Disabled" }, () => ({ content: [] }))
      .disable();

    const device = await wireTools(server);

    // createMcpServer adds this trim to the device's listing.
    for (const tool of device) {
      trimListedInputSchema(tool.inputSchema);
    }

    expect(device.map((tool) => tool.name)).toStrictEqual(["full", "bare"]);
    expect(device[0]).toHaveProperty("outputSchema");
    expect(listRegisteredTools(server)).toStrictEqual(device);
    expect(JSON.stringify(listRegisteredTools(server))).toBe(
      JSON.stringify(device),
    );
  });
});
