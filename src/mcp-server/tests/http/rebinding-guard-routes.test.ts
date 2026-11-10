// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { request } from "node:http";
import { describe, expect, it } from "vitest";
import { setupExpressAppServer } from "../express-app-test-helpers.ts";

interface Answer {
  status: number;
  body: string;
}

const MCP_PING = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" });
const REBINDABLE_HOSTS = ["evil.example:3350", "mcp.example.com"];

describe("DNS rebinding guard on the Express app", () => {
  const appState = setupExpressAppServer();

  /**
   * Send a request with a custom Host and a raw path. fetch won't send a custom
   * Host, and a URL string would resolve `..`, so pass node:http the parts.
   * @param method - HTTP method
   * @param path - Raw request path
   * @param headers - Headers to send, Host included
   * @returns The status and raw body
   */
  function send(
    method: string,
    path: string,
    headers: Record<string, string>,
  ): Promise<Answer> {
    const body = method === "POST" ? MCP_PING : undefined;
    const port = Number(new URL(appState.baseUrl).port);

    return new Promise<Answer>((resolve, reject) => {
      const req = request(
        {
          host: "127.0.0.1",
          port,
          path,
          method,
          headers: {
            ...(body != null && {
              "Content-Type": "application/json",
              Accept: "application/json, text/event-stream",
            }),
            ...headers,
          },
        },
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

  describe.each(REBINDABLE_HOSTS)("on Host %s", (host) => {
    it.each([
      "/config",
      "/global-context",
      "/subagent-briefing",
      "/api/tools",
      "/mcp/../config",
      "/.well-known/../config",
      "/.well-known/%2E%2E/config",
    ])("refuses GET %s with no browser headers", async (path) => {
      const answer = await send("GET", path, { Host: host });

      expect(answer.status).not.toBe(200);
      expect(answer.body).not.toContain('"tools"');
    });

    it.each(["/config", "/global-context", "/subagent-briefing", "/api/tools"])(
      "answers GET %s with the rebinding 403",
      async (path) => {
        const answer = await send("GET", path, { Host: host });

        expect(answer.status).toBe(403);
        expect(JSON.parse(answer.body)).toStrictEqual({
          error: expect.stringContaining("DNS rebinding"),
        });
      },
    );

    it("serves POST /mcp with no browser headers", async () => {
      const answer = await send("POST", "/mcp", { Host: host });

      expect(answer.status).toBe(200);
    });

    it.each<Record<string, string>>([
      { Origin: `https://${host}` },
      { "Sec-Fetch-Site": "same-origin" },
    ])("refuses POST /mcp from a browser (%o)", async (browser) => {
      const answer = await send("POST", "/mcp", { Host: host, ...browser });

      expect(answer.status).toBe(403);
    });

    it.each(["/mcp", "/MCP", "/mcp/", "/mcp?x=1"])(
      "keeps the 405 on GET %s",
      async (path) => {
        const answer = await send("GET", path, { Host: host });

        expect(answer.status).toBe(405);
      },
    );

    it("keeps the 404 on GET /.well-known/mcp/server-card/mcp", async () => {
      const answer = await send("GET", "/.well-known/mcp/server-card/mcp", {
        Host: host,
      });

      expect(answer.status).toBe(404);
    });
  });

  it("refuses a CORS preflight on a rebindable Host", async () => {
    const answer = await send("OPTIONS", "/config", {
      Host: "evil.example",
      Origin: "http://localhost:5173",
      "Access-Control-Request-Method": "POST",
    });

    expect(answer.status).toBe(403);
  });

  describe.each([
    "localhost:3350",
    "127.0.0.1:3350",
    "[::1]:3350",
    "192.168.1.20:3350",
    "studio-mac.local:3350",
    "demo.trycloudflare.com",
    "x.ngrok.app",
  ])("on Host %s", (host) => {
    it.each<Record<string, string>>([
      {},
      { Origin: `http://${host}`, "Sec-Fetch-Site": "same-origin" },
    ])("serves GET /config (%o)", async (headers) => {
      const answer = await send("GET", "/config", { Host: host, ...headers });

      expect(answer.status).toBe(200);
    });
  });
});
