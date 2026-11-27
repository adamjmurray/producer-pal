// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { DEVICE_CONVERSION_ROUTES } from "#src/tools/shared/remote-script/device-conversions/device-conversions-contract.ts";
import { dispatchNodeRoute } from "../../../../tests/config-dir-test-helpers.ts";
import { registerRemoteScriptDeviceRoutes } from "../../forwarded/remote-script-device-routes.ts";
import { useFakeRemoteScriptRoutes } from "../remote-script-test-helpers.ts";

const DEVICE_PATH = "live_set tracks 0 devices 0";
const EXPIRES_IN_MS = 5000;

const answerWith = useFakeRemoteScriptRoutes(registerRemoteScriptDeviceRoutes);

describe("remoteScript.track.toDrumRack", () => {
  it("sends the track and hands back the new track's place", async () => {
    const body = { track_index: 3, source_removed: true };
    const remote = await answerWith({ body });

    expect(
      await dispatchNodeRoute(DEVICE_CONVERSION_ROUTES.trackToDrumRack, {
        track: "t2",
        expiresInMs: EXPIRES_IN_MS,
      }),
    ).toStrictEqual({
      success: true,
      result: { available: true, result: body },
    });
    expect(remote.requests).toStrictEqual([
      {
        method: "POST",
        route: "/track/to-drum-rack",
        query: {},
        body: { track: "t2", expires_in_ms: EXPIRES_IN_MS },
      },
    ]);
  });

  it("hands back why the remote script refused", async () => {
    await answerWith({
      status: 409,
      body: { error: "the track has no devices" },
    });

    expect(
      await dispatchNodeRoute(DEVICE_CONVERSION_ROUTES.trackToDrumRack, {
        track: "t2",
        expiresInMs: EXPIRES_IN_MS,
      }),
    ).toStrictEqual({
      success: true,
      result: { available: true, error: "the track has no devices" },
    });
  });

  it("refuses a track that isn't a string", async () => {
    const remote = await answerWith({ body: {} });

    expect(
      await dispatchNodeRoute(DEVICE_CONVERSION_ROUTES.trackToDrumRack, {
        track: 2,
        expiresInMs: EXPIRES_IN_MS,
      }),
    ).toStrictEqual({ success: false, error: "track must be a string" });
    expect(remote.requests).toStrictEqual([]);
  });
});

describe("remoteScript.device.drumPadToTrack", () => {
  it("sends the rack's path and the note, and hands back the new track's place", async () => {
    const remote = await answerWith({ body: { track_index: 4 } });

    expect(
      await dispatchNodeRoute(DEVICE_CONVERSION_ROUTES.drumPadToTrack, {
        devicePath: DEVICE_PATH,
        note: 36,
        expiresInMs: EXPIRES_IN_MS,
      }),
    ).toStrictEqual({
      success: true,
      result: { available: true, result: { track_index: 4 } },
    });
    expect(remote.requests).toStrictEqual([
      {
        method: "POST",
        route: "/device/drum-pad/to-track",
        query: {},
        body: {
          device_path: DEVICE_PATH,
          note: 36,
          expires_in_ms: EXPIRES_IN_MS,
        },
      },
    ]);
  });

  it("hands back why the remote script refused", async () => {
    await answerWith({ status: 409, body: { error: "the pad is empty" } });

    expect(
      await dispatchNodeRoute(DEVICE_CONVERSION_ROUTES.drumPadToTrack, {
        devicePath: DEVICE_PATH,
        note: 36,
        expiresInMs: EXPIRES_IN_MS,
      }),
    ).toStrictEqual({
      success: true,
      result: { available: true, error: "the pad is empty" },
    });
  });

  it("refuses a device path that isn't a string", async () => {
    const remote = await answerWith({ body: {} });

    expect(
      await dispatchNodeRoute(DEVICE_CONVERSION_ROUTES.drumPadToTrack, {
        devicePath: 3,
        note: 36,
        expiresInMs: EXPIRES_IN_MS,
      }),
    ).toStrictEqual({ success: false, error: "devicePath must be a string" });
    expect(remote.requests).toStrictEqual([]);
  });
});
