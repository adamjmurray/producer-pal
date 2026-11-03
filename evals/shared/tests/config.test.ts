// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { setConfig, siblingUrl } from "#evals/shared/config.ts";

describe("siblingUrl", () => {
  it("swaps the trailing /mcp segment", () => {
    expect(siblingUrl("http://localhost:3350/mcp", "config")).toBe(
      "http://localhost:3350/config",
    );
  });

  it("leaves a mcp in the host alone", () => {
    expect(siblingUrl("http://mcp.local:3350/mcp", "config")).toBe(
      "http://mcp.local:3350/config",
    );
  });

  it("leaves a /mcp earlier in the path alone", () => {
    expect(siblingUrl("http://host:3350/mcp/proxy/mcp", "config")).toBe(
      "http://host:3350/mcp/proxy/config",
    );
  });

  it("leaves a URL that does not end in /mcp as it is", () => {
    expect(siblingUrl("http://host:3350/other", "config")).toBe(
      "http://host:3350/other",
    );
  });
});

describe("setConfig", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  /**
   * Stub fetch to answer a POST with this config.
   * @param echoed - The config the server says it holds
   * @param status - The HTTP status
   */
  function stubServer(echoed: object, status = 200): void {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(echoed), {
          status,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
  }

  it("accepts remoteScriptEnabled false when the server echoes it", async () => {
    stubServer({ remoteScriptEnabled: false });
    await expect(
      setConfig({ remoteScriptEnabled: false }),
    ).resolves.toBeUndefined();
  });

  it("throws when an older build drops remoteScriptEnabled false", async () => {
    stubServer({ smallModelMode: false });
    await expect(setConfig({ remoteScriptEnabled: false })).rejects.toThrow(
      /ignored remoteScriptEnabled.*Rebuild the device/,
    );
  });

  it("throws when an older build drops remoteScriptMinVersion", async () => {
    stubServer({});
    await expect(
      setConfig({ remoteScriptMinVersion: "9.0.0" }),
    ).rejects.toThrow(/ignored remoteScriptMinVersion/);
  });

  it("accepts remoteScriptMinVersion when the server echoes it", async () => {
    stubServer({ remoteScriptMinVersion: "9.0.0" });
    await expect(
      setConfig({ remoteScriptMinVersion: "9.0.0" }),
    ).resolves.toBeUndefined();
  });

  it("lets the reset through an older build, which ignores both fields", async () => {
    stubServer({});
    await expect(
      setConfig({ remoteScriptEnabled: true, remoteScriptMinVersion: null }),
    ).resolves.toBeUndefined();
  });

  it("puts the server's error text in the thrown error", async () => {
    stubServer({ error: "remoteScriptEnabled can only be set locally" }, 403);
    await expect(setConfig({ remoteScriptEnabled: false })).rejects.toThrow(
      "Failed to set config: 403: remoteScriptEnabled can only be set locally",
    );
  });

  it("still throws on a failed status", async () => {
    stubServer({}, 500);
    await expect(setConfig({ smallModelMode: true })).rejects.toThrow(
      "Failed to set config: 500",
    );
  });
});

describe("resetConfig", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  /**
   * Load resetConfig for an MCP_URL and return the body it posts.
   * @param mcpUrl - The MCP_URL the module sees
   * @returns The parsed request body
   */
  async function resetBody(mcpUrl: string): Promise<Record<string, unknown>> {
    vi.stubEnv("MCP_URL", mcpUrl);
    vi.resetModules();

    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 200 }));

    vi.stubGlobal("fetch", fetchMock);

    const { resetConfig } = await import("#evals/shared/config.ts");

    await resetConfig();

    const init = fetchMock.mock.calls[0]?.[1] as { body: string };

    return JSON.parse(init.body) as Record<string, unknown>;
  }

  it.each([
    "http://localhost:3350/mcp",
    "http://127.0.0.1:3350/mcp",
    "http://[::1]:3350/mcp",
  ])("resets the remote script switches on %s", async (url) => {
    const body = await resetBody(url);

    expect(body.remoteScriptEnabled).toBe(true);
    expect(body.remoteScriptMinVersion).toBeNull();
  });

  it("leaves the switches out for a server on another machine", async () => {
    const body = await resetBody("http://192.168.1.100:3350/mcp");

    expect(body).not.toHaveProperty("remoteScriptEnabled");
    expect(body).not.toHaveProperty("remoteScriptMinVersion");
    expect(body.smallModelMode).toBe(false);
  });
});
