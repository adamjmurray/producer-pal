// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * The server always answers on this machine's loopback addresses. Its LAN
 * address answers only when "Remote Control" is saved on for
 * this computer (~/.producer-pal/settings.json), and is refused otherwise.
 * Skipped when MCP_URL points at another machine.
 *
 * Also PUT /network-access, the chat UI's way to change it. Turning it on is
 * refused unless the request provably comes from this computer: a tunnel's Host
 * or a foreign Origin never gets through, nor does a request from this
 * computer's network address. Turning it off works from anywhere. One test
 * turns the setting on and restores the saved value afterwards, so it briefly
 * opens the network on this computer.
 *
 * Uses: e2e-test-set (any Set with the device; no tracks touched)
 *
 * Run with: npm run e2e:mcp -- workflow/http/network-access
 */
import { readFileSync } from "node:fs";
import { request } from "node:http";
import { homedir, networkInterfaces } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MCP_URL } from "#evals/shared/mcp-url.ts";
import { isLoopbackHost } from "#src/shared/config.ts";
import { setupMcpTestContext } from "../../mcp-test-helpers.ts";

setupMcpTestContext({ once: true });

const mcpUrl = new URL(MCP_URL);
const port = mcpUrl.port || "80";
const isLocalServer = isLoopbackHost(mcpUrl.host);

const addresses = Object.values(networkInterfaces()).flatMap(
  (addrs) => addrs ?? [],
);
const hasIpv6Loopback = addresses.some((addr) => addr.address === "::1");
const lanAddress = addresses.find(
  (addr) => addr.family === "IPv4" && !addr.internal,
)?.address;

/**
 * Whether this computer has network access saved on. Only exactly `true`
 * counts, as in the server.
 *
 * @returns True when the server should answer on the LAN address
 */
function networkAccessSaved(): boolean {
  try {
    // Same lookup as the server's config dir.
    const dir =
      process.env.PRODUCER_PAL_CONFIG_DIR ?? join(homedir(), ".producer-pal");
    const text = readFileSync(join(dir, "settings.json"), "utf8");

    return (
      (JSON.parse(text) as { allowNetwork?: unknown }).allowNetwork === true
    );
  } catch {
    return false;
  }
}

/**
 * Fetch /config from a host and return the error code when the connection
 * fails.
 *
 * @param host - Host (bracket IPv6) to connect to
 * @returns "ok" for a 200, else the connection error code
 */
async function reach(host: string): Promise<string> {
  try {
    const response = await fetch(`http://${host}:${port}/config`, {
      signal: AbortSignal.timeout(5000),
    });

    return response.ok ? "ok" : `HTTP ${response.status}`;
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause;

    return cause?.code ?? String(error);
  }
}

describe.skipIf(!isLocalServer)("network access", () => {
  it("answers on 127.0.0.1", async () => {
    expect(await reach("127.0.0.1")).toBe("ok");
  });

  it.skipIf(!hasIpv6Loopback)("answers on ::1", async () => {
    expect(await reach("[::1]")).toBe("ok");
  });

  it.skipIf(lanAddress == null)(
    "answers on this machine's LAN address only when saved on",
    async () => {
      expect(await reach(lanAddress as string)).toBe(
        networkAccessSaved() ? "ok" : "ECONNREFUSED",
      );
    },
  );
});

interface Answer {
  status: number;
  body: { allowNetwork?: boolean; error?: string };
}

/**
 * Call /network-access with exact headers (fetch won't let a test choose
 * `Host` or `Origin`).
 *
 * @param method - GET or PUT
 * @param allowNetwork - The value to send with a PUT
 * @param options - Where to connect and extra headers
 * @param options.connectTo - Address to connect to
 * @param options.headers - Headers to add or replace
 * @returns The status and parsed body
 */
function call(
  method: "GET" | "PUT",
  allowNetwork?: boolean,
  options: { connectTo?: string; headers?: Record<string, string> } = {},
): Promise<Answer> {
  const payload = JSON.stringify({ allowNetwork });

  return new Promise((resolve, reject) => {
    const req = request(
      {
        host: options.connectTo ?? "127.0.0.1",
        port: Number(port),
        path: "/network-access",
        method,
        agent: false,
        timeout: 10_000,
        headers:
          method === "GET"
            ? options.headers
            : {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(payload),
                ...options.headers,
              },
      },
      (res) => {
        let data = "";

        res.on("data", (chunk) => (data += String(chunk)));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body: JSON.parse(data) as Answer["body"],
          }),
        );
      },
    );

    req.on("error", reject);
    req.end(method === "GET" ? undefined : payload);
  });
}

describe.skipIf(!isLocalServer)("PUT /network-access", () => {
  let original = false;

  beforeAll(async () => {
    original = (await call("GET")).body.allowNetwork === true;
  });

  // Put back what was there, from this computer, whatever a test left.
  afterAll(async () => {
    await call("PUT", original, { headers: { host: `localhost:${port}` } });
  });

  it("reports what the server is listening for", async () => {
    const { status, body } = await call("GET");

    expect(status).toBe(200);
    expect(typeof body.allowNetwork).toBe("boolean");
  });

  it.each([
    ["a tunnel's Host", { host: "demo.trycloudflare.com" }],
    ["a foreign Origin", { origin: "https://evil.example" }],
    ["Origin: null", { origin: "null" }],
    ["Sec-Fetch-Site: cross-site", { "sec-fetch-site": "cross-site" }],
  ])("refuses to turn on with %s", async (_name, headers) => {
    const before = (await call("GET")).body.allowNetwork;
    const { status, body } = await call("PUT", true, {
      headers: { host: `localhost:${port}`, ...headers },
    });

    expect(status).toBe(403);
    expect(body.error).toMatch(/computer running Live/);
    expect((await call("GET")).body.allowNetwork).toBe(before);
  });

  it.skipIf(lanAddress == null)(
    "turns on from this computer, refuses another computer, and lets it turn off",
    async () => {
      const on = await call("PUT", true, {
        headers: { host: `localhost:${port}` },
      });

      expect(on.body.allowNetwork).toBe(true);

      // This computer's own network address looks like another computer's.
      const refused = await call("PUT", true, { connectTo: lanAddress });

      expect(refused.status).toBe(403);

      const off = await call("PUT", false, { connectTo: lanAddress });

      expect(off.body.allowNetwork).toBe(false);
      expect((await call("GET")).body.allowNetwork).toBe(false);
    },
  );
});
