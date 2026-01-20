import { ALL_VALID_DEVICES, VALID_DEVICES } from "#src/tools/constants.ts";
import { resolveInsertionPath } from "#src/tools/shared/device/helpers/path/device-path-helpers.ts";

interface CreateDeviceArgs {
  deviceName?: string;
  path?: string;
}

interface CreateDeviceResult {
  deviceId: string | number;
  deviceIndex: number | null;
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
 * @param args.path - Device path (required when deviceName provided)
 * @param _context - Internal context object (unused)
 * @returns Device list, or object with deviceId and deviceIndex
 */
export function createDevice(
  { deviceName, path }: CreateDeviceArgs = {},
  _context: Partial<ToolContext> = {},
): typeof VALID_DEVICES | CreateDeviceResult {
  // List mode: return valid devices when deviceName is omitted
  if (deviceName == null) {
    return VALID_DEVICES;
  }

  validateDeviceName(deviceName);

  if (path == null) {
    throw new Error(
      "createDevice failed: path is required when creating a device",
    );
  }

  return createDeviceAtPath(deviceName, path);
}

/**
 * Create device at a path (track or chain)
 * @param deviceName - Device name
 * @param path - Device path
 * @returns Object with deviceId and deviceIndex
 */
function createDeviceAtPath(
  deviceName: string,
  path: string,
): CreateDeviceResult {
  const { container, position } = resolveInsertionPath(path);

  if (!container?.exists()) {
    throw new Error(
      `createDevice failed: container at path "${path}" does not exist`,
    );
  }

  const result =
    position != null
      ? (container.call("insert_device", deviceName, position) as [
          string,
          string | number,
        ])
      : (container.call("insert_device", deviceName) as [
          string,
          string | number,
        ]);

  const deviceId = result[1];
  const device = deviceId ? LiveAPI.from(`id ${deviceId}`) : null;

  if (!device?.exists()) {
    const positionDesc = position != null ? `position ${position}` : "end";

    throw new Error(
      `createDevice failed: could not insert "${deviceName}" at ${positionDesc} in path "${path}"`,
    );
  }

  return {
    deviceId,
    deviceIndex: device.deviceIndex,
  };
}
