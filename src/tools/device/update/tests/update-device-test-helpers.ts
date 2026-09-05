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
  keepsParamValue,
  mockNonExistentObjects,
  registerMockObject,
} from "#src/test/mocks/mock-registry.ts";
export { updateDevice } from "../update-device.ts";

/** The collection segment a device sits in, so the rest names its container. */
const OWN_DEVICE_SEGMENT = / devices \d+$/;

/**
 * Register a live_set whose move_device relocates the device the way Live does:
 * out of its old container, into the destination at the position asked for
 * (clamped to the end), with every device either list re-pathed to the index it
 * now sits at. The registry answers statically, so without this the destination
 * never lists the device and moveDeviceToPath reads every move as refused.
 * Leave it out to test a refusal.
 * @returns The live_set mock
 */
export function mockWorkingDeviceMoves(): RegisteredMockObject {
  return registerMockObject("live-set", {
    path: livePath.liveSet,
    methods: {
      move_device: (device, container, position) => {
        const target = lookupMockObject(bareId(container));
        const moved = lookupMockObject(bareId(device));

        if (target != null && moved != null) {
          relocateDevice(moved, target, position);
        }

        return null;
      },
    },
  });
}

/**
 * Take a device out of the container it is in and put it in another at the
 * position asked for, re-pathing everything either list still holds.
 * @param moved - The device being moved
 * @param target - The container it is moving into
 * @param position - The index move_device asked for
 */
function relocateDevice(
  moved: RegisteredMockObject,
  target: RegisteredMockObject,
  position: unknown,
): void {
  const source = lookupMockObject(
    undefined,
    moved.path.replace(OWN_DEVICE_SEGMENT, ""),
  );

  if (source != null && source !== target) {
    setDeviceIds(
      source,
      deviceIds(source).filter((id) => id !== moved.id),
    );
  }

  const ids = deviceIds(target).filter((id) => id !== moved.id);

  ids.splice(clamp(position, ids.length), 0, moved.id);
  setDeviceIds(target, ids);
}

/**
 * Make every `set` write through to the property, the way a Live object that
 * takes the write does. The default mock stores only param values, so a test
 * asserting on something read back after a write needs this.
 * @param mock - The registered mock to make writable
 */
export function writesThroughSets(mock: RegisteredMockObject): void {
  mock.set.mockImplementation((property: string, value: unknown) => {
    mock.properties[property] = value;
  });
}

/**
 * The device ids a container lists, without Live's interleaved "id" markers.
 * @param container - The registered container mock
 * @returns The ids, in order
 */
function deviceIds(container: RegisteredMockObject): string[] {
  const devices = (container.properties.devices as string[] | undefined) ?? [];

  return devices.filter((_, index) => index % 2 === 1);
}

/**
 * Put a container's device list in a given order, and move each device to the
 * path its new index names.
 * @param container - The registered container mock
 * @param ids - The device ids it now holds, in order
 */
function setDeviceIds(container: RegisteredMockObject, ids: string[]): void {
  container.properties.devices = ids.flatMap((id) => ["id", id]);

  for (const [index, id] of ids.entries()) {
    const device = lookupMockObject(id);

    if (device != null) repath(device, `${container.path} devices ${index}`);
  }
}

/**
 * Where a move lands, given Live takes any index past the end as the end.
 * @param position - The position argument move_device was called with
 * @param length - How many devices the destination already holds
 * @returns The index to insert at
 */
function clamp(position: unknown, length: number): number {
  return Math.min(Math.max(Number(position) || 0, 0), length);
}

/**
 * Move a registered object, the way Live does: only its path changes, and
 * anything holding it reads the new one.
 * @param mock - The object that moved
 * @param path - Where it landed
 */
function repath(mock: RegisteredMockObject, path: string): void {
  registerMockObject(mock.id, {
    path,
    type: mock.type,
    properties: mock.properties,
    methods: mock.methods,
    returnPath: mock.returnPath,
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
 * Register a device at t0/d0 holding the given parameter mocks.
 * @param paramIds - Parameter mock ids, in the device's parameter order
 * @returns The registered device mock
 */
export function registerDeviceWithParams(
  ...paramIds: string[]
): RegisteredMockObject {
  return registerMockObject("dev1", {
    path: livePath.track(0).device(0),
    type: "Device",
    properties: { parameters: children(...paramIds) },
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
