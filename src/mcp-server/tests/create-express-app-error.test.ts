// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Mock createMcpServer to throw, triggering the catch block in create-express-app
vi.mock(import("../create-mcp-server.ts"), () => ({
  TOOL_NAMES: ["ppal-connect"],
  createMcpServer: vi.fn(() => {
    throw new Error("Simulated server creation failure");
  }),
}));

describe("MCP Express App error handling", () => {
  let server: Server | undefined;
  let serverUrl: string;

  beforeAll(async () => {
    const { createExpressApp } = await import("../create-express-app.ts");
    const app = createExpressApp();
    const port = await new Promise<number>((resolve) => {
      server = app.listen(0, () => {
        resolve((server!.address() as AddressInfo).port);
      });
    });

    serverUrl = `http://localhost:${port}/mcp`;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
  });

  it("should return 500 when createMcpServer throws", async () => {
    const response = await fetch(serverUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1 }),
    });

    expect(response.status).toBe(500);
    const errorResponse = await response.json();

    expect(errorResponse.jsonrpc).toBe("2.0");
    expect(errorResponse.id).toBeNull();
    expect(errorResponse.error.message).toContain(
      "Simulated server creation failure",
    );
  });
});
