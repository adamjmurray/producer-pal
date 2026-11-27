// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  type RegisteredMockObject,
  children,
  livePath,
  registerMockObject,
  updateDevice,
} from "#src/tools/device/update/tests/update-device-test-helpers.ts";

/** One param of a device for a copy test. */
export interface ParamSpec {
  name: string;
  value: number;
  /** Live's `state`: 2 means a rack macro owns the param */
  state?: number;
}

/** A device for a copy test, over the Compressor defaults. */
export interface DeviceSpec {
  params: ParamSpec[];
  /** Position on track 0 */
  slot?: number;
  className?: string;
  displayName?: string;
  /** Device properties to add, such as a pseudo-param's backing property */
  extra?: Record<string, unknown>;
}

/** A registered device and the params it holds, in order. */
export interface RegisteredDevice {
  device: RegisteredMockObject;
  params: RegisteredMockObject[];
}

/**
 * Register a device on track 0 with params of its own.
 * @param id - The device's id (digits, so a call can name it as an id)
 * @param spec - What the device and its params read as
 * @returns The device and its param mocks
 */
export function registerCopyDevice(
  id: string,
  spec: DeviceSpec,
): RegisteredDevice {
  const params = spec.params.map((param, index) =>
    registerMockObject(`${id}-p${index}`, {
      properties: {
        name: param.name,
        original_name: param.name,
        is_quantized: 0,
        is_enabled: param.state === 2 ? 0 : 1,
        state: param.state ?? 0,
        value: param.value,
        min: 0,
        max: 1,
      },
      methods: { str_for_value: (value: unknown) => Number(value).toFixed(2) },
    }),
  );
  const device = registerMockObject(id, {
    path: livePath.track(0).device(spec.slot ?? 0),
    type: "Device",
    properties: {
      class_name: spec.className ?? "Compressor2Device",
      class_display_name: spec.displayName ?? "Compressor",
      parameters: children(...params.map((param) => param.id)),
      ...spec.extra,
    },
  });

  return { device, params };
}

/**
 * The values a device's params read as.
 * @param registered - The device from {@link registerCopyDevice}
 * @returns One value per param, in order
 */
export function valuesOf(registered: RegisteredDevice): unknown[] {
  return registered.params.map((param) => param.properties.value);
}

/**
 * Copy the device registered as 101 onto another.
 * @param id - The target's id
 * @param extra - Other args for the call
 * @returns What updateDevice returned
 */
export function copyOnto(
  id: string,
  extra: Record<string, unknown> = {},
): unknown {
  return updateDevice({ id, copyParamsFrom: "101", ...extra });
}

/**
 * What a target's entry reads as. The devices sit in order from 101 at d0, so
 * the id gives the path.
 * @param id - The target's id
 * @param rest - The rest of the entry
 * @returns The entry
 */
export function entryFor(
  id: string,
  rest: Record<string, unknown>,
): Record<string, unknown> {
  return { id, path: `t0/d${Number(id) - 101}`, ...rest };
}

/**
 * Register a source (101, Threshold 0.75) and a target (102) that each hold
 * just a Threshold.
 * @param target - What the target's Threshold reads as
 * @param target.value - Its value
 * @param target.state - Its `state`
 * @returns The target
 */
export function registerThresholdPair(target: {
  value: number;
  state?: number;
}): RegisteredDevice {
  registerCopyDevice("101", { params: [{ name: "Threshold", value: 0.75 }] });

  return registerCopyDevice("102", {
    slot: 1,
    params: [{ name: "Threshold", ...target }],
  });
}
