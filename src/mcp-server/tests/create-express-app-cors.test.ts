// Producer Pal
// Copyright (C) 2026 Adam Murray, Eike Haß
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Creates an Express app, starts it, sends an OPTIONS preflight to /mcp,
 * calls fn with the response, then shuts the server down.
 *
 * @param fn - Assertion callback receiving the preflight response
 */
async function withOptionsPreflightResponse(
  fn: (response: Response) => void,
): Promise<void> {
  const { createExpressApp } = await import("../create-express-app.ts");
  const app = createExpressApp();
  const testServer = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const url = `http://localhost:${(testServer.address() as AddressInfo).port}/mcp`;

  try {
    const response = await fetch(url, {
      method: "OPTIONS",
      headers: {
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type",
      },
    });

    fn(response);
  } finally {
    await new Promise<void>((resolve) => testServer.close(() => resolve()));
  }
}

describe("MCP Express App - CORS", () => {
  describe("when ENABLE_DEV_CORS is enabled", () => {
    beforeEach(() => {
      vi.stubEnv("ENABLE_DEV_CORS", "true");
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("sets wildcard CORS headers on OPTIONS preflight", async () => {
      await withOptionsPreflightResponse((response) => {
        expect(response.status).toBe(200);
        expect(response.headers.get("access-control-allow-origin")).toBe("*");
        expect(response.headers.get("access-control-allow-methods")).toContain(
          "POST",
        );
        expect(response.headers.get("access-control-allow-headers")).toBe("*");
      });
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
      await withOptionsPreflightResponse((response) => {
        expect(response.headers.get("access-control-allow-origin")).toBeNull();
      });
    });
  });
});
