// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  internalError,
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

  it("answers 500 when serving a request fails, without an unhandled rejection", async () => {
    const unhandled = vi.fn();

    process.on("unhandledRejection", unhandled);

    try {
      running = await startStatelessMcpServer(() => {
        const server = new McpServer({ name: "test", version: "1.0.0" });

        server.connect = () => Promise.reject(new Error("connect failed"));

        return server;
      });

      const response = await fetch(running.url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
      });

      expect(response.status).toBe(500);
      expect(await response.json()).toStrictEqual(
        internalError("connect failed"),
      );
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("ignores a failed close after the response", async () => {
    const unhandled = vi.fn();
    const closed = vi.fn();
    const transportClose = vi
      .spyOn(StreamableHTTPServerTransport.prototype, "close")
      .mockRejectedValue(new Error("transport close failed"));

    process.on("unhandledRejection", unhandled);

    try {
      running = await startStatelessMcpServer(() => {
        const server = new McpServer({ name: "test", version: "1.0.0" });

        server.close = () => {
          closed();

          return Promise.reject(new Error("close failed"));
        };

        return server;
      });

      const response = await fetch(running.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }),
      });

      await response.text();
      await vi.waitFor(() => expect(closed).toHaveBeenCalled());
      expect(transportClose).toHaveBeenCalled();
      await new Promise((resolve) => setImmediate(resolve));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      transportClose.mockRestore();
      process.off("unhandledRejection", unhandled);
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
