// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { RACK_MACROS_ROUTE } from "#src/tools/shared/remote-script/rack-macros-contract.ts";
import { dispatchNodeRoute } from "../../../tests/config-dir-test-helpers.ts";
import { registerRemoteScriptDeviceRoutes } from "../forwarded/remote-script-device-routes.ts";
import { useFakeRemoteScriptRoutes } from "./remote-script-test-helpers.ts";

const PATHS = ["live_set tracks 0 devices 0", "live_set tracks 1 devices 2"];

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

  it("treats a 404 as no remote script: an older one doesn't have the route", async () => {
    await answerWith({
      status: 404,
      body: { error: "unknown route", routes: ["/ping"] },
    });

    expect(
      await dispatchNodeRoute(RACK_MACROS_ROUTE, { devicePaths: PATHS }),
    ).toStrictEqual({ success: true, result: { available: false } });
  });

  it("words a dropped connection as no answer", async () => {
    await answerWith({ drop: true });

    expect(
      await dispatchNodeRoute(RACK_MACROS_ROUTE, { devicePaths: PATHS }),
    ).toStrictEqual({
      success: false,
      error: "the Producer Pal remote script did not answer in time",
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
