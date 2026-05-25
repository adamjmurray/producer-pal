// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { afterAll, describe, expect, it, vi } from "vitest";
import { TOOL_NAMES } from "../../create-mcp-server.ts";
import {
  mockMax,
  setupExpressAppServer,
  setupRestRoutesServer,
} from "../express-app-test-helpers.ts";

describe("MCP Express App – Live API runtime gating", () => {
  const appState = setupExpressAppServer();

  it("auto-adds ppal-live-api to tools when liveApiEnabled flips on via REST", async () => {
    await appState.postConfig({
      liveApiEnabled: false,
      tools: [...TOOL_NAMES],
    });

    const enabledRes = await appState.postConfig({ liveApiEnabled: true });
    const enabled = await enabledRes.json();

    expect(enabled.liveApiEnabled).toBe(true);
    expect(enabled.tools).toContain("ppal-live-api");

    // Flipping on again is a no-op for the whitelist.
    const againRes = await appState.postConfig({ liveApiEnabled: true });
    const again = await againRes.json();
    const occurrences = again.tools.filter(
      (t: string) => t === "ppal-live-api",
    );

    expect(occurrences).toStrictEqual(["ppal-live-api"]);
  });

  it("strips ppal-live-api from tools when liveApiEnabled flips off via REST", async () => {
    await appState.postConfig({ liveApiEnabled: true });

    const disabledRes = await appState.postConfig({ liveApiEnabled: false });
    const disabled = await disabledRes.json();

    expect(disabled.liveApiEnabled).toBe(false);
    expect(disabled.tools).not.toContain("ppal-live-api");
  });

  it("Max liveApiEnabled handler updates the runtime flag and whitelist", async () => {
    await appState.postConfig({
      liveApiEnabled: false,
      tools: [...TOOL_NAMES],
    });

    const handler = mockMax.handlers.get("liveApiEnabled") as (
      input: unknown,
    ) => void;

    handler(1);

    const enabledRes = await fetch(appState.configUrl);
    const enabled = await enabledRes.json();

    expect(enabled.liveApiEnabled).toBe(true);
    expect(enabled.tools).toContain("ppal-live-api");

    handler(0);

    const disabledRes = await fetch(appState.configUrl);
    const disabled = await disabledRes.json();

    expect(disabled.liveApiEnabled).toBe(false);
  });

  it("rejects ppal-live-api in tools when liveApiEnabled is false", async () => {
    await appState.postConfig({
      liveApiEnabled: false,
      tools: [...TOOL_NAMES],
    });

    const response = await appState.postConfig({
      tools: [...TOOL_NAMES, "ppal-live-api"],
    });

    expect(response.status).toBe(400);
    const body = await response.json();

    expect(body.error).toContain("ppal-live-api");
    expect(body.validToolNames).toStrictEqual([...TOOL_NAMES]);
  });
});

describe("MCP Express App – Live API forced on via env", () => {
  const originalEnv = process.env.ENABLE_LIVE_API;

  const appState = setupExpressAppServer({
    beforeStart: () => {
      // Force a fresh module load so the new ENABLE_LIVE_API value is read.
      vi.resetModules();
      process.env.ENABLE_LIVE_API = "true";
    },
  });

  afterAll(() => {
    process.env.ENABLE_LIVE_API = originalEnv;
  });

  it("Max handler swallows liveApiEnabled=false when env forces on", async () => {
    const initialRes = await fetch(appState.configUrl);
    const initial = await initialRes.json();

    expect(initial.liveApiEnabled).toBe(true);
    expect(initial.tools).toContain("ppal-live-api");

    const handler = mockMax.handlers.get("liveApiEnabled") as (
      input: unknown,
    ) => void;

    handler(0);

    const afterRes = await fetch(appState.configUrl);
    const after = await afterRes.json();

    expect(after.liveApiEnabled).toBe(true);
    expect(after.tools).toContain("ppal-live-api");
  });

  it("POST /config liveApiEnabled=false still disables (documented asymmetry for e2e)", async () => {
    // Prior test left Live API on (the Max handler swallowed the false update).
    const response = await appState.postConfig({ liveApiEnabled: false });
    const result = await response.json();

    expect(result.liveApiEnabled).toBe(false);
    expect(result.tools).not.toContain("ppal-live-api");
  });
});

describe("REST API Routes – ppal-live-api gating", () => {
  const routesState = setupRestRoutesServer({
    getConfig: () => ({ tools: ["ppal-connect"], liveApiEnabled: false }),
  });

  it("omits ppal-live-api from /api/tools when liveApiEnabled is false", async () => {
    const response = await fetch(`${routesState.baseUrl}/api/tools`);
    const body = await response.json();
    const names = body.tools.map((t: { name: string }) => t.name);

    expect(names).not.toContain("ppal-live-api");
  });

  it("returns 404 for ppal-live-api when liveApiEnabled is false", async () => {
    const response = await fetch(
      `${routesState.baseUrl}/api/tools/ppal-live-api`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );

    expect(response.status).toBe(404);

    const body = await response.json();

    expect(body.error).toContain("Unknown or disabled tool");
  });
});
