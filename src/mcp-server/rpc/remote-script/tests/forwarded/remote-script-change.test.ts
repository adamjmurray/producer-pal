// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// A change whose connection dropped after the request went out is answered as
// one Live may have made, in plain words, on every route that makes changes.
// Any other failure is not dressed up as a lost connection.

import { afterEach, describe, expect, it, vi } from "vitest";
import { CONVERT_ROUTE } from "#src/tools/clip/convert/remote-script-convert-contract.ts";
import { REMOTE_SCRIPT_ROUTES } from "#src/tools/device/create/helpers/remote-script-contract.ts";
import { dispatchNodeRoute } from "../../../../tests/config-dir-test-helpers.ts";
import {
  failedChange,
  requestChange,
} from "../../forwarded/remote-script-change.ts";
import { forwardRemoteScriptRequest } from "../../forwarded/remote-script-forward.ts";
import { CONNECTION_LOST } from "../../remote-script-errors.ts";
import { registerRemoteScriptRoutes } from "../../remote-script-routes.ts";
import {
  callUntilItTimesOut,
  useFakeRemoteScriptRoutes,
} from "../remote-script-test-helpers.ts";

const DEVICE = "live_set tracks 0 devices 0";

const ROUTES = [
  [
    "load",
    REMOTE_SCRIPT_ROUTES.load,
    { type: "plugin", path: "a", trackIndex: 0, trackName: "t" },
  ],
  [
    "hotswap",
    REMOTE_SCRIPT_ROUTES.hotswap,
    { type: "plugin", path: "a", devicePath: DEVICE, deviceName: "d" },
  ],
  [
    "duplicateDevice",
    REMOTE_SCRIPT_ROUTES.duplicateDevice,
    { devicePath: DEVICE, deviceName: "d" },
  ],
  ["convert", CONVERT_ROUTE, { track: "t0", slot: 0, type: "drums" }],
] as const;

const answerWith = useFakeRemoteScriptRoutes(registerRemoteScriptRoutes);

afterEach(() => {
  vi.useRealTimers();
});

describe("requestChange", () => {
  it("answers a dropped connection as started, in plain words", async () => {
    await answerWith({ drop: true });

    const reply = await requestChange({
      route: "/hotswap",
      body: {},
      expiresInMs: 5000,
    });

    expect(reply).toStrictEqual({
      available: true,
      status: 502,
      body: { error: CONNECTION_LOST, started: true },
    });
    expect(
      failedChange(reply as Parameters<typeof failedChange>[0]),
    ).toStrictEqual({
      available: true,
      error: CONNECTION_LOST,
      unfinished: true,
    });
  });

  it("answers a cut-off reply the same way", async () => {
    await answerWith({ cut: '{"ok":' });

    expect(
      await requestChange({ route: "/hotswap", body: {}, expiresInMs: 5000 }),
    ).toStrictEqual({
      available: true,
      status: 502,
      body: { error: CONNECTION_LOST, started: true },
    });
  });

  it("answers no reply in time as started", async () => {
    const remote = await answerWith(null);

    expect(
      await callUntilItTimesOut(remote, 150, () =>
        requestChange({ route: "/hotswap", body: {}, expiresInMs: 100 }),
      ),
    ).toStrictEqual({
      available: true,
      status: 504,
      body: {
        error: expect.stringContaining("did not answer within"),
        started: true,
      },
    });
  });

  it("answers an expiry of 0 as not started", async () => {
    await answerWith({ body: {} });

    const reply = await requestChange({
      route: "/hotswap",
      body: {},
      expiresInMs: 0,
    });

    expect(reply).toStrictEqual({
      available: true,
      status: 504,
      body: { error: "ran out of time before the request left" },
    });
  });
});

describe("a request that throws for another reason", () => {
  // JSON can't carry a bigint, so building the request throws before any send.
  const UNSENDABLE = { count: 1n };

  it("is not called a lost connection by requestChange", async () => {
    await answerWith({ body: {} });

    await expect(
      requestChange({ route: "/hotswap", body: UNSENDABLE, expiresInMs: 5000 }),
    ).rejects.toThrow(TypeError);
  });

  it("is not called a lost connection by a forwarded route", async () => {
    await answerWith({ body: {} });

    await expect(
      forwardRemoteScriptRequest("/envelope/write", UNSENDABLE, 5000),
    ).rejects.toThrow(TypeError);
  });
});

describe("a change whose time ran out before the socket connected", () => {
  it("is not started, so the answer carries no unfinished note", async () => {
    await answerWith({ body: {} });
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });

    // Advancing before the event loop turns means the socket hasn't connected.
    const pending = requestChange({
      route: "/hotswap",
      body: {},
      expiresInMs: 100,
    });

    vi.advanceTimersByTime(150);

    const reply = await pending;

    expect(reply).toStrictEqual({
      available: true,
      status: 504,
      body: { error: "ran out of time before connecting to Live's browser" },
    });
    expect(
      failedChange(reply as Parameters<typeof failedChange>[0]),
    ).toStrictEqual({
      available: true,
      error: expect.stringContaining("before connecting"),
    });
  });
});

describe.each(ROUTES)("remoteScript.%s", (_name, route, args) => {
  it("is unfinished when the connection drops after the request went out", async () => {
    await answerWith({ drop: true });

    expect(
      await dispatchNodeRoute(route, { ...args, expiresInMs: 5000 }),
    ).toStrictEqual({
      success: true,
      result: { available: true, error: CONNECTION_LOST, unfinished: true },
    });
  });
});
