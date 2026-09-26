// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Common imports for update-device test files.
// Side-effect import must be in this file so test files don't each repeat it.
import "#src/live-api-adapter/live-api-extensions.ts";

import { expect } from "vitest";
import { errorMessage } from "#src/shared/error-message.ts";
import { capturedWarnings } from "#src/shared/max/v8-warning-capture.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { type ParamResult } from "#src/tools/shared/device/helpers/param-reading.ts";
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
 * Register a live_set whose move_device relocates the device: out of its old
 * container, into the destination at the position asked for, with every device
 * either list re-pathed to the index it now sits at. The registry answers
 * statically, so without this the destination never lists the device and
 * moveDeviceToPath reads every move as refused. Leave it out to test a refusal.
 *
 * One deliberate divergence: this clamps a position past the end, where Live
 * ignores the move instead. moveDeviceToPath refuses those before calling, so
 * nothing reaches here — don't lean on the clamp to decide what Live does.
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

    if (device != null) {
      repath(device, `${container.path} devices ${index}`);
    }
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

export interface ContinuousParamSpec {
  /** What Live reports as `name`; an all-digit name comes back as a number */
  name?: unknown;
  /** Live's unrenamed name, defaulting to `name` */
  originalName?: unknown;
  /** Register no `original_name` at all, the way some params read back */
  omitOriginalName?: boolean;
  /** The param's position on the device at t0/d0, when it needs a path */
  index?: number;
  value?: number;
  min?: number;
  max?: number;
  /** What `str_for_value` answers; the default is Live's rounded percent */
  display?: (value: unknown) => string;
}

/**
 * Register a continuous (non-quantized) DeviceParameter mock.
 *
 * Giving an `index` also gives it a path under the device at t0/d0: a param's
 * path names its device, so the write path can tell a param of the addressed
 * device from one of some other device's.
 * @param id - Mock object ID
 * @param spec - What the param reports, over the defaults
 * @returns The registered mock object
 */
export function registerContinuousParam(
  id: string,
  spec: ContinuousParamSpec = {},
): RegisteredMockObject {
  const name = spec.name ?? `Param ${id}`;
  const properties: Record<string, unknown> = {
    name,
    is_quantized: 0,
    value: spec.value ?? 0,
    min: spec.min ?? 0,
    max: spec.max ?? 1,
  };

  if (!spec.omitOriginalName) {
    properties.original_name = spec.originalName ?? name;
  }

  return registerMockObject(id, {
    path:
      spec.index == null
        ? undefined
        : livePath.track(0).device(0).parameter(spec.index),
    type: spec.index == null ? undefined : "DeviceParameter",
    properties,
    methods: {
      str_for_value:
        spec.display ??
        ((value: unknown) => `${Math.round(Number(value) * 100)} %`),
    },
  });
}

/**
 * Register a continuous parameter mock with default properties, on the device
 * at t0/d0.
 * @param id - Mock object ID
 * @param index - The param's position on the device
 * @returns The registered mock object
 */
export function registerParamMock(
  id: string,
  index: number,
): RegisteredMockObject {
  return registerContinuousParam(id, {
    index,
    value: 0.5,
    // Two decimals, like a real display: a label carries far less precision
    // than the raw value, which is what makes a write verifiable at all.
    display: (value: unknown) => Number(value).toFixed(2),
  });
}

/**
 * Register a Drum Rack at t0/d0 whose one pad chain sits on C1 (MIDI 36).
 * @param padDeviceIds - Ids of the devices already on the pad chain
 * @param chainMethods - Methods the chain answers, such as `insert_device`
 * @returns The pad chain mock
 */
export function registerDrumRackPadChain(
  padDeviceIds: string[] = [],
  chainMethods?: Record<string, (...args: unknown[]) => unknown>,
): RegisteredMockObject {
  registerMockObject("drum-rack", {
    path: livePath.track(0).device(0),
    type: "RackDevice",
    properties: { chains: ["id", "chain-c1"], can_have_drum_pads: 1 },
  });

  return registerMockObject("chain-c1", {
    type: "DrumChain",
    properties: { in_note: 36, devices: children(...padDeviceIds) },
    methods: chainMethods,
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
 * The `params` entries one target's result came back with. updateDevice's return
 * type covers a whole list of targets, so reading one target's params narrows it.
 * @param result - What updateDevice returned
 * @returns The entries, or [] when the result reported none
 */
export function paramsOf(result: unknown): ParamResult[] {
  return (result as { params?: ParamResult[] }).params ?? [];
}

/**
 * Assert the one param a call named came back refused, with the reason why and
 * no warning. Nothing else was asked of the lone target, so nothing landed and
 * the call throws, naming the param.
 * @param call - Runs the updateDevice call
 * @param name - The param as the call spelled it
 * @param reason - Substring the reason must contain
 */
export function expectParamRefused(
  call: () => unknown,
  name: string,
  reason: string,
): void {
  const message = noParamLanded(call);

  expect(message).toContain(`"${name}": `);
  expect(message).toContain(reason);
  expect(capturedWarnings()).toHaveLength(0);
}

/**
 * The error a lone target throws when none of its params landed.
 * @param call - Runs the updateDevice call
 * @returns The error message, which names each param and why it failed
 */
export function noParamLanded(call: () => unknown): string {
  let message: string | undefined;

  try {
    call();
  } catch (error) {
    message = errorMessage(error);
  }

  expect(message).toMatch(/^no param landed — /);

  return message as string;
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

/** What a registered rack does with its macros. */
export interface MacroRackSpec {
  /** The macros it shows to begin with */
  count: number;
  /** Whether one of its macros is mapped */
  mapped?: boolean;
  /** The fewest macros it will hide down to, for a rack that keeps some */
  floor?: number;
}

/**
 * Register a rack at t0/d0 whose add_macro/remove_macro move the visible count,
 * so a test reads back what the write landed on rather than what it asked for.
 * @param id - Mock object ID
 * @param spec - What the rack shows, and how far it will go
 * @param spec.count - The macros it shows to begin with
 * @param spec.mapped - Whether one of its macros is mapped
 * @param spec.floor - The fewest macros it will hide down to
 * @returns The registered rack mock
 */
export function registerMacroRack(
  id: string,
  { count, mapped = false, floor = 0 }: MacroRackSpec,
): RegisteredMockObject {
  const properties: Record<string, unknown> = {
    can_have_chains: 1,
    visible_macro_count: count,
    has_macro_mappings: mapped ? 1 : 0,
  };

  // Live moves macros a pair at a time.
  const move = (by: number) => (): null => {
    const now = properties.visible_macro_count as number;

    properties.visible_macro_count = Math.max(floor, now + by);

    return null;
  };

  return registerMockObject(id, {
    path: livePath.track(0).device(0),
    type: "RackDevice",
    properties,
    methods: { add_macro: move(2), remove_macro: move(-2) },
  });
}
