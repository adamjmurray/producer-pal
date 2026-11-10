// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type Request } from "express";
import { describe, expect, it, vi } from "vitest";
import {
  isRebindSafeHost,
  rebindingGuard,
} from "../../../helpers/http/browser/rebinding-guard.ts";
import { mockRes } from "../mock-express-response-test-helpers.ts";

/**
 * A minimal Express request with a path and headers, read case-insensitively
 * as Express does.
 * @param path - Request path, without the query
 * @param headers - Header values by lowercase name
 * @returns A Request-shaped stub
 */
function mockReq(path: string, headers: Record<string, string>): Request {
  return {
    path,
    get: (name: string): string | undefined => headers[name.toLowerCase()],
  } as unknown as Request;
}

/**
 * Run the guard on one request.
 * @param path - Request path, without the query
 * @param headers - Header values by lowercase name
 * @returns Whether it passed, and the status and body it wrote if refused
 */
function guard(
  path: string,
  headers: Record<string, string>,
): { passed: boolean; status: number | null; body: unknown } {
  const { res, state } = mockRes();
  const next = vi.fn();

  rebindingGuard(mockReq(path, headers), res, next);

  return { passed: next.mock.calls.length === 1, ...state };
}

describe("isRebindSafeHost", () => {
  it.each([
    "localhost",
    "localhost:3350",
    "LOCALHOST:3350",
    "app.localhost",
    "127.0.0.1:3350",
    "[::1]:3350",
    "192.168.1.20:3350",
    "10.0.0.5",
    "[fe80::1]:3350",
    "studio-mac:3350",
    "studio-mac.local:3350",
    "Studio-Mac.LOCAL",
    "nas.lan",
    "box.home.arpa",
    "host.internal",
    "demo.trycloudflare.com",
    "trycloudflare.com",
    "abc.ngrok-free.dev",
    "abc.ngrok-free.app",
    "x.ngrok.app",
    "x.ngrok.dev",
    "x.ngrok.io",
    "abc.run.pinggy-free.link",
    "abc.a.free.pinggy.net",
  ])("allows %s", (host) => {
    expect(isRebindSafeHost(host)).toBe(true);
  });

  it.each([
    "evil.example",
    "evil.example:3350",
    "mcp.example.com",
    "127.0.0.1.nip.io:3350",
    "localhost.",
    "localhost.:3350",
    "evil.com.",
    "studio-mac.local.",
    "localhost.evil.com",
    "127.0.0.1.evil.com",
    "192.168.1.20.evil.com",
    "evil.com.localhost.evil.com",
    "eviltrycloudflare.com",
    "trycloudflare.com.evil.com",
    "evilngrok.io",
    "evil.local.evil.com",
    "999.1.1.1",
    "evil.com@localhost",
    "localhost/x",
    "::1",
    "",
  ])("refuses %s", (host) => {
    expect(isRebindSafeHost(host)).toBe(false);
  });
});

describe("rebindingGuard", () => {
  describe("on a Host that can be rebound", () => {
    it.each([
      "/config",
      "/global-context",
      "/subagent-briefing",
      "/api/tools",
      "/",
      "/chat",
      "/mcp/../config",
      "/mcpx",
      "//mcp",
      "/%6Dcp",
    ])("refuses a request with no browser headers to %s", (path) => {
      expect(guard(path, { host: "evil.example:3350" })).toStrictEqual({
        passed: false,
        status: 403,
        body: { error: expect.stringContaining("DNS rebinding") },
      });
    });

    it("says custom domains aren't supported for the chat UI yet", () => {
      expect(guard("/chat", { host: "mcp.example.com" }).body).toStrictEqual({
        error: expect.stringContaining("Custom domains"),
      });
    });

    it.each(["/mcp", "/MCP", "/mcp/", "/.well-known/mcp/server-card/mcp"])(
      "passes %s with no browser headers",
      (path) => {
        expect(guard(path, { host: "mcp.example.com" }).passed).toBe(true);
      },
    );

    it.each([
      ["Origin", { origin: "https://mcp.example.com" }],
      ["Sec-Fetch-Site", { "sec-fetch-site": "same-origin" }],
    ])("refuses /mcp from a browser (%s)", (_name, browser) => {
      expect(
        guard("/mcp", { host: "mcp.example.com", ...browser }).status,
      ).toBe(403);
    });

    it("passes /mcp with only Sec-Fetch-Mode, which isn't a browser test", () => {
      expect(
        guard("/mcp", { host: "mcp.example.com", "sec-fetch-mode": "cors" })
          .passed,
      ).toBe(true);
    });

    it("ignores forwarding headers a page can set", () => {
      const result = guard("/config", {
        host: "evil.example",
        "x-forwarded-host": "localhost",
        "x-forwarded-for": "127.0.0.1",
        "cf-connecting-ip": "127.0.0.1",
      });

      expect(result.passed).toBe(false);
    });

    it("treats a missing Host as one that can be rebound", () => {
      expect(guard("/config", {}).passed).toBe(false);
      expect(guard("/mcp", {}).passed).toBe(true);
    });
  });

  describe("on a Host that can't be rebound", () => {
    it.each<Record<string, string>>([
      {},
      { origin: "http://192.168.1.20:3350" },
      { "sec-fetch-site": "same-origin" },
    ])("passes any path (%o)", (headers) => {
      expect(
        guard("/config", { host: "192.168.1.20:3350", ...headers }).passed,
      ).toBe(true);
    });
  });
});
