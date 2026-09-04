// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Common imports for update-device test files.
// Side-effect import must be in this file so test files don't each repeat it.
import "#src/live-api-adapter/live-api-extensions.ts";

import { expect } from "vitest";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { children } from "#src/test/mocks/mock-live-api.ts";
import {
  type RegisteredMockObject,
  lookupMockObject,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";

export { livePath } from "#src/shared/live-api-path-builders.ts";
export { children } from "#src/test/mocks/mock-live-api.ts";
export {
  type RegisteredMockObject,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
export { updateDevice } from "../update-device.ts";

/**
 * Register a live_set whose move_device puts the device in the destination, the
 * way Live does when it takes the move. The registry answers statically, so
 * without this the destination never lists the device and moveDeviceToPath
 * reads every move as refused. Leave it out to test a refusal.
 * @returns The live_set mock
 */
export function mockWorkingDeviceMoves(): RegisteredMockObject {
  return registerMockObject("live-set", {
    path: livePath.liveSet,
    methods: {
      move_device: (device, container) => {
        const target = lookupMockObject(bareId(container));

        if (target != null) {
          const devices =
            (target.properties.devices as string[] | undefined) ?? [];

          target.properties.devices = [...devices, "id", bareId(device)];
        }

        return null;
      },
    },
  });
}

/**
 * Strip the "id " prefix Live's object arguments carry
 * @param arg - A move_device argument
 * @returns The bare id
 */
function bareId(arg: unknown): string {
  return String(arg).replace(/^id /, "");
}

/**
 * Register a continuous parameter mock with default properties, on the device
 * at t0/d0. A param's path names its device, so the write path can tell a param
 * of the addressed device from one of some other device's.
 * @param id - Mock object ID
 * @param index - The param's position on the device
 * @returns The registered mock object
 */
export function registerParamMock(
  id: string,
  index: number,
): RegisteredMockObject {
  const name = `Param ${id}`;

  return registerMockObject(id, {
    path: livePath.track(0).device(0).parameter(index),
    type: "DeviceParameter",
    properties: {
      name,
      original_name: name,
      is_quantized: 0,
      value: 0.5,
      min: 0,
      max: 1,
    },
    // Two decimals, like a real display: a label carries far less precision
    // than the raw value, which is what makes a write verifiable at all.
    methods: {
      str_for_value: (_value: unknown) => Number(_value).toFixed(2),
    },
  });
}

/**
 * Register a Simpler device mock at track 0, device 0.
 * @param paramIds - Optional parameter mock IDs to attach
 * @returns The registered Simpler device mock
 */
export function registerSimplerDevice(
  ...paramIds: string[]
): RegisteredMockObject {
  return registerMockObject("simpler-1", {
    path: livePath.track(0).device(0),
    type: "SimplerDevice",
    properties: {
      class_display_name: "Simpler",
      multi_sample_mode: 0,
      parameters: children(...paramIds),
    },
  });
}

/**
 * Extract the raw value passed to `param.set("value", ...)` and assert the call occurred.
 * @param param - The parameter mock to inspect
 * @returns The raw numeric value that was set
 */
export function expectValueSet(param: RegisteredMockObject): number {
  const setCall = param.set.mock.calls.find(
    (c: unknown[]) => c[0] === "value",
  ) as [string, number];

  expect(setCall).toBeDefined();

  return setCall[1];
}
