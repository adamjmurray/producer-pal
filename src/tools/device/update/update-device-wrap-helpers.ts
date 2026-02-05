// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
} from "#src/tools/constants.ts";
import { resolveInsertionPath } from "#src/tools/shared/device/helpers/path/device-path-helpers.ts";
import {
  assertDefined,
  parseCommaSeparatedIds,
} from "#src/tools/shared/utils.ts";

const RACK_TYPE_INSTRUMENT = "instrument-rack";

const RACK_TYPE_TO_DEVICE_NAME = {
  "audio-effect-rack": "Audio Effect Rack",
  "midi-effect-rack": "MIDI Effect Rack",
  [RACK_TYPE_INSTRUMENT]: "Instrument Rack",
} as const;

type RackType = keyof typeof RACK_TYPE_TO_DEVICE_NAME;

interface WrapDevicesOptions {
  ids?: string;
  path?: string;
  toPath?: string;
  name?: string;
}

interface WrapResult {
  id: string;
  type: string;
  deviceCount: number;
}

/**
 * Wrap device(s) in a new rack
 * @param options - The options
 * @param options.ids - Comma-separated device ID(s)
 * @param options.path - Comma-separated device path(s)
 * @param options.toPath - Target path for the new rack
 * @param options.name - Name for the new rack
 * @returns Info about the created rack
 */
export function wrapDevicesInRack({
  ids,
  path,
  toPath,
  name,
}: WrapDevicesOptions): WrapResult | null {
  const items = parseCommaSeparatedIds(ids ?? path);
  const isIdBased = ids != null;
  const devices = resolveDevices(items, isIdBased);

  if (devices.length === 0) {
    console.warn("wrapInRack: no devices found");

    return null;
  }

  const rackType = determineRackType(devices);

  if (rackType == null) {
    return null;
  }

  // Instruments require temp-track workaround
  if (rackType === RACK_TYPE_INSTRUMENT) {
    return wrapInstrumentsInRack(devices, toPath, name);
  }

  const { container, position } = toPath
    ? resolveInsertionPath(toPath)
    : getDeviceInsertionPoint(assertDefined(devices[0], "first device"));

  if (!container?.exists()) {
    console.warn("wrapInRack: target container does not exist");

    return null;
  }

  const rackName = RACK_TYPE_TO_DEVICE_NAME[rackType as RackType];
  const rackId = container.call(
    "insert_device",
    rackName,
    position ?? 0,
  ) as string;
  const rack = LiveAPI.from(rackId);

  if (name) {
    rack.set("name", name);
  }

  const liveSet = LiveAPI.from("live_set");

  for (let i = 0; i < devices.length; i++) {
    const device = assertDefined(devices[i], `device at index ${i}`);

    // Ensure chain exists (create if needed)
    const currentChainCount = rack.getChildren("chains").length;

    if (i >= currentChainCount) {
      const chainsNeeded = i + 1 - currentChainCount;

      for (let j = 0; j < chainsNeeded; j++) {
        const result = rack.call("insert_chain");

        if (!Array.isArray(result) || result[0] !== "id") {
          console.warn(
            `wrapInRack: failed to create chain ${j + 1}/${chainsNeeded}`,
          );
        }
      }
    }

    const chainPath = `${rack.path} chains ${i}`;
    const chainContainer = LiveAPI.from(chainPath);
    const deviceId = device.id.startsWith("id ")
      ? device.id
      : `id ${device.id}`;
    const chainId = chainContainer.id.startsWith("id ")
      ? chainContainer.id
      : `id ${chainContainer.id}`;

    liveSet.call("move_device", deviceId, chainId, 0);
  }

  return { id: rack.id, type: rackType, deviceCount: devices.length };
}

/**
 * Resolve device items (IDs or paths) to LiveAPI objects
 * @param items - Device IDs or paths
 * @param isIdBased - True if items are IDs, false if paths
 * @returns Array of device LiveAPI objects
 */
function resolveDevices(items: string[], isIdBased: boolean): LiveAPI[] {
  const devices: LiveAPI[] = [];

  for (const item of items) {
    const device = isIdBased ? LiveAPI.from(item) : resolveDeviceFromPath(item);

    if (device?.exists()) {
      const type = device.type;

      if (type.endsWith("Device")) {
        devices.push(device);
      } else {
        console.warn(`wrapInRack: "${item}" is not a device (type: ${type})`);
      }
    } else {
      console.warn(`wrapInRack: device not found at "${item}"`);
    }
  }

  return devices;
}

/**
 * Resolve a device from a simplified path
 * @param path - Device path
 * @returns Device LiveAPI or null if not found
 */
function resolveDeviceFromPath(path: string): LiveAPI | null {
  const resolved = resolveInsertionPath(path);

  if (!resolved.container) {
    return null;
  }

  if (resolved.position != null) {
    const devicePath = `${resolved.container.path} devices ${resolved.position}`;

    return LiveAPI.from(devicePath);
  }

  return resolved.container;
}

/**
 * Determine the appropriate rack type for wrapping devices
 * @param devices - Devices to wrap
 * @returns Rack type or null if incompatible
 */
function determineRackType(devices: LiveAPI[]): string | null {
  const types = new Set<number>();

  for (const device of devices) {
    const deviceType = device.getProperty("type") as number;

    types.add(deviceType);
  }

  if (types.has(LIVE_API_DEVICE_TYPE_INSTRUMENT)) {
    return RACK_TYPE_INSTRUMENT;
  }

  if (
    types.has(LIVE_API_DEVICE_TYPE_AUDIO_EFFECT) &&
    types.has(LIVE_API_DEVICE_TYPE_MIDI_EFFECT)
  ) {
    console.warn("wrapInRack: cannot mix MIDI and Audio effects in one rack");

    return null;
  }

  if (types.has(LIVE_API_DEVICE_TYPE_AUDIO_EFFECT)) {
    return "audio-effect-rack";
  }

  if (types.has(LIVE_API_DEVICE_TYPE_MIDI_EFFECT)) {
    return "midi-effect-rack";
  }

  console.warn("wrapInRack: no valid effect devices found");

  return null;
}

/**
 * Get the parent container and position for a device
 * @param device - Device to get insertion point for
 * @returns Container and position
 */
function getDeviceInsertionPoint(device: LiveAPI): {
  container: LiveAPI;
  position: number;
} {
  const parentPath = device.path.replace(/ devices \d+$/, "");
  const container = LiveAPI.from(parentPath);
  const match = device.path.match(/ devices (\d+)$/);
  const position = match ? Number.parseInt(match[1] as string) : 0;

  return { container, position };
}

/**
 * Wrap instrument(s) in an Instrument Rack using temp-track workaround.
 * Live doesn't allow creating Instrument Rack on track with existing instrument.
 * @param devices - Instrument device(s) to wrap
 * @param toPath - Target path for the new rack
 * @param name - Name for the new rack
 * @returns Info about the created rack
 */
function wrapInstrumentsInRack(
  devices: LiveAPI[],
  toPath?: string,
  name?: string,
): WrapResult {
  const liveSet = LiveAPI.from("live_set");
  const firstDevice = assertDefined(devices[0], "first device");

  // 1. Get source track from first instrument
  const { container: sourceContainer, position: devicePosition } =
    getDeviceInsertionPoint(firstDevice);

  // 2. Create temp MIDI track (appended)
  const tempTrackId = liveSet.call("create_midi_track", -1) as string;
  const tempTrack = LiveAPI.from(tempTrackId);
  const tempTrackIndex = tempTrack.trackIndex;

  try {
    // 3. Move ALL instruments to temp track
    const tempTrackIdForMove = formatId(tempTrack.id);

    for (const device of devices) {
      liveSet.call("move_device", formatId(device.id), tempTrackIdForMove, 0);
    }

    // 4. Create Instrument Rack on source track (or toPath)
    const { container, position } = toPath
      ? resolveInsertionPath(toPath)
      : { container: sourceContainer, position: devicePosition };

    if (!container?.exists()) {
      throw new Error(`wrapInRack: target container does not exist`);
    }

    const rackId = container.call(
      "insert_device",
      "Instrument Rack",
      position ?? 0,
    ) as string;
    const rack = LiveAPI.from(rackId);

    if (name) {
      rack.set("name", name);
    }

    // 5. Move each instrument from temp into rack's chains
    // Instruments are now at devices 0, 1, 2... on temp track (in reverse order)
    // We need to process them in reverse to maintain original order
    for (let i = devices.length - 1; i >= 0; i--) {
      // Create chain
      rack.call("insert_chain");
      const chainIndex = rack.getChildren("chains").length - 1;
      const chain = LiveAPI.from(`${rack.path} chains ${chainIndex}`);

      // Get device at position 0 (always 0 since we move from front)
      const tempDevice = LiveAPI.from(`${tempTrack.path} devices 0`);

      liveSet.call(
        "move_device",
        formatId(tempDevice.id),
        formatId(chain.id),
        0,
      );
    }

    // 6. Delete temp track
    liveSet.call("delete_track", tempTrackIndex);

    return {
      id: rack.id,
      type: RACK_TYPE_INSTRUMENT,
      deviceCount: devices.length,
    };
  } catch (error) {
    // Cleanup: delete temp track if it still exists
    try {
      liveSet.call("delete_track", tempTrackIndex);
    } catch {
      // Ignore cleanup errors
    }

    throw error;
  }
}

/**
 * Format an ID with "id " prefix if needed
 * @param id - ID to format
 * @returns Formatted ID
 */
function formatId(id: string): string {
  return id.startsWith("id ") ? id : `id ${id}`;
}
