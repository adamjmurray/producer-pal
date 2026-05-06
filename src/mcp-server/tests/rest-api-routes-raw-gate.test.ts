// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { registerRestApiRoutes } from "../rest-api-routes.ts";

describe("REST API Routes – ppal-raw-live-api gating", () => {
  let server: Server | undefined;
  let baseUrl: string;

  const callLiveApi = vi.fn();

  beforeAll(async () => {
    delete process.env.ENABLE_RAW_LIVE_API;

    const app = express();

    app.use(express.json());

    registerRestApiRoutes(
      app,
      () => ({ tools: ["ppal-connect"] }),
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

  it("omits ppal-raw-live-api from /api/tools when env var not set", async () => {
    const response = await fetch(`${baseUrl}/api/tools`);
    const body = await response.json();
    const names = body.tools.map((t: { name: string }) => t.name);

    expect(names).not.toContain("ppal-raw-live-api");
  });

  it("returns 404 for ppal-raw-live-api when env var not set", async () => {
    const response = await fetch(`${baseUrl}/api/tools/ppal-raw-live-api`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(404);

    const body = await response.json();

    expect(body.error).toContain("Unknown or disabled tool");
  });
});
