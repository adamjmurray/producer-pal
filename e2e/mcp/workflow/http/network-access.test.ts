// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * The server always answers on this machine's loopback addresses. Its LAN
 * address answers only when "Allow other devices to connect" is saved on for
 * this computer (~/.producer-pal/settings.json), and is refused otherwise.
 * Skipped when MCP_URL points at another machine.
 *
 * Uses: e2e-test-set (any Set with the device; no tracks touched)
 *
 * Run with: npm run e2e:mcp -- workflow/http/network-access
 */
import { readFileSync } from "node:fs";
import { homedir, networkInterfaces } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
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
