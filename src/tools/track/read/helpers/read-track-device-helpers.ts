// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";
import { DEVICE_TYPE } from "#src/tools/constants.ts";
import {
  readDevice,
  type DeviceWithDrumPads,
} from "#src/tools/shared/device/device-reader.ts";

export interface CategorizedDevices {
  midiEffects: DeviceWithDrumPads[];
  instrument: DeviceWithDrumPads | null;
  audioEffects: DeviceWithDrumPads[];
}

/**
 * Categorize devices into MIDI effects, instruments, and audio effects
 * @param devices - Array of Live API device objects
 * @param includeDrumPads - Whether to include drum pad chains
 * @param includeRackChains - Whether to include chains in rack devices
 * @param includeReturnChains - Whether to include return chains in rack devices
 * @returns Object with midiEffects, instrument, and audioEffects arrays
 */
export function categorizeDevices(
  devices: LiveAPI[],
  includeDrumPads = false,
  includeRackChains = true,
  includeReturnChains = false,
): CategorizedDevices {
  const midiEffects: DeviceWithDrumPads[] = [];
  const instruments: DeviceWithDrumPads[] = [];
  const audioEffects: DeviceWithDrumPads[] = [];

  for (const device of devices) {
    const processedDevice = readDevice(device, {
      includeChains: includeRackChains,
      includeReturnChains,
      includeDrumPads,
    }) as unknown as DeviceWithDrumPads;

    // Use processed device type for proper rack categorization
    const deviceType = processedDevice.type;

    if (
      deviceType.startsWith(DEVICE_TYPE.MIDI_EFFECT) ||
      deviceType.startsWith(DEVICE_TYPE.MIDI_EFFECT_RACK)
    ) {
      midiEffects.push(processedDevice);
    } else if (
      deviceType.startsWith(DEVICE_TYPE.INSTRUMENT) ||
      deviceType.startsWith(DEVICE_TYPE.INSTRUMENT_RACK) ||
      deviceType.startsWith(DEVICE_TYPE.DRUM_RACK)
    ) {
      instruments.push(processedDevice);
    } else if (
      deviceType.startsWith(DEVICE_TYPE.AUDIO_EFFECT) ||
      deviceType.startsWith(DEVICE_TYPE.AUDIO_EFFECT_RACK)
    ) {
      audioEffects.push(processedDevice);
    }
  }

  // Validate instrument count
  if (instruments.length > 1) {
    console.warn(
      `Track has ${instruments.length} instruments, which is unusual. Expected 0 or 1.`,
    );
  }

  return {
    midiEffects,
    instrument: instruments.length > 0 ? (instruments[0] ?? null) : null,
    audioEffects,
  };
}

/**
 * Read all devices as a flat ordered list (preserving original track device order).
 * Returns undefined for Producer Pal host tracks with no devices.
 * @param devices - Array of Live API device objects
 * @param isProducerPalHost - Whether this is the Producer Pal host track
 * @returns Flat array of device objects, or undefined
 */
export function readDevicesFlat(
  devices: LiveAPI[],
  isProducerPalHost: boolean,
): Record<string, unknown>[] | undefined {
  if (isProducerPalHost && devices.length === 0) {
    return undefined;
  }

  return devices.map((device) =>
    readDevice(device, {
      includeChains: false,
      includeReturnChains: false,
      includeDrumPads: false,
    }),
  );
}
