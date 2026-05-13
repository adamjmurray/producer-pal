// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import express from "express";
import Max from "max-api";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { TOOL_NAMES } from "../create-mcp-server.ts";
import { registerRestApiRoutes } from "../routes/rest-api-routes.ts";
import { setupExpressAppServer } from "./express-app-test-helpers.ts";

type MockMax = typeof Max & {
  handlers: Map<string, (input: unknown) => void>;
};
const mockMax = Max as MockMax;

describe("MCP Express App – Live API runtime gating", () => {
  const appState = setupExpressAppServer();
  let configUrl: string;

  beforeAll(() => {
    configUrl = appState.serverUrl.replace("/mcp", "/config");
  });

  const postConfig = (body: object) =>
    fetch(configUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("auto-adds ppal-live-api to tools when liveApiEnabled flips on via REST", async () => {
    await postConfig({ liveApiEnabled: false, tools: [...TOOL_NAMES] });

    const enabledRes = await postConfig({ liveApiEnabled: true });
    const enabled = await enabledRes.json();

    expect(enabled.liveApiEnabled).toBe(true);
    expect(enabled.tools).toContain("ppal-live-api");

    // Flipping on again is a no-op for the whitelist.
    const againRes = await postConfig({ liveApiEnabled: true });
    const again = await againRes.json();
    const occurrences = again.tools.filter(
      (t: string) => t === "ppal-live-api",
    );

    expect(occurrences).toStrictEqual(["ppal-live-api"]);
  });

  it("strips ppal-live-api from tools when liveApiEnabled flips off via REST", async () => {
    await postConfig({ liveApiEnabled: true });

    const disabledRes = await postConfig({ liveApiEnabled: false });
    const disabled = await disabledRes.json();

    expect(disabled.liveApiEnabled).toBe(false);
    expect(disabled.tools).not.toContain("ppal-live-api");
  });

  it("Max liveApiEnabled handler updates the runtime flag and whitelist", async () => {
    await postConfig({ liveApiEnabled: false, tools: [...TOOL_NAMES] });

    const handler = mockMax.handlers.get("liveApiEnabled") as (
      input: unknown,
    ) => void;

    handler(1);

    const enabledRes = await fetch(configUrl);
    const enabled = await enabledRes.json();

    expect(enabled.liveApiEnabled).toBe(true);
    expect(enabled.tools).toContain("ppal-live-api");

    handler(0);

    const disabledRes = await fetch(configUrl);
    const disabled = await disabledRes.json();

    expect(disabled.liveApiEnabled).toBe(false);
  });

  it("rejects ppal-live-api in tools when liveApiEnabled is false", async () => {
    await postConfig({ liveApiEnabled: false, tools: [...TOOL_NAMES] });

    const response = await postConfig({
      tools: [...TOOL_NAMES, "ppal-live-api"],
    });

    expect(response.status).toBe(400);
    const body = await response.json();

    expect(body.error).toContain("ppal-live-api");
    expect(body.validToolNames).toStrictEqual([...TOOL_NAMES]);
  });
});

describe("REST API Routes – ppal-live-api gating", () => {
  let server: Server | undefined;
  let baseUrl: string;

  const callLiveApi = vi.fn();

  beforeAll(async () => {
    const app = express();

    app.use(express.json());

    registerRestApiRoutes(
      app,
      () => ({ tools: ["ppal-connect"], liveApiEnabled: false }),
      callLiveApi,
    );

    const port = await new Promise<number>((resolve) => {
      server = app.listen(0, () => {
        resolve((server!.address() as AddressInfo).port);
      });
    });

    baseUrl = `http://localhost:${port}`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server?.close(() => resolve()));
    }
  });

  it("omits ppal-live-api from /api/tools when liveApiEnabled is false", async () => {
    const response = await fetch(`${baseUrl}/api/tools`);
    const body = await response.json();
    const names = body.tools.map((t: { name: string }) => t.name);

    expect(names).not.toContain("ppal-live-api");
  });

  it("returns 404 for ppal-live-api when liveApiEnabled is false", async () => {
    const response = await fetch(`${baseUrl}/api/tools/ppal-live-api`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(404);

    const body = await response.json();

    expect(body.error).toContain("Unknown or disabled tool");
  });
});
