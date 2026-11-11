// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { Socket } from "node:net";
import { describe, expect, it, vi } from "vitest";
import { type HttpListeners } from "../../helpers/http/http-listeners.ts";
import { isNetworkAccessAllowed } from "../../helpers/http/network-access-state.ts";
import { useTempConfigDir } from "../../tests/config-dir-test-helpers.ts";
import { mockMax } from "../../tests/express-app-test-helpers.ts";
import {
  HAS_IPV6_LOOPBACK,
  savedSettings,
  shownOnDevice,
  useRouteServer,
} from "./network-access-test-helpers.ts";

// How a switch behaves around the connection that asked for it: kept until it
// is answered, even with other switches queued, and never left listening on
// nothing because of it.
describe("PUT /network-access lifecycle", () => {
  const configDir = useTempConfigDir();
  const server = useRouteServer();
  const { failures, put } = server;
  const listeners = (): HttpListeners => server.listeners();
  const port = (): number => server.port();
  const arrivedCount = (count: number): Promise<void> =>
    vi.waitFor(() => expect(server.arrived()).toBeGreaterThanOrEqual(count));

  it.skipIf(!HAS_IPV6_LOOPBACK)(
    "answers a request that came in on the ::1 listener",
    async () => {
      const res = await put(true, {
        connectTo: "::1",
        headers: { host: `[::1]:${port()}` },
      });

      expect(res.body).toStrictEqual({ allowNetwork: true });
      expect(isNetworkAccessAllowed()).toBe(true);
    },
  );

  it("answers two overlapping switches, each with its own result", async () => {
    // Hold the queue so both requests are in before either switch starts.
    let open: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      open = resolve;
    });
    const blocker = listeners().setAllowNetwork(false, {
      keep: new Socket(),
      answer: () => gate,
    });
    const first = put(true);
    const second = put(false);

    await arrivedCount(2);
    open();
    await blocker;

    await expect(first).resolves.toMatchObject({
      body: { allowNetwork: true },
    });
    await expect(second).resolves.toMatchObject({
      body: { allowNetwork: false },
    });
    expect(isNetworkAccessAllowed()).toBe(false);
  });

  it("answers a switch even when the device switches right behind it", async () => {
    const answered = put(true);

    await arrivedCount(1);
    mockMax.handlers.get("allowNetwork")?.(0);

    await expect(answered).resolves.toMatchObject({
      body: { allowNetwork: true },
    });
    await vi.waitFor(() => expect(isNetworkAccessAllowed()).toBe(false));
    expect(shownOnDevice()).toBe(0);
  });

  describe("when the new listener can't take the port", () => {
    it("drops the kept connection and tries once more", async () => {
      failures.failNext("EADDRINUSE", 1);

      await expect(put(true)).rejects.toThrow(/socket hang up/);

      // The client hangs up before the switch is finished.
      await vi.waitFor(() => expect(shownOnDevice()).toBe(1));
      expect(isNetworkAccessAllowed()).toBe(true);
      expect(savedSettings(configDir()).allowNetwork).toBe(true);
    });

    it("falls back to this computer only, and answers nothing false", async () => {
      failures.failNext("EADDRINUSE", 2);

      await expect(put(true)).rejects.toThrow(/socket hang up/);

      await vi.waitFor(() =>
        expect(savedSettings(configDir()).allowNetwork).toBe(false),
      );
      expect(isNetworkAccessAllowed()).toBe(false);
      expect(listeners().addresses().length).toBeGreaterThan(0);
      expect(shownOnDevice()).toBe(0);
    });

    it("keeps the connection for other failures and says what is true", async () => {
      failures.failNext("EACCES", 1);

      const res = await put(true);

      expect(res.body.allowNetwork).toBe(false);
      expect(res.body.message).toMatch(/only this computer can connect/);
    });
  });

  it("doesn't say anyone can connect when nothing is listening", async () => {
    await put(true);
    failures.failNext("EACCES");

    const res = await put(false);

    expect(res.body.allowNetwork).toBe(false);
    expect(res.body.message).toMatch(/nothing can connect right now/);
    expect(res.body.message).not.toMatch(/only this computer/);
    expect(listeners().addresses()).toStrictEqual([]);

    failures.reset();
    await listeners().setAllowNetwork(false);

    expect(listeners().addresses().length).toBeGreaterThan(0);
  });
});
