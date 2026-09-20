// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { assertDefined, errorMessage } from "#src/shared/error-message.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  LIVE_API_DEVICE_TYPE_AUDIO_EFFECT,
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
} from "#src/tools/constants.ts";
import { appendChain } from "#src/tools/shared/device/helpers/chain-auto-creation.ts";
import { nothingAtPath } from "#src/tools/shared/device/helpers/path/device-path-to-live-api.ts";
import { resolveInsertionPath } from "#src/tools/shared/device/helpers/path/insertion-path.ts";
import { isProducerPalDevice } from "#src/tools/shared/device/is-producer-pal-device.ts";
import { toLiveApiId } from "#src/tools/shared/helpers/live-api-values.ts";
import {
  namedTargets,
  type NamedTarget,
} from "#src/tools/shared/validation/lists/named-targets.ts";
import {
  NEW_CHAIN_ADVICE,
  NEW_DEVICE_ADVICE,
} from "#src/tools/shared/validation/helpers/object-path-lexer.ts";
import {
  pathField,
  targetLabel,
} from "#src/tools/shared/validation/object-path-for-api.ts";
import { liveObjectWords } from "./update-target-types.ts";
import {
  type ObjectPath,
  parseObjectPath,
} from "#src/tools/shared/validation/object-path.ts";

/** Why a path that only names a place to put a device wraps nothing. */
const APPEND_ADVICE: Partial<Record<ObjectPath["kind"], string>> = {
  "new-chain": NEW_CHAIN_ADVICE,
  "new-device": NEW_DEVICE_ADVICE,
};

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
  path?: string;
  type: string;
  deviceCount: number;
  /** Which of the devices the call named didn't make it into the rack */
  reason?: string;
}

/** Where the new rack goes. */
interface RackDestination {
  container: LiveAPI;
  /** The slot the path named, or null to append */
  position: number | null;
}

/**
 * Wrap device(s) in a new rack
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
  const devices = resolveDevices(namedTargets({ id: ids, path }), reasons);

  refuseEmptyWrap(devices, reasons);

  const rackType = determineRackType(devices.map((d) => d.device));

  // Instruments require temp-track workaround
  if (rackType === RACK_TYPE_INSTRUMENT) {
    // Live allows one instrument per track, so a second move onto the staging
    // track would silently do nothing — refuse before anything is staged.
    if (devices.length > 1) {
      const named = devices.map((d) => `${d.param} "${d.value}"`).join(", ");

      throw new Error(
        `wrapInRack can wrap only one instrument at a time; ` +
          `${devices.length} named: ${named}`,
      );
    }

    return wrapInstrumentInRack(
      assertDefined(devices[0], "first device").device,
      toPath,
      name,
    );
  }

  const { container, position } = toPath
    ? rackDestination(toPath)
    : getDeviceInsertionPoint(assertDefined(devices[0], "first device").device);

  const rackName = RACK_TYPE_TO_DEVICE_NAME[rackType];
  const rackId = container.call(
    "insert_device",
    rackName,
    position ?? 0,
  ) as string;
  const rack = LiveAPI.from(rackId);

  if (name) {
    rack.set("name", name);
  }

  moveDevicesIntoChains(rack, devices, reasons);

  return {
    id: rack.id,
    ...pathField(rack),
    type: rackType,
    deviceCount: rack.getChildCount("chains"),
    ...(reasons.length > 0 ? { reason: reasons.join("; ") } : {}),
  };
}

/**
 * Put each device in its own chain of the new rack, making the chains as it
 * goes. A chain Live won't make is the one device that didn't get in, so it
 * lands on the rack's own entry rather than dropping out of sight.
 * @param rack - The new rack
 * @param devices - The devices to wrap, in order
 * @param reasons - Why a device the call named isn't in the rack, added to
 */
function moveDevicesIntoChains(
  rack: LiveAPI,
  devices: ResolvedDevice[],
  reasons: string[],
): void {
  const liveSet = LiveAPI.from(livePath.liveSet);

  for (const [index, { param, value, device }] of devices.entries()) {
    const chain = chainAt(rack, index);

    if (chain == null) {
      reasons.push(`${param} "${value}" stayed put: Live made no chain for it`);
      continue;
    }

    liveSet.call(
      "move_device",
      toLiveApiId(device.id),
      toLiveApiId(chain.id),
      0,
    );
  }
}

/**
 * The rack's chain at an index, appending chains until it exists.
 * @param rack - The new rack
 * @param index - The chain index wanted
 * @returns The chain, or null when Live wouldn't make one
 */
function chainAt(rack: LiveAPI, index: number): LiveAPI | null {
  for (let i = rack.getChildCount("chains"); i <= index; i++) {
    if (appendChain(rack) == null) {
      return null;
    }
  }

  return rack.child("chains", String(index));
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

/** A device the call named, alongside the param and spelling that named it. */
interface ResolvedDevice extends NamedTarget {
  device: LiveAPI;
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
      } else if (device.type.endsWith("Device")) {
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
  const { container, position, namesNothing } = resolveInsertionPath(
    toPath,
    "toPath",
  );

  if (namesNothing != null) {
    throw new Error(nothingAtPath(toPath, namesNothing, "toPath"));
  }

  if (!container?.exists()) {
    throw new Error(nothingAtPath(toPath, undefined, "toPath"));
  }

  return { container, position };
}

/**
 * Resolve a device from a simplified path
 * @param path - Device path
 * @returns Device LiveAPI or null if not found
 */
function resolveDeviceFromPath(path: string): LiveAPI | null {
  // wrapInRack wraps devices that are already there, so an append marker names
  // nothing to wrap — and resolving a "c+" here would make the chain before
  // finding no device in it.
  const advice = APPEND_ADVICE[parseObjectPath(path).kind];

  if (advice != null) {
    throw new Error(nothingAtPath(path, advice));
  }

  const resolved = resolveInsertionPath(path);

  if (resolved.namesNothing != null) {
    throw new Error(nothingAtPath(path, resolved.namesNothing));
  }

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
    throw new Error("wrapInRack cannot mix MIDI and audio effects in one rack");
  }

  if (types.has(LIVE_API_DEVICE_TYPE_AUDIO_EFFECT)) {
    return "audio-effect-rack";
  }

  if (types.has(LIVE_API_DEVICE_TYPE_MIDI_EFFECT)) {
    return "midi-effect-rack";
  }

  throw new Error("wrapInRack found no effect devices to wrap");
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
 * Wrap one instrument in an Instrument Rack using a temp-track workaround.
 * Live doesn't allow creating an Instrument Rack on a track that already has
 * an instrument, and doesn't allow two instruments on one track — so this
 * only ever handles one instrument; the caller refuses more than one up front.
 * @param device - Instrument device to wrap
 * @param toPath - Target path for the new rack
 * @param name - Name for the new rack
 * @returns Info about the created rack
 */
function wrapInstrumentInRack(
  device: LiveAPI,
  toPath?: string,
  name?: string,
): WrapResult {
  const liveSet = LiveAPI.from(livePath.liveSet);

  // 1. Get source track from the instrument
  const { container: sourceContainer, position: devicePosition } =
    getDeviceInsertionPoint(device);

  // 2. Resolve and validate the destination BEFORE moving anything. A bad
  // toPath must fail here, while the instruments are still safely on their
  // source track — never after they've been staged on the temp track.
  const { container, position } = toPath
    ? rackDestination(toPath)
    : { container: sourceContainer, position: devicePosition };

  // 3. Create temp MIDI track (appended)
  const tempTrackId = liveSet.call("create_midi_track", -1) as string;
  const tempTrack = LiveAPI.from(tempTrackId);
  const tempTrackIndex = tempTrack.trackIndex;

  try {
    // 4. Move the instrument to the temp track
    liveSet.call(
      "move_device",
      toLiveApiId(device.id),
      toLiveApiId(tempTrack.id),
      0,
    );

    // 5. Create Instrument Rack on source track (or toPath)
    const rackId = container.call(
      "insert_device",
      "Instrument Rack",
      position ?? 0,
    ) as string;
    const rack = LiveAPI.from(rackId);

    if (name) {
      rack.set("name", name);
    }

    // 6. Move the instrument from the temp track into the rack's chain
    rack.call("insert_chain");
    const chainIndex = rack.getChildCount("chains") - 1;
    const chain = LiveAPI.from(`${rack.path} chains ${chainIndex}`);
    const tempDevice = LiveAPI.from(`${tempTrack.path} devices 0`);

    liveSet.call(
      "move_device",
      toLiveApiId(tempDevice.id),
      toLiveApiId(chain.id),
      0,
    );

    // 7. Delete temp track
    liveSet.call("delete_track", tempTrackIndex);

    return {
      id: rack.id,
      ...pathField(rack),
      type: RACK_TYPE_INSTRUMENT,
      deviceCount: rack.getChildCount("chains"),
    };
  } catch (error) {
    // The instruments were staged on the temp track before/while the rack was
    // built. Move any that are still on it back to the source container FIRST,
    // so deleting the temp track can never destroy the user's instruments.
    restoreStrandedInstruments(
      liveSet,
      tempTrack,
      sourceContainer,
      devicePosition,
    );

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
 * Move any instruments still staged on the temp track back to their original
 * container. Used on the wrap failure path so deleting the temp track never
 * takes instruments down with it. Best-effort: a failed move on one device does
 * not stop the others.
 * @param liveSet - The live_set LiveAPI object (owns move_device)
 * @param tempTrack - Temp track instruments were staged on
 * @param sourceContainer - Original container to restore instruments into
 * @param position - Original device position within the source container
 */
function restoreStrandedInstruments(
  liveSet: LiveAPI,
  tempTrack: LiveAPI,
  sourceContainer: LiveAPI,
  position: number,
): void {
  const sourceId = toLiveApiId(sourceContainer.id);
  // Bounded by the initial count: each move removes device 0, so re-reading
  // slot 0 walks the list; the cap guards against a move that silently no-ops.
  const count = tempTrack.getChildCount("devices");

  for (let i = 0; i < count; i++) {
    const stranded = tempTrack.child("devices", "0");

    if (!stranded.exists()) {
      break;
    }

    try {
      liveSet.call("move_device", toLiveApiId(stranded.id), sourceId, position);
    } catch {
      // Best-effort restore; continue with the remaining instruments.
    }
  }
}
