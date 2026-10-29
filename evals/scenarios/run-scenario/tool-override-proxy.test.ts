// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connectMcp } from "#evals/chat/mcp.ts";
import {
  startStatelessMcpServer,
  type StatelessMcpServer,
} from "#src/mcp-server/helpers/http/stateless-mcp.ts";
import {
  startToolOverrideProxy,
  type ToolOverrides,
} from "./tool-override-proxy.ts";

const SCHEMA = {
  type: "object" as const,
  properties: { versionCheck: { type: "boolean" } },
  additionalProperties: false,
};
const REAL = [{ type: "text" as const, text: "real" }];

/** Arguments the real server received. */
let received: unknown[] = [];
let upstream: StatelessMcpServer;
let proxy: StatelessMcpServer | undefined;

beforeEach(async () => {
  received = [];
  upstream = await startStatelessMcpServer(() => {
    const mcp = new McpServer(
      { name: "real", version: "9.9.9" },
      { capabilities: { tools: {} }, instructions: "real instructions" },
    );

    mcp.server.setRequestHandler(ListToolsRequestSchema, () => ({
      tools: [
        { name: "a-tool", description: "A", inputSchema: SCHEMA },
        { name: "b-tool", description: "B", inputSchema: SCHEMA },
      ],
    }));
    mcp.server.setRequestHandler(CallToolRequestSchema, (request) => {
      received.push(request.params.arguments);

      return request.params.name === "b-tool"
        ? { content: [{ type: "text", text: "Error: no" }], isError: true }
        : { content: REAL };
    });

    return mcp;
  });
});

afterEach(async () => {
  await proxy?.close();
  await upstream.close();
  proxy = undefined;
});

/**
 * @param overrides - The proxy's overrides
 * @returns A client connected to a proxy in front of the fake server
 */
async function clientFor(
  overrides: ToolOverrides,
): Promise<Awaited<ReturnType<typeof connectMcp>>["client"]> {
  proxy = await startToolOverrideProxy(upstream.url, overrides);

  const { client } = await connectMcp(proxy.url);

  return client;
}

describe("startToolOverrideProxy", () => {
  it("lists the real tools and schemas unchanged", async () => {
    const { client: direct } = await connectMcp(upstream.url);
    const real = await direct.listTools();
    const client = await clientFor({});

    expect(await client.listTools()).toStrictEqual(real);
    expect(client.getServerVersion()?.name).toBe("real");
    expect(client.getInstructions()).toBe("real instructions");
  });

  it("forwards a call with no override, error flag included", async () => {
    const client = await clientFor({ "a-tool": () => [] });

    expect(
      await client.callTool({ name: "b-tool", arguments: { x: 1 } }),
    ).toStrictEqual({
      content: [{ type: "text", text: "Error: no" }],
      isError: true,
    });
    expect(received).toStrictEqual([{ x: 1 }]);
  });

  it("answers an override's result without calling the real server", async () => {
    const canned = [{ type: "text", text: "canned" }];
    const client = await clientFor({ "a-tool": () => canned });

    expect(
      await client.callTool({ name: "a-tool", arguments: {} }),
    ).toStrictEqual({ content: canned });
    expect(received).toStrictEqual([]);
  });

  it("gives an override the args and a callReal that reaches the real server", async () => {
    const client = await clientFor({
      "a-tool": async (args, callReal) => [
        ...(await callReal()),
        { type: "text", text: JSON.stringify(args) },
      ],
    });
    const result = await client.callTool({
      name: "a-tool",
      arguments: { versionCheck: true },
    });

    expect(result.content).toStrictEqual([
      ...REAL,
      { type: "text", text: '{"versionCheck":true}' },
    ]);
    expect(received).toStrictEqual([{ versionCheck: true }]);
  });

  it("keeps the error flag of a real call an override passes through", async () => {
    const client = await clientFor({
      "b-tool": (_args, callReal) => callReal(),
    });
    const result = await client.callTool({ name: "b-tool", arguments: {} });

    expect(result.isError).toBe(true);
  });

  it("stops serving on close", async () => {
    const started = await startToolOverrideProxy(upstream.url, {});

    await started.close();

    await expect(fetch(started.url, { method: "POST" })).rejects.toThrow(
      /fetch failed/,
    );
  });
});
