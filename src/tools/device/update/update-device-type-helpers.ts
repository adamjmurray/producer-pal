// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";

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
 * Warn if parameter is set but not applicable to this type
 * @param paramName - Parameter name
 * @param value - Parameter value
 * @param type - Live object type
 */
export function warnIfSet(
  paramName: string,
  value: unknown,
  type: string,
): void {
  if (value != null) {
    console.warn(`updateDevice: '${paramName}' not applicable to ${type}`);
  }
}
