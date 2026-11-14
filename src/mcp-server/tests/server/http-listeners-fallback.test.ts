// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { writeFileSync } from "node:fs";
import { createServer, type RequestListener, type Server } from "node:http";
import { join } from "node:path";
import Max from "max-api";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type HttpListeners,
  startHttpListeners,
} from "../../helpers/http/http-listeners.ts";
import { isNetworkAccessAllowed } from "../../helpers/http/network-access-state.ts";
import { useTempConfigDir } from "../config-dir-test-helpers.ts";
import { failingServer } from "../http/listen-failure-test-helpers.ts";

const app: RequestListener = (_req, res) => res.end("ok");

describe("startHttpListeners when listening fails", () => {
  const configDir = useTempConfigDir();
  let listeners: HttpListeners | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    await listeners?.close();
    listeners = undefined;
  });

  it("stays off, and says so, when opening the network and the fallback both fail", async () => {
    let failing = false;

    listeners = await startHttpListeners(app, {
      port: 0,
      create: (handler) =>
        failing ? failingServer("EACCES", handler) : createServer(handler),
    });

    failing = true;
    await listeners.setAllowNetwork(true);

    const failures = vi
      .mocked(Max.post)
      .mock.calls.filter(
        ([text]) => typeof text === "string" && text.includes("EACCES"),
      );

    expect(listeners.addresses()).toStrictEqual([]);
    expect(isNetworkAccessAllowed()).toBe(false);
    expect(failures).toHaveLength(2);
  });

  it("starts on the requested port when a server can't report its address", async () => {
    writeFileSync(
      join(configDir(), "settings.json"),
      JSON.stringify({ allowNetwork: true }),
    );

    const unreported = (handler: RequestListener): Server => {
      const server = createServer(handler);

      server.address = () => null;

      return server;
    };

    listeners = await startHttpListeners(app, { port: 0, create: unreported });

    expect(listeners.addresses()).toStrictEqual([null]);
    expect(isNetworkAccessAllowed()).toBe(true);
  });
});
