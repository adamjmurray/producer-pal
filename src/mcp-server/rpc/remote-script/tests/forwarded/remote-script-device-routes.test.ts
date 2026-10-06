// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { RACK_MACROS_ROUTE } from "#src/tools/shared/remote-script/rack-macros-contract.ts";
import { SIMPLER_SETTINGS_ROUTES } from "#src/tools/shared/remote-script/simpler-settings-contract.ts";
import { dispatchNodeRoute } from "../../../../tests/config-dir-test-helpers.ts";
import { registerRemoteScriptDeviceRoutes } from "../../forwarded/remote-script-device-routes.ts";
import {
  OUTDATED_ANSWER,
  unknownRouteAnswer,
  useFakeRemoteScriptRoutes,
} from "../remote-script-test-helpers.ts";

const PATHS = ["live_set tracks 0 devices 0", "live_set tracks 1 devices 2"];

const EXPIRES_IN_MS = 5000;

const LOST =
  "the connection to the Producer Pal remote script was lost before it answered";

const answerWith = useFakeRemoteScriptRoutes(registerRemoteScriptDeviceRoutes);

describe("remoteScript.device.macros", () => {
  it("sends the paths in the remote script's spelling and hands back its answer", async () => {
    const result = { racks: [{ mapped: [7] }, { error: "not a rack" }] };
    const remote = await answerWith({ body: result });

    expect(
      await dispatchNodeRoute(RACK_MACROS_ROUTE, { devicePaths: PATHS }),
    ).toStrictEqual({ success: true, result: { available: true, result } });
    expect(remote.requests).toStrictEqual([
      {
        method: "POST",
        route: "/device/macros",
        query: {},
        body: { device_paths: PATHS },
      },
    ]);
  });

  it("hands back why the remote script refused", async () => {
    await answerWith({ status: 400, body: { error: "device_paths is empty" } });

    expect(
      await dispatchNodeRoute(RACK_MACROS_ROUTE, { devicePaths: PATHS }),
    ).toStrictEqual({
      success: true,
      result: { available: true, error: "device_paths is empty" },
    });
  });

  it("words a route an older remote script lacks as out of date", async () => {
    await answerWith(unknownRouteAnswer("/device/macros"));

    expect(
      await dispatchNodeRoute(RACK_MACROS_ROUTE, { devicePaths: PATHS }),
    ).toStrictEqual({ success: true, result: OUTDATED_ANSWER });
  });

  it("words a dropped connection as a lost connection, not a timeout, and stops like no answer", async () => {
    await answerWith({ drop: true });

    expect(
      await dispatchNodeRoute(RACK_MACROS_ROUTE, { devicePaths: PATHS }),
    ).toStrictEqual({
      success: true,
      result: {
        available: true,
        error: LOST,
        unfinished: true,
      },
    });
  });

  it("refuses args that aren't a list of paths", async () => {
    await answerWith({ body: {} });

    expect(
      await dispatchNodeRoute(RACK_MACROS_ROUTE, { devicePaths: [1] }),
    ).toStrictEqual({
      success: false,
      error: "devicePaths must be a list of strings",
    });
  });
});

describe("remoteScript.device.simplerRead", () => {
  it("sends the paths in the remote script's spelling and hands back its answer", async () => {
    const result = {
      simplers: [
        { pitch_bend_range: 5, note_pitch_bend_range: 48 },
        { error: "not a Simpler" },
      ],
    };
    const remote = await answerWith({ body: result });

    expect(
      await dispatchNodeRoute(SIMPLER_SETTINGS_ROUTES.read, {
        devicePaths: PATHS,
      }),
    ).toStrictEqual({ success: true, result: { available: true, result } });
    expect(remote.requests).toStrictEqual([
      {
        method: "POST",
        route: "/device/simpler/read",
        query: {},
        body: { device_paths: PATHS },
      },
    ]);
  });

  it("words a route an older remote script lacks as out of date", async () => {
    await answerWith(unknownRouteAnswer("/device/simpler/read"));

    expect(
      await dispatchNodeRoute(SIMPLER_SETTINGS_ROUTES.read, {
        devicePaths: PATHS,
      }),
    ).toStrictEqual({ success: true, result: OUTDATED_ANSWER });
  });

  it("refuses args that aren't a list of paths", async () => {
    await answerWith({ body: {} });

    expect(
      await dispatchNodeRoute(SIMPLER_SETTINGS_ROUTES.read, {
        devicePaths: "live_set tracks 0 devices 0",
      }),
    ).toStrictEqual({
      success: false,
      error: "devicePaths must be a list of strings",
    });
  });
});

describe("remoteScript.device.simplerWrite", () => {
  it("sends what was asked in the remote script's spelling and hands back what it read", async () => {
    const result = { pitch_bend_range: 12, note_pitch_bend_range: 48 };
    const remote = await answerWith({ body: result });

    expect(
      await dispatchNodeRoute(SIMPLER_SETTINGS_ROUTES.write, {
        devicePath: PATHS[0],
        pitchBendRange: 12,
        expiresInMs: EXPIRES_IN_MS,
      }),
    ).toStrictEqual({ success: true, result: { available: true, result } });
    expect(remote.requests).toStrictEqual([
      {
        method: "POST",
        route: "/device/simpler/write",
        query: {},
        body: {
          device_path: PATHS[0],
          pitch_bend_range: 12,
          expires_in_ms: EXPIRES_IN_MS,
        },
      },
    ]);
  });

  it("sends both settings when both are asked for", async () => {
    const remote = await answerWith({ body: {} });

    await dispatchNodeRoute(SIMPLER_SETTINGS_ROUTES.write, {
      devicePath: PATHS[0],
      pitchBendRange: 0,
      notePitchBendRange: 24,
      expiresInMs: EXPIRES_IN_MS,
    });

    expect(remote.requests[0]?.body).toStrictEqual({
      device_path: PATHS[0],
      pitch_bend_range: 0,
      note_pitch_bend_range: 24,
      expires_in_ms: EXPIRES_IN_MS,
    });
  });

  it("hands back why the remote script refused", async () => {
    await answerWith({
      status: 400,
      body: { error: "pitch_bend_range must be 0 to 24, got 25" },
    });

    expect(
      await dispatchNodeRoute(SIMPLER_SETTINGS_ROUTES.write, {
        devicePath: PATHS[0],
        pitchBendRange: 25,
        expiresInMs: EXPIRES_IN_MS,
      }),
    ).toStrictEqual({
      success: true,
      result: {
        available: true,
        error: "pitch_bend_range must be 0 to 24, got 25",
      },
    });
  });

  it("words a route an older remote script lacks as out of date", async () => {
    await answerWith(unknownRouteAnswer("/device/simpler/write"));

    expect(
      await dispatchNodeRoute(SIMPLER_SETTINGS_ROUTES.write, {
        devicePath: PATHS[0],
        pitchBendRange: 3,
        expiresInMs: EXPIRES_IN_MS,
      }),
    ).toStrictEqual({ success: true, result: OUTDATED_ANSWER });
  });

  it("says a dropped connection is not a timeout, and that the write may have landed", async () => {
    await answerWith({ drop: true });

    expect(
      await dispatchNodeRoute(SIMPLER_SETTINGS_ROUTES.write, {
        devicePath: PATHS[0],
        pitchBendRange: 3,
        expiresInMs: EXPIRES_IN_MS,
      }),
    ).toStrictEqual({
      success: true,
      result: {
        available: true,
        error: LOST,
        unfinished: true,
      },
    });
  });

  it("calls a write the remote script never answered a timeout", async () => {
    await answerWith(null);

    expect(
      await dispatchNodeRoute(SIMPLER_SETTINGS_ROUTES.write, {
        devicePath: PATHS[0],
        pitchBendRange: 3,
        expiresInMs: 40,
      }),
    ).toStrictEqual({
      success: false,
      error: "the Producer Pal remote script did not answer in time",
    });
  });

  it("refuses a call with no expiry, sending nothing", async () => {
    const remote = await answerWith({ body: {} });

    expect(
      await dispatchNodeRoute(SIMPLER_SETTINGS_ROUTES.write, {
        devicePath: PATHS[0],
        pitchBendRange: 3,
      }),
    ).toStrictEqual({
      success: false,
      error: "expiresInMs must be a number, 0 or more",
    });
    expect(remote.requests).toStrictEqual([]);
  });

  it("sends nothing once the expiry is used up, and says nothing changed", async () => {
    const remote = await answerWith({ body: {} });

    expect(
      await dispatchNodeRoute(SIMPLER_SETTINGS_ROUTES.write, {
        devicePath: PATHS[0],
        pitchBendRange: 3,
        expiresInMs: 0,
      }),
    ).toStrictEqual({
      success: true,
      result: {
        available: true,
        error: "ran out of time before the request left",
      },
    });
    expect(remote.requests).toStrictEqual([]);
  });

  it("marks a write Live started but didn't finish as unfinished", async () => {
    await answerWith({
      status: 504,
      body: {
        error: "Live started the request but didn't finish it",
        started: true,
      },
    });

    expect(
      await dispatchNodeRoute(SIMPLER_SETTINGS_ROUTES.write, {
        devicePath: PATHS[0],
        pitchBendRange: 3,
        expiresInMs: EXPIRES_IN_MS,
      }),
    ).toStrictEqual({
      success: true,
      result: {
        available: true,
        error: "Live started the request but didn't finish it",
        unfinished: true,
      },
    });
  });

  it("refuses a device path that isn't a string", async () => {
    await answerWith({ body: {} });

    expect(
      await dispatchNodeRoute(SIMPLER_SETTINGS_ROUTES.write, {
        devicePath: 3,
        pitchBendRange: 3,
        expiresInMs: EXPIRES_IN_MS,
      }),
    ).toStrictEqual({ success: false, error: "devicePath must be a string" });
  });
});
