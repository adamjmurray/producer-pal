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
import {
  resolveDrumPadFromPath,
  resolveInsertionPath,
  resolvePathToLiveApi,
} from "#src/tools/shared/device/helpers/path/insertion-path.ts";
import { isProducerPalDevice } from "#src/tools/shared/device/is-producer-pal-device.ts";
import { toLiveApiId } from "#src/tools/shared/helpers/live-api-values.ts";
import {
  namedTargets,
  type NamedTarget,
} from "#src/tools/shared/validation/lists/named-targets.ts";
import {
  pathField,
  targetLabel,
} from "#src/tools/shared/validation/object-path-for-api.ts";
import { liveObjectWords } from "./update-target-types.ts";

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
  /** Devices in the rack's one chain */
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

  // Instruments require temp-track workaround
  if (rackType === RACK_TYPE_INSTRUMENT) {
    return wrapInstrumentInRack(devices, reasons, toPath, name);
  }

  const { container, position } = toPath
    ? rackDestination(toPath)
    : getDeviceInsertionPoint(assertDefined(devices[0], "first device").device);
  const rack = insertRack(container, position, rackType);

  nameRack(rack, name);
  const chain = firstChain(rack);

  if (chain == null) {
    for (const { param, value } of devices) {
      reasons.push(`${param} "${value}" stayed put: Live made no chain for it`);
    }

    reasons.push("the new rack was left empty");
  } else {
    moveDevicesIntoChain(chain, devices, reasons);
  }

  return rackResult(rack, rackType, chain, reasons);
}

/**
 * Insert an empty rack.
 * @param container - Where the rack goes
 * @param position - The slot in it, or null to append
 * @param rackType - Which kind of rack
 * @returns The new rack
 * @throws Error when Live refuses the insert
 */
function insertRack(
  container: LiveAPI,
  position: number | null,
  rackType: RackType,
): LiveAPI {
  const rackName = RACK_TYPE_TO_DEVICE_NAME[rackType];
  // Append (no index) at the end: Live refuses index 0 on an empty track or
  // chain. Count here, after a wrapped instrument has moved out. Never pass 0
  // for "no index" — that puts the rack first.
  const appends =
    position == null || position === container.getChildCount("devices");
  const rackId = (
    appends
      ? container.call("insert_device", rackName)
      : container.call("insert_device", rackName, position)
  ) as string;
  const rack = LiveAPI.from(rackId);

  // Live refuses an insert by answering with no id, not by throwing.
  if (!rack.exists()) {
    throw new Error(`wrapInRack: Live refused to insert the ${rackName}`);
  }

  return rack;
}

/**
 * Name the new rack, if the call asked.
 * @param rack - The new rack
 * @param name - Name for it
 */
function nameRack(rack: LiveAPI, name?: string): void {
  if (name) {
    rack.set("name", name);
  }
}

/**
 * What a wrap answers with. deviceCount is read back from the chain, so a
 * move Live ignored doesn't count.
 * @param rack - The new rack
 * @param type - Which kind of rack
 * @param chain - The rack's one chain, or null when Live made none
 * @param reasons - Why a device the call named isn't in the rack
 * @returns The rack's entry
 */
function rackResult(
  rack: LiveAPI,
  type: RackType,
  chain: LiveAPI | null,
  reasons: string[],
): WrapResult {
  return {
    id: rack.id,
    ...pathField(rack),
    type,
    deviceCount: chain?.getChildCount("devices") ?? 0,
    ...(reasons.length > 0 ? { reason: reasons.join("; ") } : {}),
  };
}

/**
 * Put the devices in series in one chain, in the order Live requires: MIDI
 * effects, then the instrument, then audio effects, each kind in the order
 * named. Each goes on the chain's end as it stands, so a move Live ignores
 * doesn't push the rest past it.
 * @param chain - The rack's chain
 * @param devices - The devices to wrap
 * @param reasons - Why a device the call named isn't in the rack, added to
 */
function moveDevicesIntoChain(
  chain: LiveAPI,
  devices: ResolvedDevice[],
  reasons: string[],
): void {
  const liveSet = LiveAPI.from(livePath.liveSet);
  const chainId = toLiveApiId(chain.id);
  const ordered = devices.toSorted((a, b) => chainRank(a) - chainRank(b));

  for (const { device } of ordered) {
    const end = chain.getChildCount("devices");

    liveSet.call("move_device", toLiveApiId(device.id), chainId, end);
  }

  for (const { param, value, device } of ordered) {
    if (!holdsDevice(chain, device)) {
      reasons.push(
        `${param} "${value}" is not in the rack: Live didn't move it`,
      );
    }
  }
}

/**
 * Whether a track or chain holds a device right now.
 * @param container - The track or chain
 * @param device - The device
 * @returns True when the device is in it
 */
function holdsDevice(container: LiveAPI, device: LiveAPI): boolean {
  return container.getChildIds("devices").includes(toLiveApiId(device.id));
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
 * Where a device's kind sits in a chain.
 * @param resolved - A device to wrap
 * @returns 0 for MIDI effects, 1 for the instrument, 2 for the rest
 */
function chainRank(resolved: ResolvedDevice): number {
  const type = resolved.device.getProperty("type");

  if (type === LIVE_API_DEVICE_TYPE_MIDI_EFFECT) {
    return 0;
  }

  return type === LIVE_API_DEVICE_TYPE_INSTRUMENT ? 1 : 2;
}

/**
 * The new rack's first chain, made if the rack has none.
 * @param rack - The new rack
 * @returns The chain, or null when Live wouldn't make one
 */
function firstChain(rack: LiveAPI): LiveAPI | null {
  return rack.getChildCount("chains") > 0
    ? rack.child("chains", "0")
    : appendChain(rack);
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
 * Wrap one instrument, plus any effects named with it, in an Instrument Rack.
 * Live won't create an Instrument Rack on a track that already has an
 * instrument, so the instrument waits on a temp track while the rack is made.
 * @param devices - The devices to wrap, at least one of them an instrument
 * @param reasons - Why a device the call named isn't in the rack
 * @param toPath - Target path for the new rack
 * @param name - Name for the new rack
 * @returns Info about the created rack
 * @throws Error when more than one instrument is named
 */
function wrapInstrumentInRack(
  devices: ResolvedDevice[],
  reasons: string[],
  toPath?: string,
  name?: string,
): WrapResult {
  const instruments = devices.filter(
    ({ device }) =>
      device.getProperty("type") === LIVE_API_DEVICE_TYPE_INSTRUMENT,
  );

  // Live allows one instrument per track, so a second move onto the staging
  // track would silently do nothing — refuse before anything is staged.
  if (instruments.length > 1) {
    const named = instruments.map((d) => `${d.param} "${d.value}"`).join(", ");

    throw new Error(
      `wrapInRack can wrap only one instrument at a time; ` +
        `${instruments.length} named: ${named}`,
    );
  }

  const device = assertDefined(instruments[0], "instrument").device;
  const liveSet = LiveAPI.from(livePath.liveSet);

  // 1. Get source track from the instrument
  const { container: sourceContainer, position: devicePosition } =
    getDeviceInsertionPoint(device);

  // 2. Resolve and validate the destination BEFORE moving anything. A bad
  // toPath must fail here, while the instrument is still on its source track
  // — never after it's been staged on the temp track.
  const { container, position } = toPath
    ? rackDestination(toPath)
    : { container: sourceContainer, position: devicePosition };

  // 3. Create temp MIDI track (appended)
  const tempTrackId = liveSet.call("create_midi_track", -1) as string;
  const tempTrack = LiveAPI.from(tempTrackId);

  if (!tempTrack.exists()) {
    throw new Error("wrapInRack: Live refused to create a temp track");
  }

  let rack: LiveAPI | null = null;

  try {
    // 4. Stage the instrument on the temp track, cleared first: the user's
    // default track preset may have put an instrument there already.
    clearDevices(tempTrack);
    liveSet.call(
      "move_device",
      toLiveApiId(device.id),
      toLiveApiId(tempTrack.id),
      0,
    );

    // 5. Create Instrument Rack on source track (or toPath)
    rack = insertRack(container, position, RACK_TYPE_INSTRUMENT);
    nameRack(rack, name);
    const chain = firstChain(rack);

    // No chain means nowhere for the staged instrument: fail, so it goes back.
    if (chain == null) {
      throw new Error("wrapInRack: Live made no chain in the new rack");
    }

    // 6. Everything goes in one chain; the held instrument object followed
    // its device to the temp track, so it moves from there.
    moveDevicesIntoChain(chain, devices, reasons);

    // 7. Delete the temp track, unless the instrument never left it
    const kept = releaseTempTrack(liveSet, tempTrack, device);

    return rackResult(rack, RACK_TYPE_INSTRUMENT, chain, [...reasons, ...kept]);
  } catch (error) {
    // The empty rack goes first: it holds the source track's one instrument
    // slot, so the instrument can't go back while it's there.
    const notes = rack == null ? [] : removeEmptyRack(rack);

    if (holdsDevice(tempTrack, device)) {
      liveSet.call(
        "move_device",
        toLiveApiId(device.id),
        toLiveApiId(sourceContainer.id),
        devicePosition,
      );
    }

    notes.push(...releaseTempTrack(liveSet, tempTrack, device));

    if (notes.length === 0) {
      throw error;
    }

    throw new Error(`${errorMessage(error)}; ${notes.join("; ")}`, {
      cause: error,
    });
  }
}

/**
 * Delete every device on a track, last first.
 * @param track - The track
 */
function clearDevices(track: LiveAPI): void {
  for (let i = track.getChildCount("devices") - 1; i >= 0; i--) {
    track.call("delete_device", i);
  }
}

/**
 * Delete the temp track — but never while it holds the instrument, since that
 * would delete the instrument too. A failed delete is a note, not a failure:
 * the wrap itself is already done or already failing.
 * @param liveSet - The live_set LiveAPI object
 * @param tempTrack - The temp track
 * @param instrument - The instrument that was staged on it
 * @returns What was left behind, if anything
 */
function releaseTempTrack(
  liveSet: LiveAPI,
  tempTrack: LiveAPI,
  instrument: LiveAPI,
): string[] {
  const index = tempTrack.trackIndex;

  if (holdsDevice(tempTrack, instrument)) {
    return [`the instrument was left on new track t${index}`];
  }

  try {
    liveSet.call("delete_track", index);

    return [];
  } catch {
    return [`new track t${index} could not be deleted`];
  }
}

/**
 * Delete the new rack if nothing got into it.
 * @param rack - The new rack
 * @returns A note when an empty rack was left behind
 */
function removeEmptyRack(rack: LiveAPI): string[] {
  const empty = rack
    .getChildren("chains")
    .every((chain) => chain.getChildCount("devices") === 0);

  if (!empty) {
    return [];
  }

  try {
    const { container, position } = getDeviceInsertionPoint(rack);

    container.call("delete_device", position);

    return [];
  } catch {
    return [`the empty new rack ${targetLabel(rack)} was left in place`];
  }
}
