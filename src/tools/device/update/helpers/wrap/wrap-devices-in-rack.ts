// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { assertDefined, errorMessage } from "#src/shared/error-message.ts";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
} from "#src/tools/constants.ts";
import {
  errorWithChainsLeft,
  withChainsLeft,
} from "#src/tools/shared/device/helpers/path/chains-left.ts";
import { nothingAtPath } from "#src/tools/shared/device/helpers/path/device-path-to-live-api.ts";
import {
  resolveDrumPadFromPath,
  resolveInsertionPath,
  resolvePathToLiveApi,
} from "#src/tools/shared/device/helpers/path/insertion-path.ts";
import { isDeviceClass } from "#src/tools/shared/device/is-device-class.ts";
import { isProducerPalDevice } from "#src/tools/shared/device/is-producer-pal-device.ts";
import {
  namedTargets,
  type NamedTarget,
} from "#src/tools/shared/validation/lists/named-targets.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";
import { liveObjectWords } from "#src/tools/shared/device/device-target-types.ts";
import {
  refuseSecondInstrument,
  wrapInstrumentInRack,
} from "./wrap-instrument-in-rack.ts";
import {
  type RackDestination,
  type RackType,
  type ResolvedDevice,
  type WrapResult,
  RACK_TYPE_INSTRUMENT,
  firstChain,
  getDeviceInsertionPoint,
  insertRack,
  moveDevicesIntoChain,
  nameRack,
  rackResult,
} from "./wrapped-rack.ts";

interface WrapDevicesOptions {
  ids?: string;
  path?: string;
  toPath?: string;
  name?: string;
}

/**
 * Wrap device(s) in a new rack, in series in one chain
 * @param options - The options
 * @param options.ids - Comma-separated device ID(s)
 * @param options.path - Comma-separated device path(s)
 * @param options.toPath - Target path for the new rack
 * @param options.name - Name for the new rack
 * @returns Info about the created rack
 * @throws Error when nothing can be wrapped, or nowhere can hold the rack
 */
export function wrapDevicesInRack({
  ids,
  path,
  toPath,
  name,
}: WrapDevicesOptions): WrapResult {
  const reasons: string[] = [];
  const devices = uniqueDevices(
    resolveDevices(namedTargets({ id: ids, path }), reasons),
  );

  refuseEmptyWrap(devices, reasons);

  const rackType = determineRackType(devices.map((d) => d.device));
  const isInstrument = rackType === RACK_TYPE_INSTRUMENT;

  // Refused before `toPath` makes any chain.
  if (isInstrument) {
    refuseSecondInstrument(devices);
  }

  const destination = toPath ? rackDestination(toPath) : undefined;

  try {
    return isInstrument
      ? wrapInstrumentInRack(devices, reasons, destination, name)
      : wrapEffectsInRack(devices, reasons, rackType, destination, name);
  } catch (error) {
    // Chains `toPath` made stay in the Set whether or not the wrap does.
    throw errorWithChainsLeft(error, destination?.made);
  }
}

// Wrap effects, which need no temp track: the rack goes in, then they move in.
function wrapEffectsInRack(
  devices: ResolvedDevice[],
  reasons: string[],
  rackType: RackType,
  destination: RackDestination | undefined,
  name: string | undefined,
): WrapResult {
  const { container, position } =
    destination ??
    getDeviceInsertionPoint(assertDefined(devices[0], "first device").device);
  const rack = insertRack(container, position, rackType);

  nameRack(rack, name);
  const chain = firstChain(rack);

  if (chain == null) {
    for (const { param, value } of devices) {
      reasons.push(`${param} "${value}" stayed put: Live made no chain for it`);
    }
  } else {
    moveDevicesIntoChain(chain, devices, reasons);
  }

  // The rack stays even with nothing in it: the call already changed the Set.
  if ((chain?.getChildCount("devices") ?? 0) === 0) {
    reasons.push("the new rack was left empty");
  }

  return rackResult(rack, rackType, chain, reasons, destination?.created);
}

/**
 * Drop repeats, so a device named twice (or by id and by path) is wrapped
 * once and counts once.
 * @param devices - The devices that resolved
 * @returns Each device once, in the order first named
 */
function uniqueDevices(devices: ResolvedDevice[]): ResolvedDevice[] {
  const seen = new Set<string>();

  return devices.filter(({ device }) => {
    const fresh = !seen.has(device.id);

    seen.add(device.id);

    return fresh;
  });
}

/**
 * Refuse a wrap with nothing to wrap: nothing landed, and there is no rack
 * entry to carry why each device the call named dropped out.
 * @param devices - The devices that resolved
 * @param reasons - Why the rest didn't
 * @throws Error when no device resolved
 */
function refuseEmptyWrap(devices: ResolvedDevice[], reasons: string[]): void {
  if (devices.length > 0) {
    return;
  }

  const why = reasons.length > 0 ? `: ${reasons.join("; ")}` : "";

  throw new Error(`wrapInRack found no devices to wrap${why}`);
}

/**
 * Resolve the devices a call named to LiveAPI objects. One rack answers for
 * every device named, so a device that can't go in says so on the rack's own
 * entry rather than dropping out silently.
 * @param items - The targets, each tagged with the param it came from
 * @param reasons - Why a device the call named isn't in the rack, added to
 * @returns Array of resolved devices, each still carrying its own param/value
 */
function resolveDevices(
  items: NamedTarget[],
  reasons: string[],
): ResolvedDevice[] {
  const devices: ResolvedDevice[] = [];

  for (const item of items) {
    const { value, param } = item;

    try {
      const device =
        param === "id" ? LiveAPI.from(value) : resolveDeviceFromPath(value);

      if (!device?.exists()) {
        reasons.push(`no device at "${value}"`);
      } else if (isProducerPalDevice(device)) {
        // Wrapping moves the device into a chain, which is a move like any
        // other — and this one would take the connection with it.
        reasons.push(
          `the Producer Pal device ${targetLabel(device)} cannot be wrapped`,
        );
      } else if (isDeviceClass(device.type)) {
        devices.push({ ...item, device });
      } else {
        reasons.push(
          `"${value}" is ${liveObjectWords(device.type)}, not a device`,
        );
      }
    } catch (error) {
      // Resolution throws for a path that names nothing a device can sit in.
      reasons.push(errorMessage(error));
    }
  }

  return devices;
}

/**
 * Where the new rack goes. wrapInRack does one thing, so a toPath that names
 * nowhere leaves nothing to report on — it fails the call instead of skipping.
 * @param toPath - Target path for the new rack
 * @returns The container and the slot in it
 * @throws Error when the path names nowhere a rack can go
 */
function rackDestination(toPath: string): RackDestination {
  const { container, position, namesNothing, createdChains, madeChains } =
    resolveInsertionPath(toPath, "toPath");

  if (namesNothing != null) {
    throw new Error(nothingAtPath(toPath, namesNothing, "toPath"));
  }

  if (!container?.exists()) {
    throw new Error(
      withChainsLeft(nothingAtPath(toPath, undefined, "toPath"), madeChains),
    );
  }

  return { container, position, created: createdChains, made: madeChains };
}

/**
 * Resolve a device from a simplified path, read-only: the insertion resolver
 * would make missing chains before the wrap finds nothing to wrap.
 * @param path - Device path
 * @returns Whatever LiveAPI object the path names, or null if none
 * @throws Error when the path can't name a device (`t0`, `c+`, `d+`)
 */
function resolveDeviceFromPath(path: string): LiveAPI | null {
  const resolved = resolvePathToLiveApi(path);

  if (resolved.namesNothing != null) {
    throw new Error(nothingAtPath(path, resolved.namesNothing));
  }

  if (resolved.targetType !== "drum-pad") {
    return LiveAPI.from(resolved.liveApiPath);
  }

  return resolveDrumPadFromPath(
    resolved.liveApiPath,
    resolved.drumPadNote as string,
    resolved.remainingSegments,
  ).target;
}

/**
 * Determine the appropriate rack type for wrapping devices
 * @param devices - Devices to wrap
 * @returns Rack type
 * @throws Error when no one rack can hold them all
 */
function determineRackType(devices: LiveAPI[]): RackType {
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
    throw new Error(
      "wrapInRack cannot mix MIDI and audio effects in one rack without an instrument",
    );
  }

  if (types.has(LIVE_API_DEVICE_TYPE_AUDIO_EFFECT)) {
    return "audio-effect-rack";
  }

  if (types.has(LIVE_API_DEVICE_TYPE_MIDI_EFFECT)) {
    return "midi-effect-rack";
  }

  throw new Error("wrapInRack found no effect devices to wrap");
}
