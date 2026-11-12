// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { Agent, createServer } from "node:http";
import express from "express";
import { beforeEach, describe, expect, it } from "vitest";
import { type HttpListeners } from "../../helpers/http/http-listeners.ts";
import { isNetworkAccessAllowed } from "../../helpers/http/network-access-state.ts";
import { useTempConfigDir } from "../../tests/config-dir-test-helpers.ts";
import { withExpressApp } from "../../tests/express-app-test-helpers.ts";
import { registerNetworkAccessRoutes } from "../config/network-access-route.ts";
import {
  LAN_ADDRESS,
  savedSettings,
  send,
  shownOnDevice,
  useRouteServer,
} from "./network-access-test-helpers.ts";

describe("/network-access", () => {
  const configDir = useTempConfigDir();
  const server = useRouteServer();
  const { failures, put } = server;
  const listeners = (): HttpListeners => server.listeners();
  const port = (): number => server.port();
  const settings = (): Record<string, unknown> => savedSettings(configDir());
  const shown = shownOnDevice;

  it("reports what the server is listening for", async () => {
    const before = await send(port(), { method: "GET" });

    expect(before.body).toStrictEqual({ allowNetwork: false });

    await put(true);

    const after = await send(port(), { method: "GET" });

    expect(after.body).toStrictEqual({ allowNetwork: true });
    expect(after.headers["cache-control"]).toBe("no-store");
  });

  describe("turning on from this computer", () => {
    it("switches, saves, shows it on the device, and answers", async () => {
      const res = await put(true);

      expect(res.status).toBe(200);
      expect(res.body).toStrictEqual({ allowNetwork: true });
      expect(isNetworkAccessAllowed()).toBe(true);
      expect(settings().allowNetwork).toBe(true);
      expect(shown()).toBe(1);
      expect(listeners().addresses()).toHaveLength(1);
      expect(listeners().addresses()[0]?.port).toBe(port());
    });

    it.each([
      ["a same-origin Origin", { origin: "http://localhost:PORT" }],
      ["Sec-Fetch-Site: same-origin", { "sec-fetch-site": "same-origin" }],
      ["Sec-Fetch-Site: none", { "sec-fetch-site": "none" }],
      [
        "a charset on the content type",
        { "content-type": "application/json; charset=utf-8" },
      ],
    ])("accepts %s", async (_name, headers) => {
      const fixed = Object.fromEntries(
        Object.entries(headers).map(([k, v]) => [
          k,
          v.replace("PORT", String(port())),
        ]),
      );

      const res = await put(true, { headers: fixed });

      expect(res.status).toBe(200);
    });

    it("answers on a keep-alive connection that is already open", async () => {
      const agent = new Agent({ keepAlive: true });
      const idle = new Agent({ keepAlive: true });

      try {
        await send(port(), { method: "GET", agent: idle });
        await send(port(), { method: "GET", agent });

        const res = await put(true, { agent });

        expect(res.body).toStrictEqual({ allowNetwork: true });
        expect(res.headers.connection).toBe("close");
        // The new listener answers, and the old keep-alive sockets are gone.
        const after = await send(port(), { method: "GET" });

        expect(after.body.allowNetwork).toBe(true);
        expect(Object.keys(idle.freeSockets)).toHaveLength(0);
      } finally {
        agent.destroy();
        idle.destroy();
      }
    });

    it("always closes the connection after the answer", async () => {
      const agent = new Agent({ keepAlive: true });

      try {
        const res = await put(false, { agent });

        expect(res.body).toStrictEqual({ allowNetwork: false });
        expect(res.headers.connection).toBe("close");
      } finally {
        agent.destroy();
      }
    });
  });

  describe("refusing to turn on", () => {
    const REFUSED = /only be turned on from the computer running Live/;

    it.each([
      ["a tunnel's Host", { host: "demo.trycloudflare.com" }],
      ["a DNS-name Host", { host: "evil.example:3350" }],
      ["a foreign Origin", { origin: "https://evil.example" }],
      ["Origin: null", { origin: "null" }],
      [
        "a localhost Origin on another port",
        { origin: "http://localhost:5173" },
      ],
      ["Sec-Fetch-Site: cross-site", { "sec-fetch-site": "cross-site" }],
      ["Sec-Fetch-Site: same-site", { "sec-fetch-site": "same-site" }],
      ["an X-Forwarded-For header", { "x-forwarded-for": "203.0.113.9" }],
      ["a Forwarded header", { forwarded: "for=203.0.113.9" }],
    ])("refuses %s", async (_name, headers) => {
      const res = await put(true, { headers });

      expect(res.status).toBe(403);
      expect(res.body.error).toMatch(REFUSED);
      expect(isNetworkAccessAllowed()).toBe(false);
      expect(
        listeners()
          .addresses()
          .map((a) => a.address),
      ).not.toContain("::");
      expect(() => settings()).toThrow(/ENOENT/);
    });

    it("refuses a body that isn't JSON, even one that says on", async () => {
      const res = await put(true, {
        body: '{"allowNetwork":true}',
        headers: { "content-type": "text/plain" },
      });

      expect(res.status).toBe(403);
      expect(isNetworkAccessAllowed()).toBe(false);
    });

    it("refuses a form post", async () => {
      const res = await put(true, {
        body: "allowNetwork=true",
        headers: { "content-type": "application/x-www-form-urlencoded" },
      });

      expect(res.status).toBe(403);
      expect(isNetworkAccessAllowed()).toBe(false);
    });

    it.each([
      ["a string", '{"allowNetwork":"true"}'],
      ["a number", '{"allowNetwork":1}'],
      ["nothing", "{}"],
    ])("answers 400 when allowNetwork is %s", async (_name, body) => {
      const res = await put(true, { body });

      expect(res.status).toBe(400);
      expect(isNetworkAccessAllowed()).toBe(false);
    });

    it.skipIf(LAN_ADDRESS == null)(
      "refuses a request from another address on this computer",
      async () => {
        await put(true);

        // Connecting to the computer's own network address shows up as that
        // address, as another computer's would.
        const res = await send(port(), {
          connectTo: LAN_ADDRESS,
          body: JSON.stringify({ allowNetwork: true }),
        });

        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(REFUSED);
      },
    );

    it.skipIf(LAN_ADDRESS == null)(
      "doesn't answer on this computer's network address while it is off",
      async () => {
        await expect(
          send(port(), { connectTo: LAN_ADDRESS }),
        ).rejects.toMatchObject({ code: "ECONNREFUSED" });
      },
    );
  });

  describe("turning off", () => {
    beforeEach(async () => {
      await put(true);
    });

    it("switches back to this computer only", async () => {
      const res = await put(false);

      expect(res.body).toStrictEqual({ allowNetwork: false });
      expect(isNetworkAccessAllowed()).toBe(false);
      expect(settings().allowNetwork).toBe(false);
      expect(shown()).toBe(0);
    });

    it.each([
      ["a tunnel's Host", { host: "demo.trycloudflare.com" }],
      ["a foreign Origin", { origin: "https://evil.example" }],
      ["a proxy header", { "x-forwarded-for": "203.0.113.9" }],
    ])("is allowed with %s", async (_name, headers) => {
      const res = await put(false, { headers });

      expect(res.body.allowNetwork).toBe(false);
      expect(isNetworkAccessAllowed()).toBe(false);
    });

    it("still needs a JSON body", async () => {
      const res = await put(false, {
        headers: { "content-type": "text/plain" },
      });

      expect(res.status).toBe(403);
      expect(isNetworkAccessAllowed()).toBe(true);
    });

    it.skipIf(LAN_ADDRESS == null)(
      "is allowed from another address, and that device still gets the answer",
      async () => {
        const res = await send(port(), {
          connectTo: LAN_ADDRESS,
          body: JSON.stringify({ allowNetwork: false }),
        });

        expect(res.body).toStrictEqual({ allowNetwork: false });
        expect(isNetworkAccessAllowed()).toBe(false);
        await expect(
          send(port(), { connectTo: LAN_ADDRESS }),
        ).rejects.toMatchObject({ code: "ECONNREFUSED" });
      },
    );
  });

  describe("when the switch fails", () => {
    it("reports this computer only, not what was asked", async () => {
      failures.failNext("EACCES", 1);

      const res = await put(true);

      expect(res.status).toBe(200);
      expect(res.body.allowNetwork).toBe(false);
      expect(res.body.message).toMatch(/only this computer can connect/);
      expect(isNetworkAccessAllowed()).toBe(false);
      expect(settings().allowNetwork).toBe(false);
      expect(shown()).toBe(0);
      const after = await send(port(), { method: "GET" });

      expect(after.body.allowNetwork).toBe(false);
    });
  });

  it("answers 503 once the listeners are closed", async () => {
    await listeners().close();

    const app = express();

    app.use(express.json());
    registerNetworkAccessRoutes(app);

    const bareServer = createServer(app);

    await new Promise<void>((resolve) =>
      bareServer.listen(0, "127.0.0.1", resolve),
    );

    try {
      const { port: bare } = bareServer.address() as { port: number };
      const res = await send(bare, {
        body: JSON.stringify({ allowNetwork: false }),
      });

      expect(res.status).toBe(503);
    } finally {
      bareServer.closeAllConnections();
      await new Promise((resolve) => bareServer.close(resolve));
    }
  });
});

describe("the Express app", () => {
  it("serves /network-access", async () => {
    const answer = await withExpressApp(async (baseUrl) => {
      const response = await fetch(`${baseUrl}/network-access`);

      return { status: response.status, body: await response.json() };
    });

    expect(answer).toStrictEqual({
      status: 200,
      body: { allowNetwork: false },
    });
  });
});
