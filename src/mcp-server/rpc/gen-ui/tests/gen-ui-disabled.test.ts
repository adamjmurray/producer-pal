// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, describe, expect, it, vi } from "vitest";
import { setupExpressAppServer } from "../../../tests/express-app-test-helpers.ts";
import { connectMcpClient } from "../../../tests/server/mcp-client-test-helpers.ts";
import type * as RemoteScriptClient from "../../remote-script/remote-script-client.ts";
import { remoteScriptRequest } from "../../remote-script/remote-script-client.ts";
import type * as LiveWatcher from "../live-watcher.ts";
import { startLiveWatcher } from "../live-watcher.ts";
import type * as SetStorage from "../set-storage.ts";
import { connectWidgetsToSet } from "../set-storage.ts";

// Real behavior, wrapped so a call can be counted.
vi.mock(
  import("../../remote-script/remote-script-client.ts"),
  async (original) => {
    const actual = await original<typeof RemoteScriptClient>();

    return {
      ...actual,
      remoteScriptRequest: vi.fn(actual.remoteScriptRequest),
    };
  },
);
vi.mock(import("../live-watcher.ts"), async (original) => {
  const actual = await original<typeof LiveWatcher>();

  return { ...actual, startLiveWatcher: vi.fn(actual.startLiveWatcher) };
});
vi.mock(import("../set-storage.ts"), async (original) => {
  const actual = await original<typeof SetStorage>();

  return { ...actual, connectWidgetsToSet: vi.fn(actual.connectWidgetsToSet) };
});

// ENABLE_GEN_UI is unset: a release build.
const app = setupExpressAppServer();

/**
 * @param path - A server path
 * @param init - Request options
 * @returns The response status
 */
async function statusOf(path: string, init?: RequestInit): Promise<number> {
  const response = await fetch(`${app.baseUrl}${path}`, init);

  return response.status;
}

describe("generative UI in a build without ENABLE_GEN_UI", () => {
  it("has no ppal-ui tool, routes or stream", async () => {
    const configResponse = await fetch(app.configUrl);
    const config = (await configResponse.json()) as { tools: string[] };
    const callStatus = await statusOf("/api/tools/ppal-ui", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "list" }),
    });

    expect(config.tools).not.toContain("ppal-ui");
    expect(callStatus).toBe(404);
    expect(await statusOf("/api/ui/widgets")).toBe(404);
    expect(await statusOf("/api/ui/events")).toBe(404);
  });

  it("does not register ppal-ui on the MCP server", async () => {
    const { client } = await connectMcpClient();
    const { tools } = await client.listTools();

    expect(tools.map((t) => t.name)).not.toContain("ppal-ui");
  });
});

describe("generative UI background work in a build without ENABLE_GEN_UI", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts no watcher or set storage, and asks the remote script for nothing", async () => {
    // The app the server above started is already built; this builds another
    // under fake timers so any timer it arms is counted and can be run.
    vi.useFakeTimers();

    const { createExpressApp } = await import("../../../create-express-app.ts");

    createExpressApp();
    await vi.advanceTimersByTimeAsync(60_000);

    expect(startLiveWatcher).not.toHaveBeenCalled();
    expect(connectWidgetsToSet).not.toHaveBeenCalled();
    expect(remoteScriptRequest).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
