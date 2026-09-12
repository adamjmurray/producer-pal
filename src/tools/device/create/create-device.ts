// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { ALL_VALID_DEVICES, VALID_DEVICES } from "#src/tools/constants.ts";
import { type ParamEntry } from "#src/tools/device/update/device-params-schema.ts";
import { validateParamEntries } from "#src/tools/device/update/helpers/param-entry-validation.ts";
import { setParamValues } from "#src/tools/device/update/update-device-param-setters.ts";
import { focusSelect } from "#src/tools/session/helpers/select-focus-helpers.ts";
import {
  type ParamResult,
  refreshParamValues,
} from "#src/tools/shared/device/helpers/device-display-helpers.ts";
import { resolveInsertionPath } from "#src/tools/shared/device/helpers/path/device-path-helpers.ts";
import {
  invalidateDevicePathCache,
  withDevicePathCache,
} from "#src/tools/shared/device/helpers/path/with-device-path-cache.ts";
import { targetEntries, unwrapSingleResult } from "#src/tools/shared/utils.ts";
import { validateListLengths } from "#src/tools/shared/validation/lists/list-lengths.ts";
import {
  getNameForIndex,
  parseNames,
} from "#src/tools/shared/validation/name-utils.ts";
import { pathField } from "#src/tools/shared/validation/object-path-for-api.ts";
import { type ListEntries } from "#src/tools/shared/validation/lists/list-pairing.ts";
import { validateInsertionOrder } from "./create-device-helpers.ts";

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
  params?: ParamResult[];
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
    `invalid deviceName "${deviceName}". Valid devices - ${validList}`,
  );
}

/**
 * Refuse a list-mode call that also carries create-only args.
 *
 * Without deviceName the call lists the catalog and creates nothing, so a path
 * or params sent alongside it are dropped — and the catalog comes back looking
 * like the call worked. The args say a create was meant, so answer the create
 * that can't run rather than the list that wasn't asked for.
 * @param args - The create-only args, none of which list mode can act on
 */
function validateListModeArgs(args: {
  path?: string;
  name?: string;
  params?: ParamEntry[];
}): void {
  const sent = (["path", "name", "params"] as const).filter(
    (key) => args[key] != null,
  );

  if (sent.length > 0) {
    const verb = sent.length === 1 ? "requires" : "require";
    const pronoun = sent.length === 1 ? "it" : "them";

    throw new Error(
      `${sent.join(", ")} ${verb} deviceName; omit ${pronoun} to list available devices`,
    );
  }
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
 * @returns Device list, or object(s) naming each created device
 */
export function createDevice(
  { deviceName, path, name, params, focus }: CreateDeviceArgs = {},
  _context: Partial<ToolContext> = {},
): typeof VALID_DEVICES | CreateDeviceResult | CreateDeviceResult[] {
  // List mode: return valid devices when deviceName is omitted
  if (deviceName == null) {
    validateListModeArgs({ path, name, params });

    return VALID_DEVICES;
  }

  validateDeviceName(deviceName);

  if (path == null || path.trim() === "") {
    throw new Error("path is required when creating a device");
  }

  validateParamEntries(params);

  validateListLengths([
    { param: "path", value: path },
    { param: "name", value: name },
  ]);

  const paths = targetEntries(path, "path");

  // Every path in the batch climbs the same prefix — sixteen `t0/d0/c<n>`
  // paths share track 0 and the rack. Resolve each one once for the whole call,
  // so the order check reads the same objects the inserts go on to use.
  const results = withDevicePathCache(() => {
    validateInsertionOrder(paths, deviceName);

    const parsedNames = parseNames(name, paths.length, "device");

    return createDevicesAtPaths(deviceName, paths, name, parsedNames, params);
  });

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
        // Every param the call named comes back, written or not.
        const outcomes = setParamValues(device, params);

        if (outcomes.length > 0) {
          result.params = refreshParamValues(outcomes);
        }
      }

      results.push(result);
    } catch (error) {
      if (paths.length === 1) {
        throw error;
      }

      console.warn(
        `Failed to create "${deviceName}" at path "${p}": ${errorMessage(error)}`,
      );
    }
  }

  if (results.length === 0) {
    throw new Error(
      `could not create "${deviceName}" at any of the specified paths`,
    );
  }

  return results;
}

/**
 * Create device at a path (track or chain)
 * @param deviceName - Device name
 * @param path - Device path
 * @returns Object with the device's id and path, and the device itself
 */
function createDeviceAtPath(
  deviceName: string,
  path: string,
): CreateDeviceResult & { device: LiveAPI } {
  const { container, position, containerPath } = resolveInsertionPath(path);

  if (!container?.exists()) {
    throw new Error(`container at path "${path}" does not exist`);
  }

  // Live rejects any position past the end of the chain, including position 0
  // on an empty one. Append instead of failing.
  const deviceCount = container.getChildCount("devices");
  const pastEnd = position != null && position > deviceCount;

  if (pastEnd) {
    console.warn(
      `path "${path}" is past the end of the device chain ` +
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
  if (
    effectivePosition != null ||
    appendMovesSiblings(deviceName, deviceCount)
  ) {
    invalidateDevicePathCache();
  }

  const rawId = result[1];
  const id = rawId ? String(rawId) : null;
  const device = id ? LiveAPI.from(`id ${id}`) : null;

  if (!id || !device?.exists()) {
    const positionDesc = position != null ? `position ${position}` : "end";

    // Live refuses a second instrument in a chain that already has one, and
    // this is how that arrives: no id back, no device. Re-running a drum kit
    // build fails every pad this way. That's Live, not a bug — an audio effect
    // on the same chains succeeds.
    throw new Error(
      `could not insert "${deviceName}" at ${positionDesc} in path "${path}"`,
    );
  }

  return {
    id,
    ...pathField(device, { container: () => container, path: containerPath }),
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
