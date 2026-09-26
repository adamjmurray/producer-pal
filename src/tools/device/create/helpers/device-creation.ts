// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The steps creating a device at a path takes, whichever way the device
// arrives: Live's insert_device for a native one, or a browser load moved into
// place. Shared so both kinds resolve, warn, and fail alike.

import * as console from "#src/shared/max/v8-max-console.ts";
import { VALID_DEVICES } from "#src/tools/constants.ts";
import { type ParamEntry } from "#src/tools/device/update/device-params-schema.ts";
import { setParamValues } from "#src/tools/device/update/update-device-param-setters.ts";
import {
  ONE_INSTRUMENT_PER_CHAIN,
  deviceHasInstrument,
} from "#src/tools/shared/device/helpers/chain-info.ts";
import {
  type ParamResult,
  refreshParamValues,
} from "#src/tools/shared/device/helpers/param-reading.ts";
import { resolveInsertionPath } from "#src/tools/shared/device/helpers/path/insertion-path.ts";
import { invalidateDevicePathCache } from "#src/tools/shared/device/helpers/path/with-device-path-cache.ts";
import { pathField } from "#src/tools/shared/validation/object-path-for-api.ts";

export interface CreateDeviceResult {
  id: string;
  path?: string;
  /** The rack chains the path had to make first ("c2-c3"), when it made any */
  created?: string;
  params?: ParamResult[];
}

/** Where one path puts a device. */
export interface CreationTarget {
  container: LiveAPI;
  /** The index the path named, or null for an append */
  position: number | null;
  /** How the call spelled the container */
  containerPath: string;
  /** The rack chains the path made on the way to the container, if any */
  createdChains?: string;
}

/**
 * Insert a native device at a path (track or chain).
 * @param deviceName - The device, as the call named it
 * @param path - Device path
 * @returns The device and its result entry
 * @throws Error when Live turns the insert down
 */
export function insertNativeDevice(
  deviceName: string,
  path: string,
): { device: LiveAPI; entry: CreateDeviceResult } {
  const target = resolveCreationTarget(path);
  const { container } = target;
  const { position, deviceCount } = insertionPosition(target, path, deviceName);

  const result =
    position != null
      ? (container.call("insert_device", deviceName, position) as [
          string,
          string | number,
        ])
      : (container.call("insert_device", deviceName) as [
          string,
          string | number,
        ]);

  // A positioned insert shifts every later device down a slot; an append can
  // too, when Live re-sorts the chain around it.
  if (position != null || (deviceCount > 0 && appendRenumbers(deviceName))) {
    invalidateDevicePathCache();
  }

  const rawId = result[1];
  const id = rawId ? String(rawId) : null;
  const device = id ? LiveAPI.from(`id ${id}`) : null;

  if (!id || !device?.exists()) {
    // Live refuses an insert by giving back no id and no device. The usual
    // cause is a second instrument in a chain that already has one — that's
    // Live, not a bug, and an audio effect on the same chains succeeds — so
    // name it when the container shows it.
    throw new Error(
      insertRefusal(
        deviceName,
        target.position,
        path,
        insertRefusalCause(deviceName, container),
      ),
    );
  }

  return { device, entry: createdDeviceEntry(id, device, target) };
}

/**
 * Whether inserting this device at the end of a chain can renumber what's
 * already there. Live keeps a chain sorted by device type, so an instrument
 * lands ahead of the audio effects and a MIDI effect ahead of everything: both
 * push siblings down a slot. Only an audio effect is guaranteed to land last.
 * @param deviceName - The device being inserted
 * @returns True when an append can move a sibling
 */
export function appendRenumbers(deviceName: string): boolean {
  return !(VALID_DEVICES.audioEffects as readonly string[]).includes(
    deviceName,
  );
}

/**
 * Resolve where a path creates a device.
 * @param path - Device insertion path
 * @returns The container, the index named in it, and its spelling
 * @throws Error when the path names no place a device can go
 */
export function resolveCreationTarget(path: string): CreationTarget {
  const { container, position, containerPath, namesNothing, createdChains } =
    resolveInsertionPath(path);

  if (namesNothing != null) {
    throw new Error(
      `path "${path}" names no device to insert at: ${namesNothing}`,
    );
  }

  if (!container?.exists()) {
    throw new Error(`container at path "${path}" does not exist`);
  }

  return { container, position, containerPath, createdChains };
}

/**
 * The index to hand Live. Live rejects any position past the end of the chain,
 * including 0 on an empty one, so those append instead — past the end warns.
 * @param target - Where the device goes
 * @param target.container - The container
 * @param target.position - The index the path named, or null for an append
 * @param path - The path as the call wrote it
 * @param deviceName - The device, as the call named it
 * @returns The index (null appends) and the devices already in the container
 */
export function insertionPosition(
  { container, position }: CreationTarget,
  path: string,
  deviceName: string,
): { position: number | null; deviceCount: number } {
  const deviceCount = container.getChildCount("devices");
  const pastEnd = position != null && position > deviceCount;

  if (pastEnd) {
    console.warn(
      `path "${path}" is past the end of the device chain ` +
        `(${deviceCount} device${deviceCount === 1 ? "" : "s"}), appending "${deviceName}" instead`,
    );
  }

  return {
    position:
      pastEnd || (position === 0 && deviceCount === 0) ? null : position,
    deviceCount,
  };
}

/**
 * The error for a device Live wouldn't take at a path.
 * @param deviceName - The device, as the call named it
 * @param position - The index the path named, or null for an append
 * @param path - The path as the call wrote it
 * @param cause - Why Live turned it down, when we can name it
 * @returns The message
 */
export function insertRefusal(
  deviceName: string,
  position: number | null,
  path: string,
  cause?: string | null,
): string {
  const positionDesc = position != null ? `position ${position}` : "end";
  const refusal = `could not insert "${deviceName}" at ${positionDesc} in path "${path}"`;

  return cause == null ? refusal : `${refusal}: ${cause}`;
}

/**
 * Why Live turned an insert down, when the container says it plainly enough.
 * Live refuses a second instrument in a chain that already has one and gives
 * back no id and no reason, so the caller sees only that the insert failed.
 * @param deviceName - The device, as the call named it
 * @param container - The track or chain it was headed for
 * @returns The cause, or undefined when nothing obvious accounts for it
 */
export function insertRefusalCause(
  deviceName: string,
  container: LiveAPI,
): string | undefined {
  const isInstrument = (
    VALID_DEVICES.instruments as readonly string[]
  ).includes(deviceName);

  return isInstrument && container.someChild("devices", deviceHasInstrument)
    ? ONE_INSTRUMENT_PER_CHAIN
    : undefined;
}

/**
 * A created device's result entry, named in the call's own spelling.
 * @param id - The device's id
 * @param device - The device
 * @param target - Where it was created
 * @param target.container - The container
 * @param target.containerPath - How the call spelled the container
 * @param target.createdChains - The rack chains the path made first, if any
 * @returns The entry's id, path, and the chains it took to get there
 */
export function createdDeviceEntry(
  id: string,
  device: LiveAPI,
  { container, containerPath, createdChains }: CreationTarget,
): CreateDeviceResult {
  return {
    id,
    ...pathField(device, { container: () => container, path: containerPath }),
    ...(createdChains == null ? {} : { created: createdChains }),
  };
}

/**
 * Apply the call's name and params to one created device.
 * @param device - The created device
 * @param entry - Its result entry, which gains any params outcome
 * @param displayName - The name for this device, if any
 * @param params - {name, value} entries applied to each created device
 * @returns The entry
 */
export function labelCreatedDevice(
  device: LiveAPI,
  entry: CreateDeviceResult,
  displayName: string | undefined,
  params: ParamEntry[] | undefined,
): CreateDeviceResult {
  if (displayName != null) {
    device.set("name", displayName);
  }

  if (params != null) {
    // Every param the call named comes back, written or not.
    const outcomes = setParamValues(device, params);

    if (outcomes.length > 0) {
      entry.params = refreshParamValues(outcomes);
    }
  }

  return entry;
}
