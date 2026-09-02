// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";

/**
 * Check if type is updatable (device, chain, or drum pad)
 * @param type - Live object type
 * @returns True if type is updatable
 */
export function isValidUpdateType(type: string): boolean {
  return (
    type.endsWith("Device") || type.endsWith("Chain") || type === "DrumPad"
  );
}

/**
 * Check if type is a device type
 * @param type - Live object type
 * @returns True if type ends with Device
 */
export function isDeviceType(type: string): boolean {
  return type.endsWith("Device");
}

/**
 * Check if type is a rack device
 * @param type - Live object type
 * @returns True if type is RackDevice
 */
export function isRackDevice(type: string): boolean {
  return type === "RackDevice";
}

/**
 * Check if type is a chain type
 * @param type - Live object type
 * @returns True if type ends with Chain
 */
export function isChainType(type: string): boolean {
  return type.endsWith("Chain");
}

/**
 * Warn if parameter is set but not applicable to this type. An empty array is
 * treated as unset (the caller supplied the key but no entries), so it doesn't
 * trigger a spurious "not applicable" warning.
 * @param paramName - Parameter name
 * @param value - Parameter value
 * @param type - Live object type
 * @param target - The object the write was aimed at, for the warning
 */
export function warnIfSet(
  paramName: string,
  value: unknown,
  type: string,
  target: LiveAPI,
): void {
  if (value == null || (Array.isArray(value) && value.length === 0)) return;

  console.warn(
    `updateDevice: '${paramName}' not applicable to ${type} ${targetLabel(target)}`,
  );
}
