// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it, vi } from "vitest";
import { setupExpressAppServer } from "./express-app-test-helpers.ts";

// Mock createMcpServer to throw, triggering the catch block in create-express-app
vi.mock(import("../create-mcp-server.ts"), async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    TOOL_NAMES: ["ppal-connect"],
    createMcpServer: vi.fn(() => {
      throw new Error("Simulated server creation failure");
    }),
  };
});

describe("MCP Express App error handling", () => {
  const appState = setupExpressAppServer();

  it("should return 500 when createMcpServer throws", async () => {
    const response = await fetch(appState.serverUrl, {
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
