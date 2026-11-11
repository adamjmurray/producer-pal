// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type Request } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isRebindSafeHost,
  rebindingGuard,
} from "../../../helpers/http/browser/rebinding-guard.ts";
import { setNetworkAccessAllowed } from "../../../helpers/http/network-access-state.ts";
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

afterEach(() => {
  setNetworkAccessAllowed(false);
});

const LOCAL_NETWORK_NAMES = [
  "studio-mac:3350",
  "studio-mac.local:3350",
  "Studio-Mac.LOCAL",
  "nas.lan",
  "box.home.arpa",
  "host.internal",
];

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
    "demo.trycloudflare.com",
    "trycloudflare.com",
    "abc.ngrok-free.dev",
    "abc.ngrok-free.app",
    "x.ngrok.app",
    "x.ngrok.dev",
    "x.ngrok.io",
    "abc.run.pinggy-free.link",
    "abc.a.free.pinggy.net",
    "abc.a.free.pinggy.link",
    "abc.a.pinggy.link",
    "myname.a.pinggy.io",
    "studio-mac.yak-bebop.ts.net",
    "studio-mac.tail1a2b3c.ts.net:3350",
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
    "evilpinggy.link",
    "evilts.net",
    "ts.net.evil.com",
    "pinggy.io",
    "dashboard.pinggy.io",
    "evil.local.evil.com",
    "999.1.1.1",
    "evil.com@localhost",
    "localhost/x",
    "::1",
    "",
  ])("refuses %s", (host) => {
    expect(isRebindSafeHost(host)).toBe(false);
  });

  describe("local network names", () => {
    it.each(LOCAL_NETWORK_NAMES)(
      "allows %s while other devices may connect",
      (host) => {
        setNetworkAccessAllowed(true);

        expect(isRebindSafeHost(host)).toBe(true);
      },
    );

    it.each(LOCAL_NETWORK_NAMES)(
      "refuses %s when only this computer may connect",
      (host) => {
        setNetworkAccessAllowed(false);

        expect(isRebindSafeHost(host)).toBe(false);
      },
    );

    it("refuses them by default", () => {
      expect(isRebindSafeHost("studio-mac.local")).toBe(false);
    });

    it("follows the setting as it changes", () => {
      setNetworkAccessAllowed(true);
      expect(isRebindSafeHost("nas.lan")).toBe(true);

      setNetworkAccessAllowed(false);
      expect(isRebindSafeHost("nas.lan")).toBe(false);
    });

    it("still refuses look-alikes while other devices may connect", () => {
      setNetworkAccessAllowed(true);

      expect(isRebindSafeHost("evil.local.evil.com")).toBe(false);
      expect(isRebindSafeHost("studio-mac.local.")).toBe(false);
    });

    it.each([
      "localhost",
      "app.localhost",
      "127.0.0.1:3350",
      "[::1]:3350",
      "192.168.1.20:3350",
      "demo.trycloudflare.com",
      "abc.ngrok-free.app",
    ])("still allows %s when only this computer may connect", (host) => {
      setNetworkAccessAllowed(false);

      expect(isRebindSafeHost(host)).toBe(true);
    });
  });
});

const DISCOVERY_PATHS = [
  "/.well-known/oauth-protected-resource",
  "/.well-known/oauth-protected-resource/mcp",
  "/.well-known/oauth-authorization-server",
  "/.well-known/oauth-authorization-server/mcp",
  "/.well-known/openid-configuration",
  "/.well-known/openid-configuration/mcp",
  "/.well-known/mcp/server-card/mcp",
];

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

    it.each(["/mcp", "/MCP", "/mcp/", ...DISCOVERY_PATHS])(
      "passes %s with no browser headers",
      (path) => {
        expect(guard(path, { host: "mcp.example.com" }).passed).toBe(true);
      },
    );

    it.each([
      "/.well-known/",
      "/.well-known/anything",
      "/.well-known/mcp",
      "/.well-known/mcp/server-card",
      "/.well-known/oauth-protected-resource/",
      "/.well-known/oauth-protected-resource/other",
      "/.well-known/oauth-protected-resource/../config",
      "/.well-known/oauth-protected-resource/%2E%2E/config",
      "/.well-known/OAuth-Protected-Resource",
      "/.well-known/openid-configuration/mcp/",
    ])("refuses %s with no browser headers", (path) => {
      expect(guard(path, { host: "mcp.example.com" })).toStrictEqual({
        passed: false,
        status: 403,
        body: { error: expect.stringContaining("DNS rebinding") },
      });
    });

    it("refuses a discovery path from a browser", () => {
      expect(
        guard(DISCOVERY_PATHS[0] as string, {
          host: "mcp.example.com",
          origin: "https://mcp.example.com",
        }).status,
      ).toBe(403);
    });

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

  describe("on a local network name", () => {
    it("treats it as unknown when only this computer may connect", () => {
      const host = "evil.local:3350";

      expect(guard("/config", { host }).status).toBe(403);
      expect(
        guard("/api/tools", { host, origin: `http://${host}` }).status,
      ).toBe(403);
      expect(guard("/mcp", { host, origin: `http://${host}` }).status).toBe(
        403,
      );
      expect(guard("/mcp", { host }).passed).toBe(true);
    });

    it("passes every path while other devices may connect", () => {
      setNetworkAccessAllowed(true);

      expect(guard("/config", { host: "evil.local:3350" }).passed).toBe(true);
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

    it("passes any path under /.well-known/ too", () => {
      expect(
        guard("/.well-known/anything", { host: "192.168.1.20:3350" }).passed,
      ).toBe(true);
    });
  });
});
