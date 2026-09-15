// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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
 * Note a parameter this kind of object has no use for, when the call sent one.
 * An empty array counts as unset (the caller supplied the key but no entries).
 * @param ignored - The params that did nothing, added to
 * @param paramName - Parameter name
 * @param value - Parameter value
 */
export function noteIfSet(
  ignored: string[],
  paramName: string,
  value: unknown,
): void {
  if (isParamSent(value)) {
    ignored.push(paramName);
  }
}

/**
 * Whether the call actually asked for this param.
 * @param value - Parameter value
 * @returns True unless it is absent or an empty list
 */
export function isParamSent(value: unknown): boolean {
  return value != null && !(Array.isArray(value) && value.length === 0);
}

/**
 * Say on a target's own entry which params its kind of object had no use for.
 * The entry already names the target, so the reason doesn't (ADR-0042).
 * @param entry - The target's entry, added to in place
 * @param ignored - Those params, in the order they were checked
 * @param type - Live object type
 * @param options - What the call asked of this target
 * @returns The entry
 * @throws Error when they were everything the call asked, so nothing landed
 */
export function reportIgnoredParams<T extends { reason?: string }>(
  entry: T,
  ignored: string[],
  type: string,
  options: object,
): T {
  if (ignored.length === 0) {
    return entry;
  }

  const reason = `${ignored.join(", ")} not applicable to ${type}`;

  if (!askedAnythingElse(options, ignored)) {
    throw new Error(reason);
  }

  entry.reason = entry.reason == null ? reason : `${entry.reason}; ${reason}`;

  return entry;
}

/**
 * Whether the call asked this target for anything beyond the ignored params.
 * Read off the options themselves, so a param added later counts as work by
 * default instead of quietly turning a hit into a skip. `force` never does: it
 * modifies a `params` write rather than asking for anything.
 * @param options - What the call asked of this target
 * @param ignored - The params its kind of object had no use for
 * @returns True when something else was asked for
 */
function askedAnythingElse(options: object, ignored: string[]): boolean {
  return Object.entries(options).some(
    ([key, value]: [string, unknown]) =>
      key !== "force" && isParamSent(value) && !ignored.includes(key),
  );
}

/**
 * Why an argument this kind of object has no use for was not applied. A warning
 * where the result has nothing to carry it, a reason where it does.
 * @param paramName - Parameter name
 * @param type - Live object type
 * @param target - The object the write was aimed at
 * @returns The reason
 */
export function notApplicableReason(
  paramName: string,
  type: string,
  target: LiveAPI,
): string {
  return `'${paramName}' not applicable to ${type} ${targetLabel(target)}`;
}
