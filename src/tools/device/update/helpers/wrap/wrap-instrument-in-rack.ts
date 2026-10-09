// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { assertDefined, errorMessage } from "#src/shared/error-message.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { LIVE_API_DEVICE_TYPE_INSTRUMENT } from "#src/tools/constants.ts";
import { toLiveApiId } from "#src/tools/shared/helpers/live-api-values.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";
import {
  type RackDestination,
  type ResolvedDevice,
  type WrapResult,
  RACK_TYPE_INSTRUMENT,
  firstChain,
  getDeviceInsertionPoint,
  holdsDevice,
  insertRack,
  moveDevicesIntoChain,
  nameRack,
  rackResult,
} from "./wrapped-rack.ts";

// Live won't make an Instrument Rack on a track that already has an
// instrument, so wrapping one stages it on a temp track while the rack is made.

/**
 * The instruments among the devices to wrap.
 * @param devices - The devices to wrap
 * @returns The instruments
 */
function instrumentsOf(devices: ResolvedDevice[]): ResolvedDevice[] {
  return devices.filter(
    ({ device }) =>
      device.getProperty("type") === LIVE_API_DEVICE_TYPE_INSTRUMENT,
  );
}

/**
 * Refuse a wrap naming two instruments. Live allows one instrument per track,
 * so a second move onto the staging track would silently do nothing. Runs
 * before anything is staged or made.
 * @param devices - The devices to wrap
 * @throws Error when more than one instrument is named
 */
export function refuseSecondInstrument(devices: ResolvedDevice[]): void {
  const instruments = instrumentsOf(devices);

  if (instruments.length > 1) {
    const named = instruments.map((d) => `${d.param} "${d.value}"`).join(", ");

    throw new Error(
      `wrapInRack can wrap only one instrument at a time; ` +
        `${instruments.length} named: ${named}`,
    );
  }
}

/**
 * Wrap one instrument, plus any effects named with it, in an Instrument Rack.
 * Live won't create an Instrument Rack on a track that already has an
 * instrument, so the instrument waits on a temp track while the rack is made.
 * @param devices - The devices to wrap, at least one of them an instrument
 * @param reasons - Why a device the call named isn't in the rack
 * @param destination - Where `toPath` put the rack, or undefined to keep the
 *   instrument's own slot
 * @param name - Name for the new rack
 * @returns Info about the created rack
 */
export function wrapInstrumentInRack(
  devices: ResolvedDevice[],
  reasons: string[],
  destination: RackDestination | undefined,
  name?: string,
): WrapResult {
  const device = assertDefined(instrumentsOf(devices)[0], "instrument").device;
  const liveSet = LiveAPI.from(livePath.liveSet);

  // 1. Get source track from the instrument
  const { container: sourceContainer, position: devicePosition } =
    getDeviceInsertionPoint(device);

  // 2. The destination was resolved BEFORE anything moved, so a bad toPath
  // failed while the instrument was still on its source track — never after
  // it's been staged on the temp track.
  const { container, position } = destination ?? {
    container: sourceContainer,
    position: devicePosition,
  };

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

    // 5. Create Instrument Rack on source track (or toPath). A slot names a
    // place in the container as the call found it, and the instrument has
    // since left, so a slot past it in its own container is one lower.
    const slot =
      position != null &&
      container.id === sourceContainer.id &&
      position > devicePosition
        ? position - 1
        : position;

    rack = insertRack(container, slot, RACK_TYPE_INSTRUMENT);
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

    return rackResult(
      rack,
      RACK_TYPE_INSTRUMENT,
      chain,
      [...reasons, ...kept],
      destination?.created,
    );
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
