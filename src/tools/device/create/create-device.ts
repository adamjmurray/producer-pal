// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { ALL_VALID_DEVICES, VALID_DEVICES } from "#src/tools/constants.ts";
import { type ParamEntry } from "#src/tools/device/update/device-params-schema.ts";
import { setParamValues } from "#src/tools/device/update/update-device-param-setters.ts";
import { focusSelect } from "#src/tools/session/helpers/select-focus-helpers.ts";
import {
  type ParamValueResult,
  refreshParamValues,
} from "#src/tools/shared/device/helpers/device-display-helpers.ts";
import { resolveInsertionPath } from "#src/tools/shared/device/helpers/path/device-path-helpers.ts";
import {
  invalidateDevicePathCache,
  withDevicePathCache,
} from "#src/tools/shared/device/helpers/path/with-device-path-cache.ts";
import {
  parseCommaSeparatedIds,
  reportDroppedEntries,
  unwrapSingleResult,
} from "#src/tools/shared/utils.ts";
import {
  getNameForIndex,
  parseNames,
} from "#src/tools/shared/validation/name-utils.ts";
import { pathField } from "#src/tools/shared/validation/object-path-for-api.ts";
import { type ListEntries } from "#src/tools/shared/validation/list-pairing.ts";

interface CreateDeviceArgs {
  deviceName?: string;
  path?: string;
  name?: string;
  params?: ParamEntry[];
  focus?: boolean;
}

interface CreateDeviceResult {
  id: string;
  path?: string;
  deviceIndex: number | null;
  params?: ParamValueResult[];
}

/**
 * Validate device name and throw error with valid options if invalid
 * @param deviceName - Device name to validate
 */
function validateDeviceName(deviceName: string): void {
  if (ALL_VALID_DEVICES.includes(deviceName)) {
    return;
  }

  const validList =
    `Instruments: ${VALID_DEVICES.instruments.join(", ")} | ` +
    `MIDI Effects: ${VALID_DEVICES.midiEffects.join(", ")} | ` +
    `Audio Effects: ${VALID_DEVICES.audioEffects.join(", ")}`;

  throw new Error(
    `createDevice failed: invalid deviceName "${deviceName}". Valid devices - ${validList}`,
  );
}

/**
 * Creates a native Live device on a track or chain, or lists available devices
 * @param args - The device parameters
 * @param args.deviceName - Device name, omit to list available devices
 * @param args.path - Device path(s), comma-separated for multiple (required when deviceName provided)
 * @param args.name - Name for all, or comma-separated for each
 * @param args.params - {name, value} entries applied to each created device (e.g. Simpler: {name:"sample", value:"<file path>"})
 * @param args.focus - Select the device and show device detail view
 * @param _context - Internal context object (unused)
 * @returns Device list, or object(s) with deviceId and deviceIndex
 */
export function createDevice(
  { deviceName, path, name, params, focus }: CreateDeviceArgs = {},
  _context: Partial<ToolContext> = {},
): typeof VALID_DEVICES | CreateDeviceResult | CreateDeviceResult[] {
  // List mode: return valid devices when deviceName is omitted
  if (deviceName == null) {
    return VALID_DEVICES;
  }

  validateDeviceName(deviceName);

  const paths = parseCommaSeparatedIds(path);

  reportDroppedEntries(path ?? "", paths, "path");

  if (paths.length === 0) {
    throw new Error(
      path == null || path.trim() === ""
        ? "createDevice failed: path is required when creating a device"
        : `createDevice failed: path "${path}" names nothing`,
    );
  }

  const parsedNames = parseNames(name, paths.length, "device");

  // Every path in the batch climbs the same prefix — sixteen `t0/d0/c<n>`
  // paths share track 0 and the rack. Resolve each one once for the whole call.
  const results = withDevicePathCache(() =>
    createDevicesAtPaths(deviceName, paths, name, parsedNames, params),
  );

  if (focus && results.length > 0) {
    const lastResult = results.at(-1) as CreateDeviceResult;

    focusSelect({ id: lastResult.id, detailView: "device" });
  }

  return unwrapSingleResult(results);
}

/**
 * Create device at multiple paths, collecting results
 * @param deviceName - Device name
 * @param paths - Array of device paths
 * @param baseName - Base display name
 * @param parsedNames - Comma-separated display names, or null
 * @param params - {name, value} entries applied to each created device
 * @returns Array of results for successfully created devices
 */
function createDevicesAtPaths(
  deviceName: string,
  paths: string[],
  baseName: string | undefined,
  parsedNames: ListEntries | null,
  params: ParamEntry[] | undefined,
): CreateDeviceResult[] {
  const results: CreateDeviceResult[] = [];

  for (let i = 0; i < paths.length; i++) {
    const p = paths[i] as string;

    try {
      const { device, ...result } = createDeviceAtPath(deviceName, p);
      const displayName = getNameForIndex(baseName, i, parsedNames);

      if (displayName != null) {
        device.set("name", displayName);
      }

      if (params != null) {
        const written = setParamValues(device, params, "createDevice");

        if (written.length > 0) result.params = refreshParamValues(written);
      }

      results.push(result);
    } catch (error) {
      if (paths.length === 1) throw error;
      console.warn(
        `Failed to create "${deviceName}" at path "${p}": ${errorMessage(error)}`,
      );
    }
  }

  if (results.length === 0) {
    throw new Error(
      `createDevice failed: could not create "${deviceName}" at any of the specified paths`,
    );
  }

  return results;
}

/**
 * Create device at a path (track or chain)
 * @param deviceName - Device name
 * @param path - Device path
 * @returns Object with deviceId, deviceIndex, and the new device
 */
function createDeviceAtPath(
  deviceName: string,
  path: string,
): CreateDeviceResult & { device: LiveAPI } {
  const { container, position } = resolveInsertionPath(path);

  if (!container?.exists()) {
    throw new Error(
      `createDevice failed: container at path "${path}" does not exist`,
    );
  }

  // Live rejects any position past the end of the chain, including position 0
  // on an empty one. Append instead of failing.
  const deviceCount = container.getChildCount("devices");
  const pastEnd = position != null && position > deviceCount;

  if (pastEnd) {
    console.warn(
      `createDevice: path "${path}" is past the end of the device chain ` +
        `(${deviceCount} device${deviceCount === 1 ? "" : "s"}), appending "${deviceName}" instead`,
    );
  }

  const effectivePosition =
    pastEnd || (position === 0 && deviceCount === 0) ? null : position;

  const result =
    effectivePosition != null
      ? (container.call("insert_device", deviceName, effectivePosition) as [
          string,
          string | number,
        ])
      : (container.call("insert_device", deviceName) as [
          string,
          string | number,
        ]);

  // A positioned insert shifts every later device down a slot; an append can
  // too, when Live re-sorts the chain around it.
  if (effectivePosition != null || appendMovesSiblings(deviceName, deviceCount))
    invalidateDevicePathCache();

  const rawId = result[1];
  const id = rawId ? String(rawId) : null;
  const device = id ? LiveAPI.from(`id ${id}`) : null;

  if (!id || !device?.exists()) {
    const positionDesc = position != null ? `position ${position}` : "end";

    throw new Error(
      `createDevice failed: could not insert "${deviceName}" at ${positionDesc} in path "${path}"`,
    );
  }

  return {
    id,
    ...pathField(device),
    deviceIndex: device.deviceIndex,
    device,
  };
}

/**
 * Whether appending this device can renumber the ones already there.
 *
 * Live keeps a chain sorted by device type, so an instrument lands ahead of the
 * audio effects and a MIDI effect ahead of everything: both push siblings down
 * a slot, and paths cached before the insert stop naming what they named. Only
 * an audio effect is guaranteed to land at the end.
 * @param deviceName - Device being inserted
 * @param deviceCount - Devices in the chain before the insert
 * @returns True when the append can move a sibling
 */
function appendMovesSiblings(deviceName: string, deviceCount: number): boolean {
  return (
    deviceCount > 0 &&
    !(VALID_DEVICES.audioEffects as readonly string[]).includes(deviceName)
  );
}
