// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  LIVE_API_DEVICE_TYPE_INSTRUMENT,
  LIVE_API_DEVICE_TYPE_MIDI_EFFECT,
} from "#src/tools/constants.ts";
import { appendChain } from "#src/tools/shared/device/helpers/chain-auto-creation.ts";
import { toLiveApiId } from "#src/tools/shared/helpers/live-api-values.ts";
import { type NamedTarget } from "#src/tools/shared/validation/lists/named-targets.ts";
import { pathField } from "#src/tools/shared/validation/object-path-for-api.ts";

// What both kinds of wrap build: one rack, one chain, the devices moved in.

export const RACK_TYPE_INSTRUMENT = "instrument-rack";

const RACK_TYPE_TO_DEVICE_NAME = {
  "audio-effect-rack": "Audio Effect Rack",
  "midi-effect-rack": "MIDI Effect Rack",
  [RACK_TYPE_INSTRUMENT]: "Instrument Rack",
} as const;

export type RackType = keyof typeof RACK_TYPE_TO_DEVICE_NAME;

export interface WrapResult {
  id: string;
  path?: string;
  type: string;
  /** Devices in the rack's one chain */
  deviceCount: number;
  /** The rack chains `toPath` had to make first ("c2-c3"), when it made any */
  created?: string;
  /** Which of the devices the call named didn't make it into the rack */
  detail?: string;
}

/** Where the new rack goes. */
export interface RackDestination {
  container: LiveAPI;
  /** The slot the path named, or null to append */
  position: number | null;
  /** The rack chains the path made on the way, for the result to report */
  created?: string;
  /** Every chain the path made, for a failure to say what it left */
  made?: string;
}

/** A device the call named, alongside the param and spelling that named it. */
export interface ResolvedDevice extends NamedTarget {
  device: LiveAPI;
}

/**
 * Insert an empty rack.
 * @param container - Where the rack goes
 * @param position - The slot in it, or null to append
 * @param rackType - Which kind of rack
 * @returns The new rack
 * @throws Error when Live refuses the insert
 */
export function insertRack(
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
export function nameRack(rack: LiveAPI, name?: string): void {
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
 * @param created - The chains `toPath` made on the way, if any
 * @returns The rack's entry
 */
export function rackResult(
  rack: LiveAPI,
  type: RackType,
  chain: LiveAPI | null,
  reasons: string[],
  created?: string,
): WrapResult {
  return {
    id: rack.id,
    ...pathField(rack),
    type,
    deviceCount: chain?.getChildCount("devices") ?? 0,
    ...(created == null ? {} : { created }),
    ...(reasons.length > 0 ? { detail: reasons.join("; ") } : {}),
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
export function moveDevicesIntoChain(
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
export function holdsDevice(container: LiveAPI, device: LiveAPI): boolean {
  return container.getChildIds("devices").includes(toLiveApiId(device.id));
}

/**
 * Where a device's kind sits in a chain.
 * @param resolved - A device to wrap
 * @returns 0 for MIDI effects, 1 for the instrument, 2 for the rest
 */
export function chainRank(resolved: ResolvedDevice): number {
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
export function firstChain(rack: LiveAPI): LiveAPI | null {
  return rack.getChildCount("chains") > 0
    ? rack.child("chains", "0")
    : appendChain(rack);
}

/**
 * Get the parent container and position for a device
 * @param device - Device to get insertion point for
 * @returns Container and position
 */
export function getDeviceInsertionPoint(device: LiveAPI): {
  container: LiveAPI;
  position: number;
} {
  const parentPath = device.path.replace(/ devices \d+$/, "");
  const container = LiveAPI.from(parentPath);
  const match = device.path.match(/ devices (\d+)$/);
  const position = match ? Number.parseInt(match[1] as string) : 0;

  return { container, position };
}
