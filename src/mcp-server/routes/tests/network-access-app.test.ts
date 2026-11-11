// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createExpressApp } from "../../create-express-app.ts";
import {
  type HttpListeners,
  startHttpListeners,
} from "../../helpers/http/http-listeners.ts";
import { isNetworkAccessAllowed } from "../../helpers/http/network-access-state.ts";
import { useTempConfigDir } from "../../tests/config-dir-test-helpers.ts";
import { type Sent, send } from "./network-access-test-helpers.ts";

// The route inside the whole app, so the rebinding guard, CORS and JSON
// parsing run in front of it as they do for a real request.
describe("/network-access in the Express app", () => {
  useTempConfigDir();
  let listeners: HttpListeners;
  let port = 0;

  const turnOn = (
    headers: Record<string, string>,
    path = "/network-access",
  ): Promise<Sent> =>
    send(port, {
      path,
      body: JSON.stringify({ allowNetwork: true }),
      headers: { host: `localhost:${port}`, ...headers },
    });
  const preflight = (origin: string): Promise<Sent> =>
    send(port, {
      method: "OPTIONS",
      headers: {
        host: `localhost:${port}`,
        origin,
        "access-control-request-method": "PUT",
        "access-control-request-headers": "content-type",
      },
    });

  beforeEach(async () => {
    listeners = await startHttpListeners(createExpressApp(), { port: 0 });
    port = listeners.addresses()[0]?.port ?? 0;
  });

  afterEach(async () => {
    await listeners.close();
  });

  it("turns on from this computer", async () => {
    const res = await turnOn({});

    expect(res.body).toStrictEqual({ allowNetwork: true });
    expect(isNetworkAccessAllowed()).toBe(true);
  });

  it("refuses to turn on through a tunnel's Host", async () => {
    const res = await turnOn({ host: "demo.trycloudflare.com" });

    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/computer running Live/);
    expect(isNetworkAccessAllowed()).toBe(false);
  });

  it("refuses to turn on through a Host a website could rebind", async () => {
    const res = await turnOn({ host: `evil.example:${port}` });

    expect(res.status).toBe(403);
    expect(isNetworkAccessAllowed()).toBe(false);
  });

  it("refuses to turn on with no Host", async () => {
    const res = await send(port, {
      noHost: true,
      body: JSON.stringify({ allowNetwork: true }),
    });

    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(isNetworkAccessAllowed()).toBe(false);
  });

  it.each(["/Network-Access", "/network-access/", "/NETWORK-ACCESS/"])(
    "refuses to turn on at %s from a request that isn't local",
    async (path) => {
      const res = await turnOn({ host: "demo.trycloudflare.com" }, path);

      expect(res.status).toBe(403);
      expect(isNetworkAccessAllowed()).toBe(false);
    },
  );

  it("turns on at the same variants from this computer", async () => {
    const res = await turnOn({}, "/Network-Access/");

    expect(res.body.allowNetwork).toBe(true);
  });

  it.each([
    ["a foreign origin", "https://evil.example"],
    ["a localhost origin on another port", "http://localhost:5173"],
  ])("doesn't let a preflight from %s allow PUT", async (_name, origin) => {
    const res = await preflight(origin);
    const allowed = String(res.headers["access-control-allow-methods"] ?? "");

    expect(allowed).not.toMatch(/PUT/);
    expect(res.headers["access-control-allow-origin"]).not.toBe("*");
    expect(isNetworkAccessAllowed()).toBe(false);
  });

  it("refuses to turn on for a page of another site", async () => {
    const res = await turnOn({ origin: "https://evil.example" });

    expect(res.status).toBe(403);
    expect(isNetworkAccessAllowed()).toBe(false);
  });
});
