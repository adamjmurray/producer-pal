// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Live names a track's or chain's mixer `MixerDevice` / `ChainMixerDevice`, but
 * they are not devices: they sit in no device list and take no device params.
 */
const MIXER_CLASSES: ReadonlySet<string> = new Set([
  "MixerDevice",
  "ChainMixerDevice",
]);

/**
 * Check whether a Live class is a device a track or chain can hold. Matches by
 * the `Device` suffix so a device class Live adds later still counts, and
 * rules out the known mixer classes that share the suffix.
 * @param type - Live's class name for the object
 * @returns True for a device class, false for a mixer or any other object
 */
export function isDeviceClass(type: string): boolean {
  return type.endsWith("Device") && !MIXER_CLASSES.has(type);
}
