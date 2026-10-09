// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/** What makes a device a copy of another: Live keeps its name and kind. */
export interface DeviceIdentity {
  name: string;
  className: unknown;
}

/**
 * Note what a copy of a device will look like, before the copy exists.
 * @param device - The device to be copied
 * @returns Its name and class
 */
export function identityOf(device: LiveAPI): DeviceIdentity {
  return {
    name: device.getName(),
    className: device.getProperty("class_name"),
  };
}

/**
 * Whether a device is the copy a copy was expected to leave there. Slots shift
 * while a request waits, so nothing is moved or deleted on the slot alone.
 * @param candidate - The device found at the copy's place
 * @param original - What the original looked like before the copy
 * @returns True when it has the original's name and class
 */
export function isCopyOf(
  candidate: LiveAPI,
  original: DeviceIdentity,
): boolean {
  return (
    candidate.exists() &&
    candidate.getName() === original.name &&
    candidate.getProperty("class_name") === original.className
  );
}
