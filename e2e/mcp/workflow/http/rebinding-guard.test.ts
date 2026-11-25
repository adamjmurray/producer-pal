// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * On a Host a website could rebind to this computer (DNS rebinding), the built
 * device answers only /mcp, and only to non-browser clients. An IP literal
 * Host serves everything.
 * Doesn't open a Live Set: it only needs a running device.
 *
 * Run with: npm run e2e:mcp -- workflow/http/rebinding-guard
 */
import { request } from "node:http";
import { describe, expect, it } from "vitest";
import { MCP_URL } from "#evals/shared/mcp-url.ts";

const PORT = new URL(MCP_URL).port || "80";
const MCP_PING = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" });

/**
 * Send a request with a custom Host. fetch won't send one, so use node:http.
 * @param method - HTTP method
 * @param path - Request path
 * @param headers - Headers to send, Host included
 * @returns The status and raw body
 */
function send(
  method: string,
  path: string,
  headers: Record<string, string>,
): Promise<{ status: number; body: string }> {
  const body = method === "POST" ? MCP_PING : undefined;
  const allHeaders = {
    ...(body != null && {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    }),
    ...headers,
  };

  return new Promise((resolve, reject) => {
    const req = request(
      new URL(path, MCP_URL),
      { method, headers: allHeaders },
      (res) => {
        let text = "";

        res.setEncoding("utf8");
        res.on("data", (chunk: string) => (text += chunk));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, body: text }),
        );
      },
    );

    req.on("error", reject);
    req.end(body);
  });
}

describe("DNS rebinding guard", () => {
  it("refuses GET /config on a rebindable Host, even with no browser headers", async () => {
    const answer = await send("GET", "/config", {
      Host: `evil.example:${PORT}`,
    });

    expect(answer.status).toBe(403);
    expect(JSON.parse(answer.body)).toStrictEqual({
      error: expect.stringContaining("DNS rebinding"),
    });
  });

  it("serves POST /mcp with no browser headers on a custom Host", async () => {
    const answer = await send("POST", "/mcp", { Host: "mcp.example.com" });

    expect(answer.status).toBe(200);
  });

  it("refuses a browser POST /mcp on a custom Host", async () => {
    const answer = await send("POST", "/mcp", {
      Host: "mcp.example.com",
      Origin: "https://mcp.example.com",
    });

    expect(answer.status).toBe(403);
  });

  it("serves a browser GET /config on an IP literal Host", async () => {
    const host = `127.0.0.1:${PORT}`;
    const answer = await send("GET", "/config", {
      Host: host,
      Origin: `http://${host}`,
    });

    expect(answer.status).toBe(200);
    expect(JSON.parse(answer.body)).toHaveProperty("tools");
  });
});
