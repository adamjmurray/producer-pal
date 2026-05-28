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
 * Register a continuous parameter mock with default properties.
 * @param id - Mock object ID
 * @returns The registered mock object
 */
export function registerParamMock(id: string): RegisteredMockObject {
  return registerMockObject(id, {
    properties: { is_quantized: 0, value: 0.5, min: 0, max: 1 },
    methods: { str_for_value: (_value: unknown) => String(_value) },
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
