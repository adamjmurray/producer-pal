// Producer Pal
// Copyright (C) 2026 Eike Haß, Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sends an OPTIONS preflight to /mcp on a fresh Express app and returns the response.
 *
 * @returns The preflight response
 */
async function getPreflightResponse(): Promise<Response> {
  const { createExpressApp } = await import("../create-express-app.ts");
  const app = createExpressApp();
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const url = `http://localhost:${(server.address() as AddressInfo).port}/mcp`;

  try {
    return await fetch(url, {
      method: "OPTIONS",
      headers: {
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe("MCP Express App - CORS", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe("when ENABLE_DEV_CORS is enabled", () => {
    beforeEach(() => {
      vi.stubEnv("ENABLE_DEV_CORS", "true");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("sets wildcard CORS headers on OPTIONS preflight", async () => {
      const response = await getPreflightResponse();

      expect(response.status).toBe(200);
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      expect(response.headers.get("access-control-allow-methods")).toContain(
        "POST",
      );
      expect(response.headers.get("access-control-allow-headers")).toBe("*");
    });
  });

  describe("when ENABLE_DEV_CORS is disabled", () => {
    beforeEach(() => {
      vi.stubEnv("ENABLE_DEV_CORS", "");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("does not set CORS headers on OPTIONS preflight", async () => {
      const response = await getPreflightResponse();

      expect(response.headers.get("access-control-allow-origin")).toBeNull();
    });
  });
});
