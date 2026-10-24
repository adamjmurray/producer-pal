// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  type RegisteredMockObject,
  children,
  livePath,
  registerMockObject,
} from "../../update-device-test-helpers.ts";

/**
 * Register the device under test at t0/d0, holding the given params.
 * @param paramIds - Parameter mock ids, in the device's parameter order
 */
export function registerDevice(...paramIds: string[]): void {
  registerMockObject("123", {
    path: livePath.track(0).device(0),
    type: "Device",
    properties: { parameters: children(...paramIds) },
  });
}

/** A continuous 0..1 param on the device at t0/d2, by id. */
interface ParamAtD2 {
  id: string;
  name: string;
  originalName?: string;
}

/**
 * Register device `125` at t0/d2 holding continuous 0..1 params, each at 0.5.
 * @param params - The params, in the device's parameter order
 * @returns The param mocks, in order
 */
export function registerDeviceAtD2(
  ...params: ParamAtD2[]
): RegisteredMockObject[] {
  registerMockObject("125", {
    path: livePath.track(0).device(2),
    type: "Device",
    properties: { parameters: children(...params.map(({ id }) => id)) },
  });

  return params.map(({ id, name, originalName = name }, index) =>
    registerMockObject(id, {
      path: livePath.track(0).device(2).parameter(index),
      type: "DeviceParameter",
      properties: {
        name,
        original_name: originalName,
        is_quantized: 0,
        value: 0.5,
        min: 0,
        max: 1,
      },
    }),
  );
}
