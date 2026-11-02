// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { request } from "node:http";
import { networkInterfaces } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { setupExpressAppServer } from "../express-app-test-helpers.ts";

function post(url: string, body: object, headers = {}): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const hasIpv6Loopback = Object.values(networkInterfaces()).some((addrs) =>
  addrs?.some((addr) => addr.address === "::1"),
);

async function getConfig(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url);

  return (await response.json()) as Record<string, unknown>;
}

// A LAN peer is covered in test-switch-guard.test.ts: unit tests may not reach
// a non-localhost address.
describe("POST /config remote script switches from outside this machine", () => {
  const appState = setupExpressAppServer();

  afterEach(async () => {
    await appState.postConfig({
      remoteScriptEnabled: true,
      remoteScriptMinVersion: null,
      smallModelMode: false,
    });
  });

  async function expectAcceptedOver(host: string): Promise<void> {
    const port = new URL(appState.baseUrl).port;
    const response = await post(`http://${host}:${port}/config`, {
      remoteScriptMinVersion: "9.0.0",
    });

    expect(response.status).toBe(200);
  }

  it.each(["localhost", "127.0.0.1"])(
    "are accepted over %s",
    expectAcceptedOver,
  );

  // Some machines (e.g. cloud containers) have no IPv6 stack, so ::1 is unreachable.
  it.skipIf(!hasIpv6Loopback)("are accepted over [::1]", async () => {
    await expectAcceptedOver("[::1]");
  });

  it("are refused with 403 when a tunnel forwards them, and nothing in the body is applied", async () => {
    const response = await post(
      appState.configUrl,
      { remoteScriptEnabled: false, smallModelMode: true },
      { "X-Forwarded-For": "203.0.113.9" },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toStrictEqual({
      error: expect.stringContaining("remoteScriptEnabled"),
    });

    const config = await getConfig(appState.configUrl);

    expect(config.smallModelMode).toBe(false);
    expect(config.remoteScriptEnabled).not.toBe(false);
  });

  it("are refused when a tunnel passes its public hostname as Host", async () => {
    // fetch won't send a custom Host, so use node:http.
    const status = await new Promise<number | undefined>((resolve, reject) => {
      const req = request(
        appState.configUrl,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Host: "example.trycloudflare.com",
          },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode);
        },
      );

      req.on("error", reject);
      req.end(JSON.stringify({ remoteScriptMinVersion: "9.0.0" }));
    });

    expect(status).toBe(403);
  });

  it("still lets a forwarded request change the other settings", async () => {
    const response = await post(
      appState.configUrl,
      { smallModelMode: true },
      { "X-Forwarded-For": "203.0.113.9" },
    );

    expect(response.status).toBe(200);
  });
});
