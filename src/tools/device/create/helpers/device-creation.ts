// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The steps creating a device at a path takes, whichever way the device
// arrives: Live's insert_device for a native one, or a browser load moved into
// place. Shared so both kinds resolve, warn, and fail alike.

import { errorMessage } from "#src/shared/error-message.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { type ParamEntry } from "#src/tools/device/update/device-params-schema.ts";
import { setParamValues } from "#src/tools/device/update/update-device-param-setters.ts";
import {
  type ParamResult,
  refreshParamValues,
} from "#src/tools/shared/device/helpers/param-reading.ts";
import { resolveInsertionPath } from "#src/tools/shared/device/helpers/path/insertion-path.ts";
import { pathField } from "#src/tools/shared/validation/object-path-for-api.ts";

export interface CreateDeviceResult {
  id: string;
  path?: string;
  params?: ParamResult[];
}

/** Where one path puts a device. */
export interface CreationTarget {
  container: LiveAPI;
  /** The index the path named, or null for an append */
  position: number | null;
  /** How the call spelled the container */
  containerPath: string;
}

/**
 * Resolve where a path creates a device.
 * @param path - Device insertion path
 * @returns The container, the index named in it, and its spelling
 * @throws Error when the path names no place a device can go
 */
export function resolveCreationTarget(path: string): CreationTarget {
  const { container, position, containerPath, namesNothing } =
    resolveInsertionPath(path);

  if (namesNothing != null) {
    throw new Error(
      `path "${path}" names no device to insert at: ${namesNothing}`,
    );
  }

  if (!container?.exists()) {
    throw new Error(`container at path "${path}" does not exist`);
  }

  return { container, position, containerPath };
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
 * @returns The message
 */
export function insertRefusal(
  deviceName: string,
  position: number | null,
  path: string,
): string {
  const positionDesc = position != null ? `position ${position}` : "end";

  return `could not insert "${deviceName}" at ${positionDesc} in path "${path}"`;
}

/**
 * A created device's result entry, named in the call's own spelling.
 * @param id - The device's id
 * @param device - The device
 * @param target - Where it was created
 * @param target.container - The container
 * @param target.containerPath - How the call spelled the container
 * @returns The entry's id and path
 */
export function createdDeviceEntry(
  id: string,
  device: LiveAPI,
  { container, containerPath }: CreationTarget,
): CreateDeviceResult {
  return {
    id,
    ...pathField(device, { container: () => container, path: containerPath }),
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

/**
 * Skip a path that failed, or rethrow when it was the only one.
 * @param error - Why the path failed
 * @param deviceName - The device, as the call named it
 * @param path - The path that failed
 * @param pathCount - How many paths the call named
 */
export function skipFailedPath(
  error: unknown,
  deviceName: string,
  path: string,
  pathCount: number,
): void {
  if (pathCount === 1) {
    throw error;
  }

  console.warn(
    `Failed to create "${deviceName}" at path "${path}": ${errorMessage(error)}`,
  );
}

/**
 * The entries of a call, refusing one that created nothing.
 * @param results - One entry per path that worked
 * @param deviceName - The device, as the call named it
 * @returns The entries
 */
export function requireCreatedDevices(
  results: CreateDeviceResult[],
  deviceName: string,
): CreateDeviceResult[] {
  if (results.length === 0) {
    throw new Error(
      `could not create "${deviceName}" at any of the specified paths`,
    );
  }

  return results;
}
