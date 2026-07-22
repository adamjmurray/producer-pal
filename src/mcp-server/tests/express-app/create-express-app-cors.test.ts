// Producer Pal
// Copyright (C) 2026 Eike Haß, Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Sends a request to a freshly created Express app and returns the response.
 * OPTIONS requests include the preflight headers a browser would send.
 *
 * @param options - Request options
 * @param options.method - HTTP method (default "OPTIONS")
 * @param options.origin - Origin header to send, if any
 * @param options.path - Request path (default "/mcp")
 * @returns The response
 */
async function requestApp(options: {
  method?: string;
  origin?: string;
  path?: string;
}): Promise<Response> {
  const method = options.method ?? "OPTIONS";
  const { createExpressApp } = await import("../../create-express-app.ts");
  const app = createExpressApp();
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const port = (server.address() as AddressInfo).port;
  const url = `http://localhost:${port}${options.path ?? "/mcp"}`;
  const headers: Record<string, string> = {};

  if (options.origin != null) {
    headers.Origin = options.origin;
  }

  if (method === "OPTIONS") {
    headers["Access-Control-Request-Method"] = "POST";
    headers["Access-Control-Request-Headers"] = "content-type";
  }

  try {
    return await fetch(url, { method, headers });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

describe("MCP Express App - CORS", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("by default (localhost only)", () => {
    it("reflects a localhost origin on the preflight", async () => {
      const res = await requestApp({ origin: "http://localhost:5173" });

      expect(res.status).toBe(200);
      expect(res.headers.get("access-control-allow-origin")).toBe(
        "http://localhost:5173",
      );
      expect(res.headers.get("vary")).toBe("Origin");
      expect(res.headers.get("access-control-allow-methods")).toContain("POST");
      expect(res.headers.get("access-control-allow-headers")).toBe("*");
    });

    it("reflects a localhost origin on a non-preflight request", async () => {
      const res = await requestApp({
        method: "GET",
        origin: "http://127.0.0.1:8080",
        path: "/config",
      });

      expect(res.headers.get("access-control-allow-origin")).toBe(
        "http://127.0.0.1:8080",
      );
    });

    it("sends no CORS header for a foreign origin", async () => {
      const res = await requestApp({ origin: "https://evil.example" });

      expect(res.headers.get("access-control-allow-origin")).toBeNull();
    });

    it("sends no CORS header when there is no Origin", async () => {
      const res = await requestApp({});

      expect(res.headers.get("access-control-allow-origin")).toBeNull();
    });
  });

  describe("with ENABLE_REMOTE_CORS", () => {
    beforeEach(() => {
      vi.stubEnv("ENABLE_REMOTE_CORS", "true");
    });

    it("allows any origin with a wildcard", async () => {
      const res = await requestApp({ origin: "https://anywhere.example" });

      expect(res.status).toBe(200);
      expect(res.headers.get("access-control-allow-origin")).toBe("*");
      expect(res.headers.get("vary")).toBeNull();
      expect(res.headers.get("access-control-allow-methods")).toContain("POST");
      expect(res.headers.get("access-control-allow-headers")).toBe("*");
    });
  });
});
