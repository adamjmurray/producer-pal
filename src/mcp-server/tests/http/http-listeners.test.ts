// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { readFileSync, writeFileSync } from "node:fs";
import { createServer, type RequestListener, type Server } from "node:http";
import { type AddressInfo, connect } from "node:net";
import { networkInterfaces } from "node:os";
import { join } from "node:path";
import Max from "max-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_MCP_PORT } from "#src/shared/config.ts";
import {
  type HttpListeners,
  parseServerArgs,
  startHttpListeners,
} from "../../helpers/http/http-listeners.ts";
import { isNetworkAccessAllowed } from "../../helpers/http/network-access-state.ts";
import { useTempConfigDir } from "../config-dir-test-helpers.ts";
import { mockMax } from "../express-app-test-helpers.ts";

const app: RequestListener = (_req, res) => res.end("ok");

const hasIpv6Loopback = Object.values(networkInterfaces()).some((addrs) =>
  addrs?.some((addr) => addr.address === "::1"),
);

const LOOPBACK = hasIpv6Loopback ? ["127.0.0.1", "::1"] : ["127.0.0.1"];
const WILDCARDS = ["::", "0.0.0.0"];

/**
 * A server whose listen fails with `code`, like a refused bind.
 *
 * @param code - The bind error code
 * @returns The server
 */
function failingServer(code: string): Server {
  const server = createServer(app);

  server.listen = (() => {
    process.nextTick(() =>
      server.emit("error", Object.assign(new Error(code), { code })),
    );

    return server;
  }) as Server["listen"];

  return server;
}

/**
 * A server factory that fails the `nth` server created (1-based) with `code`.
 *
 * @param nth - Which server to fail
 * @param code - The bind error code
 * @returns The factory
 */
function failNth(nth: number, code: string): (a: RequestListener) => Server {
  let count = 0;

  return (handler) => {
    count++;

    return count === nth ? failingServer(code) : createServer(handler);
  };
}

async function listenHolder(host?: string): Promise<Server> {
  const holder = createServer(app);

  await new Promise<void>((resolve) =>
    holder.listen({ port: 0, host }, resolve),
  );

  return holder;
}

function hosts(listeners: HttpListeners): string[] {
  return listeners.addresses().map((address) => address.address);
}

function ports(listeners: HttpListeners): number[] {
  return listeners.addresses().map((address) => address.port);
}

function posted(text: string): boolean {
  return vi
    .mocked(Max.post)
    .mock.calls.some(
      ([message]) => typeof message === "string" && message.includes(text),
    );
}

function lastShownState(): unknown {
  const calls = vi
    .mocked(Max.outlet)
    .mock.calls.filter(
      (call) => call[0] === "config" && call[1] === "allowNetwork",
    );

  return calls.at(-1)?.[2];
}

describe("startHttpListeners", () => {
  const configDir = useTempConfigDir();
  let listeners: HttpListeners | undefined;

  const settingsPath = (): string => join(configDir(), "settings.json");
  const storeSettings = (settings: object): void =>
    writeFileSync(settingsPath(), JSON.stringify(settings));
  const storedSettings = (): Record<string, unknown> =>
    JSON.parse(readFileSync(settingsPath(), "utf8")) as Record<string, unknown>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await listeners?.close();
    listeners = undefined;
  });

  describe("network access off", () => {
    it("listens on 127.0.0.1 and ::1 on one port by default", async () => {
      const onListening = vi.fn();

      listeners = await startHttpListeners(app, { port: 0, onListening });

      expect(onListening).toHaveBeenCalledOnce();
      expect(hosts(listeners)).toStrictEqual(LOOPBACK);
      expect(new Set(ports(listeners)).size).toBe(1);
      expect(posted("only this computer can connect")).toBe(true);
      expect(lastShownState()).toBe(0);
    });

    it("answers on both loopback addresses", async () => {
      listeners = await startHttpListeners(app, { port: 0 });
      const port = ports(listeners)[0];

      const v4 = await fetch(`http://127.0.0.1:${port}/`);

      expect(await v4.text()).toBe("ok");

      if (hasIpv6Loopback) {
        const v6 = await fetch(`http://[::1]:${port}/`);

        expect(await v6.text()).toBe("ok");
      }
    });

    it.each([
      ["a string", { allowNetwork: "true" }],
      ["a number", { allowNetwork: 1 }],
      ["false", { allowNetwork: false }],
    ])("stays off when the stored value is %s", async (_name, settings) => {
      storeSettings(settings);
      listeners = await startHttpListeners(app, { port: 0 });

      expect(hosts(listeners)).toStrictEqual(LOOPBACK);
    });

    it("stays off when the settings file is malformed", async () => {
      writeFileSync(settingsPath(), "{not json");
      listeners = await startHttpListeners(app, { port: 0 });

      expect(hosts(listeners)).toStrictEqual(LOOPBACK);
    });

    it.each(["EADDRNOTAVAIL", "EAFNOSUPPORT", "EINVAL"])(
      "carries on with 127.0.0.1 when ::1 fails with %s",
      async (code) => {
        listeners = await startHttpListeners(app, {
          port: 0,
          create: failNth(2, code),
        });

        expect(hosts(listeners)).toStrictEqual(["127.0.0.1"]);
        expect(posted(`IPv6 is unavailable (${code})`)).toBe(true);
      },
    );

    it("fails when ::1's port is in use, closing 127.0.0.1", async () => {
      const created: Server[] = [];
      const factory = failNth(2, "EADDRINUSE");

      await expect(
        startHttpListeners(app, {
          port: 0,
          create: (handler) => {
            const server = factory(handler);

            created.push(server);

            return server;
          },
        }),
      ).rejects.toThrow("is already in use");
      expect(created[0]?.listening).toBe(false);
    });

    it("reports any other bind error", async () => {
      await expect(
        startHttpListeners(app, { port: 0, create: failNth(1, "EACCES") }),
      ).rejects.toThrow("Producer Pal failed to start: EACCES");
    });
  });

  describe("port conflicts", () => {
    it.each([
      ["127.0.0.1", "127.0.0.1", false],
      ["a wildcard socket", undefined, false],
      ["127.0.0.1, with network access on", "127.0.0.1", true],
    ])(
      "fails when %s already holds the port",
      async (_name, holderHost, allowNetwork) => {
        const holder = await listenHolder(holderHost);
        const { port } = holder.address() as AddressInfo;

        storeSettings({ allowNetwork });

        try {
          await expect(startHttpListeners(app, { port })).rejects.toThrow(
            `Producer Pal failed to start: Port ${port} is already in use.`,
          );
        } finally {
          await new Promise((resolve) => holder.close(resolve));
        }
      },
    );
  });

  describe("network access on", () => {
    it("listens on all interfaces when saved on, and warns", async () => {
      storeSettings({ allowNetwork: true });
      listeners = await startHttpListeners(app, { port: 0 });

      expect(hosts(listeners)).toHaveLength(1);
      expect(WILDCARDS).toContain(hosts(listeners)[0]);
      expect(posted("Anyone on your network can control Live")).toBe(true);
      expect(lastShownState()).toBe(1);
    });
  });

  describe("toggling", () => {
    it("re-listens on the same port, saves, and shows the state", async () => {
      storeSettings({ autoUpdateCheck: false });
      listeners = await startHttpListeners(app, { port: 0 });
      const [port] = ports(listeners);

      await listeners.setAllowNetwork(true);

      expect(WILDCARDS).toContain(hosts(listeners)[0]);
      expect(ports(listeners)).toStrictEqual([port]);
      expect(storedSettings()).toStrictEqual({
        autoUpdateCheck: false,
        allowNetwork: true,
      });
      expect(lastShownState()).toBe(1);

      await listeners.setAllowNetwork(false);

      expect(hosts(listeners)).toStrictEqual(LOOPBACK);
      expect(new Set(ports(listeners))).toStrictEqual(new Set([port]));
      expect(storedSettings().allowNetwork).toBe(false);
      expect(lastShownState()).toBe(0);

      const response = await fetch(`http://127.0.0.1:${port}/`);

      expect(await response.text()).toBe("ok");
    });

    it("only re-shows the state when the setting is unchanged", async () => {
      listeners = await startHttpListeners(app, { port: 0 });
      const before = listeners.addresses();

      vi.clearAllMocks();
      await listeners.setAllowNetwork(false);

      expect(listeners.addresses()).toStrictEqual(before);
      expect(Max.post).not.toHaveBeenCalled();
      expect(lastShownState()).toBe(0);
    });

    it.each([
      [1, true],
      ["1", true],
      ["0", false],
      [0, false],
      [true, false],
      ["on", false],
    ])("treats the message value %j as on: %s", async (value, on) => {
      listeners = await startHttpListeners(app, { port: 0 });

      mockMax.handlers.get("allowNetwork")?.(value);

      await vi.waitFor(() => expect(lastShownState()).toBe(on ? 1 : 0));
      expect(WILDCARDS.includes(hosts(listeners!)[0] as string)).toBe(on);
    });

    it("drops connections that are already open when turned off", async () => {
      storeSettings({ allowNetwork: true });
      listeners = await startHttpListeners(app, { port: 0 });
      const socket = connect(ports(listeners)[0] as number, "127.0.0.1");
      const closed = new Promise<void>((resolve) =>
        socket.on("close", () => resolve()),
      );

      socket.on("error", () => undefined);
      await new Promise((resolve) => socket.on("connect", resolve));
      await listeners.setAllowNetwork(false);

      await expect(closed).resolves.toBeUndefined();
    });

    it("falls back to this computer only when opening fails", async () => {
      let failNext = false;

      listeners = await startHttpListeners(app, {
        port: 0,
        create: (handler) => {
          const server = failNext
            ? failingServer("EACCES")
            : createServer(handler);

          failNext = false;

          return server;
        },
      });

      failNext = true;
      await listeners.setAllowNetwork(true);

      expect(hosts(listeners)).toStrictEqual(LOOPBACK);
      expect(posted("Producer Pal failed to start: EACCES")).toBe(true);
      expect(storedSettings().allowNetwork).toBe(false);
      expect(lastShownState()).toBe(0);
    });

    it("retries an unchanged value when nothing is listening", async () => {
      let failing = false;

      storeSettings({ allowNetwork: true });
      listeners = await startHttpListeners(app, {
        port: 0,
        create: (handler) =>
          failing ? failingServer("EACCES") : createServer(handler),
      });

      failing = true;
      await listeners.setAllowNetwork(false);

      expect(listeners.addresses()).toStrictEqual([]);

      failing = false;
      await listeners.setAllowNetwork(false);

      expect(hosts(listeners)).toStrictEqual(LOOPBACK);
    });

    it("keeps working when the setting can't be saved", async () => {
      const blocker = join(configDir(), "not-a-dir");

      writeFileSync(blocker, "");
      process.env.PRODUCER_PAL_CONFIG_DIR = join(blocker, "sub");
      listeners = await startHttpListeners(app, { port: 0 });

      await listeners.setAllowNetwork(true);

      expect(WILDCARDS).toContain(hosts(listeners)[0]);
      expect(posted("couldn't save the network setting")).toBe(true);
    });
  });
});

describe("network access state for request guards", () => {
  const configDir = useTempConfigDir();
  let listeners: HttpListeners | undefined;

  afterEach(async () => {
    await listeners?.close();
    listeners = undefined;
  });

  it("is off when listening on this computer only", async () => {
    listeners = await startHttpListeners(app, { port: 0 });

    expect(isNetworkAccessAllowed()).toBe(false);
  });

  it("is on when started with network access on", async () => {
    writeFileSync(
      join(configDir(), "settings.json"),
      JSON.stringify({ allowNetwork: true }),
    );
    listeners = await startHttpListeners(app, { port: 0 });

    expect(isNetworkAccessAllowed()).toBe(true);
  });

  it("follows each toggle", async () => {
    listeners = await startHttpListeners(app, { port: 0 });

    await listeners.setAllowNetwork(true);
    expect(isNetworkAccessAllowed()).toBe(true);

    await listeners.setAllowNetwork(false);
    expect(isNetworkAccessAllowed()).toBe(false);
  });

  it("stays off when opening the network fails", async () => {
    let failNext = false;

    listeners = await startHttpListeners(app, {
      port: 0,
      create: (handler) => {
        const server = failNext
          ? failingServer("EACCES")
          : createServer(handler);

        failNext = false;

        return server;
      },
    });

    failNext = true;
    await listeners.setAllowNetwork(true);

    expect(isNetworkAccessAllowed()).toBe(false);
  });

  it("is off while nothing is listening after a failed switch", async () => {
    writeFileSync(
      join(configDir(), "settings.json"),
      JSON.stringify({ allowNetwork: true }),
    );
    let failing = false;

    listeners = await startHttpListeners(app, {
      port: 0,
      create: (handler) =>
        failing ? failingServer("EACCES") : createServer(handler),
    });

    failing = true;
    await listeners.setAllowNetwork(false);

    expect(isNetworkAccessAllowed()).toBe(false);
  });
});

describe("parseServerArgs", () => {
  it("defaults to the default port", () => {
    expect(parseServerArgs(["node", "mcp-server.mjs"])).toStrictEqual({
      port: DEFAULT_MCP_PORT,
    });
  });

  it("reads the port and ignores other arguments", () => {
    expect(
      parseServerArgs(["node", "x", "port", "3400", "allowNetwork", "1"]),
    ).toStrictEqual({ port: 3400 });
  });

  it("rejects a missing or invalid port", () => {
    expect(() => parseServerArgs(["port"])).toThrow("Missing port value");
    expect(() => parseServerArgs(["port", "abc"])).toThrow("Invalid port: abc");
  });
});
