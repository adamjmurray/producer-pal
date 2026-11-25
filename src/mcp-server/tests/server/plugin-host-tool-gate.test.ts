// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ppal-plugin-host is a debug tool: both registries read ENABLE_LIVE_API when
// they load, so each is imported fresh. A release build never sets the flag.
// A fresh import of both takes ~1 s, so the default 5 s timeout fails under load.
describe("the ppal-plugin-host debug tool", { timeout: 30_000 }, () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadNames(): Promise<{ mcp: string[]; v8: string[] }> {
    const { OPT_IN_TOOL_DEFS } =
      await import("#src/mcp-server/create-mcp-server.ts");
    const { DISPATCH_TOOL_NAMES } =
      await import("#src/live-api-adapter/live-api-adapter.ts");

    return {
      mcp: OPT_IN_TOOL_DEFS.map((def) => def.toolName),
      v8: [...DISPATCH_TOOL_NAMES],
    };
  }

  it("is registered, and dispatched, in a build with ENABLE_LIVE_API", async () => {
    vi.stubEnv("ENABLE_LIVE_API", "true");

    const { mcp, v8 } = await loadNames();

    expect(mcp).toStrictEqual(["ppal-live-api", "ppal-plugin-host"]);
    expect(v8).toContain("ppal-plugin-host");
  });

  it("is left out of a build without it", async () => {
    vi.stubEnv("ENABLE_LIVE_API", "");

    const { mcp, v8 } = await loadNames();

    expect(mcp).toStrictEqual(["ppal-live-api"]);
    expect(v8).not.toContain("ppal-plugin-host");
  });
});
