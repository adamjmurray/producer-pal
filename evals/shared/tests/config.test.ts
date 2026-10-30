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

  it("accepts remoteScriptEnabled false when a debug build echoes it", async () => {
    stubServer({ remoteScriptEnabled: false });
    await expect(
      setConfig({ remoteScriptEnabled: false }),
    ).resolves.toBeUndefined();
  });

  it("throws when a release build drops remoteScriptEnabled false", async () => {
    stubServer({ smallModelMode: false });
    await expect(setConfig({ remoteScriptEnabled: false })).rejects.toThrow(
      /ignored remoteScriptEnabled.*build:debug/,
    );
  });

  it("throws when a release build drops remoteScriptMinVersion", async () => {
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

  it("lets the reset through a release build, which ignores both fields", async () => {
    stubServer({});
    await expect(
      setConfig({ remoteScriptEnabled: true, remoteScriptMinVersion: null }),
    ).resolves.toBeUndefined();
  });

  it("still throws on a failed status", async () => {
    stubServer({}, 500);
    await expect(setConfig({ smallModelMode: true })).rejects.toThrow(
      "Failed to set config: 500",
    );
  });
});
