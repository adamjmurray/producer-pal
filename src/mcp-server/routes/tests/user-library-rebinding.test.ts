// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { request } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { errorHandlerMiddleware } from "../../helpers/http/error-handler-middleware.ts";
import {
  type MarkdownRouteServer,
  startMarkdownRouteServer,
} from "../../tests/config-dir-test-helpers.ts";
import { registerDeviceInstallRoutes } from "../device-install-route.ts";
import { registerRemoteScriptSetupRoutes } from "../remote-script-setup-route.ts";

// A refused request never reaches the install; a request that passes the gate
// is stopped by its blank userLibrary (400) before anything is written.
vi.mock(import("../../rpc/device-install/device-install-notice.ts"), () => ({
  syncDeviceInstallNotice: vi.fn(async () => {}),
}));

const ROUTES = [
  "/device-install/install",
  "/device-install/swap",
  "/remote-script/install",
];

let server: MarkdownRouteServer;
let port: number;

beforeAll(async () => {
  server = await startMarkdownRouteServer((app) => {
    registerDeviceInstallRoutes(app);
    registerRemoteScriptSetupRoutes(app);
    app.use(errorHandlerMiddleware);
  });
  port = Number(new URL(server.baseUrl).port);
});

afterAll(async () => {
  await server.close();
});

/**
 * POST a blank body with exact `Host` and `Origin` headers (fetch won't let a
 * test choose them).
 *
 * @param path - Route to post to
 * @param headers - The Host header and optional Origin
 * @param headers.host - Host header value
 * @param headers.origin - Origin header value, or omitted for none
 * @returns The response status and parsed JSON body
 */
function post(
  path: string,
  headers: { host: string; origin?: string },
): Promise<{ status: number; body: { error?: string } }> {
  return new Promise((resolve, reject) => {
    const payload = "{}";
    const req = request(
      {
        host: "127.0.0.1",
        port,
        path,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload),
          ...headers,
        },
      },
      (res) => {
        let data = "";

        res.on("data", (chunk) => (data += String(chunk)));
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body: JSON.parse(data) as { error?: string },
          }),
        );
      },
    );

    req.on("error", reject);
    req.end(payload);
  });
}

describe.each(ROUTES)("POST %s", (path) => {
  it("refuses DNS rebinding: a DNS-name Host with a matching Origin", async () => {
    const res = await post(path, {
      host: "evil.example:3350",
      origin: "http://evil.example:3350",
    });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/localhost or this computer's IP address/);
  });

  it("refuses a tunnel's DNS name, even same-origin over https", async () => {
    const res = await post(path, {
      host: "demo.trycloudflare.com",
      origin: "https://demo.trycloudflare.com",
    });

    expect(res.status).toBe(403);
  });

  it("refuses a localhost Origin that arrives with a DNS-name Host", async () => {
    const res = await post(path, {
      host: "evil.example:3350",
      origin: "http://localhost:3350",
    });

    expect(res.status).toBe(403);
  });

  it.each([
    ["localhost", "http://localhost:3350", "localhost:3350"],
    ["127.0.0.1", "http://127.0.0.1:3350", "127.0.0.1:3350"],
    ["[::1]", "http://[::1]:3350", "[::1]:3350"],
    ["a LAN IP", "http://192.168.1.5:3350", "192.168.1.5:3350"],
    ["a *.localhost name", "http://pp.localhost:3350", "pp.localhost:3350"],
    ["a bracketed IPv6 LAN address", "http://[fd00::5]:3350", "[fd00::5]:3350"],
  ])(
    "lets a same-origin request through for %s",
    async (_name, origin, host) => {
      const res = await post(path, { host, origin });

      // Past the gate: the blank userLibrary is what stops it.
      expect(res.status).toBe(400);
    },
  );

  it("lets an Origin-less (non-browser) request through", async () => {
    const res = await post(path, { host: "evil.example:3350" });

    expect(res.status).toBe(400);
  });
});
