// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Setting env vars, driven through the shipped portal binary. Unit tests cover
// how each value parses; what only a real process shows is that the env the
// Claude Desktop extension hands the portal turns into headers on the wire —
// with no gate variable to switch them on.
//
// Run with: npm run e2e:portal

import { describe, expect, it } from "vitest";
import {
  listToolNames,
  startPortal,
  stopAfterEach,
} from "../portal-test-helpers";
import {
  createStubDevice,
  type DeviceSettings,
  type StubDevice,
} from "../stub-device";

const track = stopAfterEach();

describe("setting env vars", () => {
  it("reaches the device as headers without any gate variable", async () => {
    const device = track(await createStubDevice());

    const portal = track(
      await startPortal(device.origin, [], {
        SMALL_MODEL_MODE: "true",
        NOTATION: "stark",
        JSON_OUTPUT: "true",
        LIVE_API: "true",
      }),
    );

    await listToolNames(portal);

    expect(settingsFor(device, "tools/list")).toStrictEqual({
      smallModelMode: "true",
      notation: "stark",
      format: "json",
      liveApi: "true",
    });
  });

  it("sends an explicit false, the way an untoggled extension checkbox does", async () => {
    const device = track(await createStubDevice());

    // mcpb has no "unset" for a boolean, so a checkbox nobody touched arrives as
    // "false". That reaches only this client, which is why it needs no gate.
    const portal = track(
      await startPortal(device.origin, [], {
        SMALL_MODEL_MODE: "false",
        LIVE_API: "false",
        JSON_OUTPUT: "false",
      }),
    );

    await listToolNames(portal);

    expect(settingsFor(device, "tools/list")).toStrictEqual({
      smallModelMode: "false",
      format: "compact",
      liveApi: "false",
    });
  });

  it("sends no setting headers when none are configured", async () => {
    const device = track(await createStubDevice());

    const portal = track(await startPortal(device.origin));

    await listToolNames(portal);

    // Nothing sent means the device's own settings decide, for this client too.
    expect(settingsFor(device, "tools/list")).toStrictEqual({});
  });
});

/**
 * The setting headers the device saw on a given request.
 * @param device - The stub device
 * @param method - The JSON-RPC method to look for
 * @returns The settings that rode along
 */
function settingsFor(device: StubDevice, method: string): DeviceSettings {
  const request = device.requests.find((r) => r.method === method);

  expect(request, `no ${method} request reached the device`).toBeDefined();

  return request?.settings ?? {};
}
