import * as console from "#src/shared/v8-max-console.ts";
import { DEVICE_TYPE } from "#src/tools/constants.ts";
import { readDevice } from "#src/tools/shared/device/device-reader.ts";
import type { DeviceWithDrumPads } from "#src/tools/shared/device/device-reader.ts";

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
    console.error(
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
 * Removes chains property from a device object
 * @param device - Device object to strip chains from
 * @returns Device object without chains property
 */
export function stripChains<T extends { chains?: unknown }>(
  device: T,
): Omit<T, "chains"> {
  const { chains: _chains, ...rest } = device;

  return rest;
}
