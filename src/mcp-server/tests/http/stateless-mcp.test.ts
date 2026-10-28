// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it } from "vitest";
import {
  methodNotAllowed,
  startStatelessMcpServer,
  type StatelessMcpServer,
} from "#src/mcp-server/helpers/http/stateless-mcp.ts";

describe("startStatelessMcpServer", () => {
  let running: StatelessMcpServer | undefined;

  afterEach(async () => {
    await running?.close();
    running = undefined;
  });

  it("serves a fresh MCP server per request on an ephemeral port", async () => {
    let built = 0;

    running = await startStatelessMcpServer(() => {
      built++;

      const server = new McpServer({ name: "test", version: "1.0.0" });

      server.registerTool("ping", { description: "Ping." }, () => ({
        content: [{ type: "text" as const, text: "pong" }],
      }));

      return server;
    });

    const client = new Client({ name: "test-client", version: "1.0.0" });

    await client.connect(
      new StreamableHTTPClientTransport(new URL(running.url)),
    );

    const result = await client.callTool({ name: "ping" });

    expect(result.content).toStrictEqual([{ type: "text", text: "pong" }]);
    expect(built).toBeGreaterThan(1);
    await client.close();
  });

  it("answers GET and DELETE with 405", async () => {
    running = await startStatelessMcpServer(
      () => new McpServer({ name: "test", version: "1.0.0" }),
    );

    for (const method of ["GET", "DELETE"]) {
      const response = await fetch(running.url, { method });

      expect(response.status).toBe(405);
      expect(await response.json()).toStrictEqual(methodNotAllowed);
    }
  });

  it("rejects close when the server is already stopped", async () => {
    const server = await startStatelessMcpServer(
      () => new McpServer({ name: "test", version: "1.0.0" }),
    );

    await server.close();
    await expect(server.close()).rejects.toThrow("not running");
  });
});
