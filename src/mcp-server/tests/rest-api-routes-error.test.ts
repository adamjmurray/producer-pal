// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { registerRestApiRoutes } from "../rest-api-routes.ts";

describe("REST API Routes – callLiveApi error path", () => {
  let server: Server | undefined;
  let baseUrl: string;

  const callLiveApi = vi.fn();

  beforeAll(async () => {
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

  it("should return 500 when callLiveApi throws", async () => {
    callLiveApi.mockRejectedValueOnce(new Error("Max connection lost"));

    const response = await fetch(`${baseUrl}/api/tools/ppal-connect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    expect(response.status).toBe(500);

    const body = await response.json();

    expect(body.error).toBe("Internal server error");
  });
});
