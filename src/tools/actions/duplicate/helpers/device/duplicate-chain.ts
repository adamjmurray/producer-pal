// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Copying a rack chain. Live has copy_pad for drum pads but nothing for a rack
// layer, so this builds one: insert_chain for the chain, then the temp-track
// workaround to carry its devices across. Cross-rack is in scope — a device
// move already crosses racks freely.

import { errorMessage } from "#src/shared/error-message.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { moveDeviceToPath } from "#src/tools/device/update/helpers/move-device.ts";
import { readChainMixer } from "#src/tools/shared/device/helpers/chain-mixer.ts";
import { nothingAtPath } from "#src/tools/shared/device/helpers/path/device-path-to-live-api.ts";
import {
  resolveDrumPadFromPath,
  resolvePathToLiveApi,
} from "#src/tools/shared/device/helpers/path/insertion-path.ts";
import { invalidateRackChains } from "#src/tools/shared/device/helpers/path/device-drumpad-navigation.ts";
import {
  pathField,
  pathPrefix,
  targetLabel,
} from "#src/tools/shared/validation/object-path-for-api.ts";
import { type NamedTarget } from "#src/tools/shared/validation/lists/named-targets.ts";
import { type CopyLabels } from "../sources/copy-labels.ts";
import {
  adjustTrackIndicesForTempTrack,
  canonicalPath,
  withTempTrackCopy,
} from "./temp-track-copy.ts";
import { copyChainMixerTo } from "./copy-chain-mixer.ts";
import { copyToDestinations } from "./copy-per-destination.ts";

/** A chain copy: the new chain, and what didn't finish when something didn't. */
interface ChainCopy {
  id: string;
  path?: string;
  /** What the copy is missing, when the chain exists but isn't a full copy. */
  reason?: string;
}

/**
 * Copy one chain to each destination rack a comma-separated toPath names, one
 * entry per destination.
 * @param chain - LiveAPI chain object to copy
 * @param toPath - Destination rack path(s), or omitted to append to its own rack
 * @param source - The source chain, as the caller named it
 * @param labels - The call's names and colors
 * @param count - Number of copies (warns if > 1)
 * @returns One entry per destination, in the order toPath named them
 */
export function duplicateChainWithPaths(
  chain: LiveAPI,
  toPath: string | undefined,
  source: NamedTarget,
  labels: CopyLabels,
  count: number,
): object[] {
  return copyToDestinations(
    chain,
    toPath,
    source,
    labels,
    count,
    "chain",
    duplicateChain,
  );
}

/**
 * Copy a chain into a rack: a new chain, its mixer and flags, then its devices.
 * @param chain - The source chain
 * @param toPath - Destination rack path, or undefined for the source's own rack
 * @param name - Name for the copy, or undefined to keep the source's
 * @returns The new chain's id and path
 * @throws Error when no chain was created
 */
function duplicateChain(
  chain: LiveAPI,
  toPath: string | undefined,
  name: string | undefined,
): ChainCopy {
  // A return chain lives under `return_chains`, and no rack exposes a way to
  // make one — insert_chain only ever appends a regular chain. Refuse rather
  // than quietly producing a normal chain the caller didn't ask for.
  if (/ return_chains \d+$/.test(chain.path)) {
    throw new Error(
      `${targetLabel(chain)} is a rack return chain, which cannot be ` +
        "copied — the Live API has no way to create one, so they can only be " +
        "added in Live",
    );
  }

  const sourceRack = LiveAPI.from(chainRackPath(chain));
  const destinationRack = resolveDestinationRack(toPath, sourceRack);
  const created = insertChain(destinationRack);
  let reason: string | undefined;

  // The chain exists from here on, so whatever goes wrong is reported on its
  // entry: rolling it back would cost the caller a chain they now have. Its
  // path is read afterwards either way — in a Drum Rack the pad the copy
  // reports is the one carryDrumPadNote put it on.
  try {
    created.set("name", name ?? chain.getProperty("name"));

    const color = chain.getColor();

    if (color) {
      created.setColor(color);
    }

    for (const flag of ["mute", "solo"] as const) {
      if (chain.getProperty(flag) === 1) {
        created.set(flag, 1);
      }
    }

    carryDrumPadNote(chain, created);
    copyChainMixerTo(
      created,
      readChainMixer(chain),
      sourceRack,
      destinationRack,
    );
    copyChainDevices(chain, created);
    warnIfMacrosLeftBehind(sourceRack);
  } catch (error) {
    reason = errorMessage(error);
  }

  return {
    id: created.id,
    ...pathField(
      created,
      toPath == null
        ? undefined
        : { container: () => destinationRack, path: canonicalPath(toPath) },
    ),
    ...(reason == null ? {} : { reason }),
  };
}

/**
 * Put a copied drum chain on the pad its source sounds on.
 *
 * insert_chain appends to a Drum Rack with in_note -1 — the catch-all pad —
 * so without this a copy lands somewhere the caller never asked for. toPath
 * names the rack rather than a pad, and the source's own note is the only
 * destination it can mean.
 * @param chain - The source chain
 * @param created - The new chain
 */
function carryDrumPadNote(chain: LiveAPI, created: LiveAPI): void {
  if (chain.type !== "DrumChain" || created.type !== "DrumChain") {
    return;
  }

  const inNote = chain.getProperty("in_note");

  // The catch-all can't be created: Live clamps a drum chain's in_note to
  // 0-127, so a source on it has no note to carry.
  if (typeof inNote === "number" && inNote >= 0) {
    created.set("in_note", inNote);
  }
}

/**
 * The rack a chain belongs to.
 * @param chain - Chain or DrumChain LiveAPI object
 * @returns The rack device's Live API path
 */
function chainRackPath(chain: LiveAPI): string {
  return chain.path.replace(/ (?:return_)?chains \d+$/, "");
}

/**
 * The rack a copy should land in, once it's been checked as a place a chain of
 * this kind can go. A rack only accepts chains of its own kind — you can't put
 * an instrument in an effect rack — so a mismatch is refused rather than left
 * for Live to reject silently.
 * @param toPath - Destination rack path, or undefined for the source's own rack
 * @param sourceRack - The rack the source chain belongs to
 * @returns The destination rack
 * @throws Error when the path names no rack a chain of this kind can go in
 */
function resolveDestinationRack(
  toPath: string | undefined,
  sourceRack: LiveAPI,
): LiveAPI {
  if (toPath == null) {
    return sourceRack;
  }

  const object = rackAtPath(toPath);

  // A chain goes into a rack, so a toPath naming anything else — a track, a
  // chain, a plain device — has no chain slot to offer.
  if (object == null) {
    throw new Error(`no destination rack at toPath "${toPath}"`);
  }

  const destinationClass = object.getProperty("class_name") as string;
  const sourceClass = sourceRack.getProperty("class_name") as string;

  if (destinationClass !== sourceClass) {
    throw new Error(
      `cannot copy a chain from ${targetLabel(sourceRack)} (a ${sourceClass}) ` +
        `into "${toPath}" (a ${destinationClass}) — a rack only holds chains of its own kind`,
    );
  }

  return object;
}

/**
 * The rack a path names, including one nested inside a drum pad.
 *
 * Path resolution stops at the first pad segment and hands back the tail,
 * because Live indexes pads by note and only a live rack can resolve them —
 * so a nested rack ("…/pF1/d0") needs the drum-pad walker to finish the job.
 * @param toPath - The destination path as written
 * @returns The rack, or null when the path reaches something else
 */
function rackAtPath(toPath: string): LiveAPI | null {
  const {
    liveApiPath,
    targetType,
    drumPadNote,
    remainingSegments,
    namesNothing,
  } = resolvePathToLiveApi(canonicalPath(toPath));

  if (namesNothing != null) {
    throw new Error(nothingAtPath(toPath, namesNothing, "toPath"));
  }

  if (targetType === "drum-pad" && drumPadNote != null) {
    const resolved = resolveDrumPadFromPath(
      liveApiPath,
      drumPadNote,
      remainingSegments,
    );

    return resolved.targetType === "device" ? resolved.target : null;
  }

  if (targetType !== "device") {
    return null;
  }

  const object = LiveAPI.from(liveApiPath);

  return object.exists() ? object : null;
}

/**
 * Append an empty chain to a rack.
 * @param rack - The destination rack
 * @returns The new chain
 * @throws Error when Live made no chain
 */
function insertChain(rack: LiveAPI): LiveAPI {
  // insert_chain returns ["id", chainId] on success, or 1 on failure.
  const result = rack.call("insert_chain");

  invalidateRackChains(rack);

  if (!Array.isArray(result) || result[0] !== "id") {
    throw new Error(`could not create a chain in "${targetLabel(rack)}"`);
  }

  return LiveAPI.from(String(result[1]));
}

/**
 * Carry the source chain's devices into the copy, in order.
 *
 * One track duplication for the whole chain, not one per device: the workaround
 * copies the entire track, so doing it per device would copy the track N times.
 * Each move takes the temp chain's first device, because moving one out shifts
 * the rest down into its place.
 * @param chain - The source chain
 * @param created - The new chain the devices are going into
 * @throws Error when a device didn't make it across
 */
function copyChainDevices(chain: LiveAPI, created: LiveAPI): void {
  const deviceCount = chain.getChildCount("devices");

  if (deviceCount === 0) {
    return;
  }

  // Take the destination path now: the temp track shifts every later track
  // index, so a path read inside the copy would be one track off.
  const destinationChainPath = pathField(created).path;

  if (destinationChainPath == null) {
    throw new Error(
      "the new chain has no addressable path, so its devices were not copied",
    );
  }

  withTempTrackCopy(chain.path, "chain", ({ tempPath, sourceTrackIndex }) => {
    const adjusted = adjustTrackIndicesForTempTrack(
      destinationChainPath,
      sourceTrackIndex,
    );

    for (let index = 0; index < deviceCount; index++) {
      const tempDevice = LiveAPI.from(`${tempPath} devices 0`);
      const failed = `${pathPrefix(chain)}/d${index} could not be copied into the new chain`;

      // The source counted more devices than the temp copy holds, so there is
      // nothing left to move. The chain keeps its entry, short a device.
      if (!tempDevice.exists()) {
        throw new Error(`${failed}: it is not on the temp track`);
      }

      // Append: the destination slot is whatever index the chain is up to,
      // which keeps the copies in the source's order. No source device: the
      // chain's mixer went onto the copy already, and the only chain a move
      // could name here is the temp track's, which is about to be deleted.
      // Report the unshifted path and the real source device for the same
      // reason.
      const { outcome, reason } = moveDeviceToPath(
        tempDevice,
        `${adjusted}/d${index}`,
        null,
        `${destinationChainPath}/d${index}`,
        `${pathPrefix(chain)}/d${index}`,
      );

      if (outcome !== "moved") {
        throw new Error(reason == null ? failed : `${failed}: ${reason}`);
      }
    }
  });
}

/**
 * Say that macro mappings don't come along, but only when the source rack has
 * any — most racks don't, and an unconditional warning would be noise.
 * @param sourceRack - The rack the source chain belongs to
 */
function warnIfMacrosLeftBehind(sourceRack: LiveAPI): void {
  if (sourceRack.getProperty("has_macro_mappings") !== 1) {
    return;
  }

  console.warn(
    `the source rack ${targetLabel(sourceRack)} has macro mappings, and ` +
      "they do not come with a copied chain — re-map the copy's devices in Live " +
      "if you need them",
  );
}
