// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, expect, it } from "vitest";
import { DEVICE_BASICS_ROUTE } from "#src/tools/shared/remote-script/device-basics/device-basics-contract.ts";
import { dispatchNodeRoute } from "../../../../tests/config-dir-test-helpers.ts";
import { registerRemoteScriptDeviceRoutes } from "../../forwarded/remote-script-device-routes.ts";
import {
  OUTDATED_ANSWER,
  unknownRouteAnswer,
  useFakeRemoteScriptRoutes,
} from "../remote-script-test-helpers.ts";

const PATHS = ["live_set tracks 0 devices 0", "live_set tracks 1 devices 2"];

const answerWith = useFakeRemoteScriptRoutes(registerRemoteScriptDeviceRoutes);

describe("remoteScript.device.basics", () => {
  it("sends the paths in the remote script's spelling and hands back its answer", async () => {
    const result = {
      devices: [{ name: "Mod", is_active: false }, { error: "nothing there" }],
    };
    const remote = await answerWith({ body: result });

    expect(
      await dispatchNodeRoute(DEVICE_BASICS_ROUTE, { devicePaths: PATHS }),
    ).toStrictEqual({ success: true, result: { available: true, result } });
    expect(remote.requests).toStrictEqual([
      {
        method: "POST",
        route: "/device/basics",
        query: {},
        body: { device_paths: PATHS },
      },
    ]);
  });

  it("words a route an older remote script lacks as out of date", async () => {
    await answerWith(unknownRouteAnswer("/device/basics"));

    expect(
      await dispatchNodeRoute(DEVICE_BASICS_ROUTE, { devicePaths: PATHS }),
    ).toStrictEqual({ success: true, result: OUTDATED_ANSWER });
  });

  it("refuses args that aren't a list of paths", async () => {
    await answerWith({ body: {} });

    expect(
      await dispatchNodeRoute(DEVICE_BASICS_ROUTE, { devicePaths: [1] }),
    ).toStrictEqual({
      success: false,
      error: "devicePaths must be a list of strings",
    });
  });
});
