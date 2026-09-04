// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Copying a rack chain. Live has copy_pad for drum pads but nothing for a rack
// layer, so this builds one: insert_chain for the chain, then the temp-track
// workaround to carry its devices across. Cross-rack is in scope — a device
// move already crosses racks freely.

import * as console from "#src/shared/max/v8-max-console.ts";
import { moveDeviceToPath } from "#src/tools/device/update/helpers/update-device-helpers.ts";
import { readChainMixer } from "#src/tools/shared/device/helpers/chain-mixer-helpers.ts";
import {
  resolveDrumPadFromPath,
  resolvePathToLiveApi,
} from "#src/tools/shared/device/helpers/path/device-path-helpers.ts";
import {
  pathField,
  pathPrefix,
  targetLabel,
} from "#src/tools/shared/validation/object-path-for-api.ts";
import { pathEntries } from "#src/tools/shared/validation/helpers/object-path-helpers.ts";
import {
  claimLabels,
  labelName,
  type CopyLabels,
} from "../sources/duplicate-label-helpers.ts";
import {
  adjustTrackIndicesForTempTrack,
  canonicalPath,
  withTempTrackCopy,
} from "./duplicate-temp-track-helpers.ts";
import { copyChainMixerTo } from "./duplicate-chain-mixer-helpers.ts";

/**
 * Copy one chain to each destination rack a comma-separated toPath names.
 * @param chain - LiveAPI chain object to copy
 * @param toPath - Destination rack path(s), or omitted to append to its own rack
 * @param labels - The call's names and colors
 * @param count - Number of copies (warns if > 1)
 * @returns Result object, or an array of them for multiple destinations
 */
export function duplicateChainWithPaths(
  chain: LiveAPI,
  toPath: string | undefined,
  labels: CopyLabels,
  count: number,
): object | object[] {
  const paths = pathEntries(toPath, "toPath");

  claimLabels(labels, Math.max(paths.length, 1));

  if (count > 1) {
    console.warn(
      "count parameter ignored for chain duplication (only single copy supported)",
    );
  }

  if (paths.length <= 1) {
    return duplicateChain(chain, paths[0], labelName(labels, 0)) ?? [];
  }

  // Read the source fresh per destination: a copy into the source's own rack
  // shifts nothing above it, but a LiveAPI object follows its path, and taking
  // the id first is what survives either way.
  const sourceId = chain.id;

  return paths
    .map((path, i) =>
      duplicateChain(LiveAPI.from(sourceId), path, labelName(labels, i)),
    )
    .filter((result) => result != null);
}

/**
 * Copy a chain into a rack: a new chain, its mixer and flags, then its devices.
 * @param chain - The source chain
 * @param toPath - Destination rack path, or undefined for the source's own rack
 * @param name - Name for the copy, or undefined to keep the source's
 * @returns The new chain's id and path, or null when the copy was skipped
 */
function duplicateChain(
  chain: LiveAPI,
  toPath: string | undefined,
  name: string | undefined,
): { id: string; path?: string } | null {
  // A return chain lives under `return_chains`, and no rack exposes a way to
  // make one — insert_chain only ever appends a regular chain. Say so rather
  // than quietly producing a normal chain the caller didn't ask for.
  if (/ return_chains \d+$/.test(chain.path)) {
    console.warn(
      `${targetLabel(chain)} is a rack return chain, which cannot be ` +
        "copied — the Live API has no way to create one, so they can only be " +
        "added in Live",
    );

    return null;
  }

  const sourceRack = LiveAPI.from(chainRackPath(chain));
  const destinationRack = resolveDestinationRack(toPath, sourceRack);

  if (destinationRack == null) return null;

  const created = insertChain(destinationRack);

  if (created == null) return null;

  created.set("name", name ?? chain.getProperty("name"));

  const color = chain.getColor();

  if (color) created.setColor(color);

  for (const flag of ["mute", "solo"] as const) {
    const value = chain.getProperty(flag);

    if (value === 1) created.set(flag, 1);
  }

  carryDrumPadNote(chain, created);
  copyChainMixerTo(created, readChainMixer(chain), sourceRack, destinationRack);
  copyChainDevices(chain, created);
  warnIfMacrosLeftBehind(sourceRack);

  return { id: created.id, ...pathField(created) };
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
  if (chain.type !== "DrumChain" || created.type !== "DrumChain") return;

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
 * @returns The destination rack, or null once the refusal has been warned
 */
function resolveDestinationRack(
  toPath: string | undefined,
  sourceRack: LiveAPI,
): LiveAPI | null {
  if (toPath == null) return sourceRack;

  const object = rackAtPath(toPath);

  // A chain goes into a rack, so a toPath naming anything else — a track, a
  // chain, a plain device — has no chain slot to offer.
  if (object == null) {
    console.warn(`no destination rack at toPath "${toPath}"`);

    return null;
  }

  const destinationClass = object.getProperty("class_name") as string;
  const sourceClass = sourceRack.getProperty("class_name") as string;

  if (destinationClass !== sourceClass) {
    console.warn(
      `cannot copy a chain from ${targetLabel(sourceRack)} (a ${sourceClass}) ` +
        `into "${toPath}" (a ${destinationClass}) — a rack only holds chains of its own kind`,
    );

    return null;
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
  const { liveApiPath, targetType, drumPadNote, remainingSegments } =
    resolvePathToLiveApi(canonicalPath(toPath));

  if (targetType === "drum-pad" && drumPadNote != null) {
    const resolved = resolveDrumPadFromPath(
      liveApiPath,
      drumPadNote,
      remainingSegments,
    );

    return resolved.targetType === "device" ? resolved.target : null;
  }

  if (targetType !== "device") return null;

  const object = LiveAPI.from(liveApiPath);

  return object.exists() ? object : null;
}

/**
 * Append an empty chain to a rack.
 * @param rack - The destination rack
 * @returns The new chain, or null once the failure has been warned
 */
function insertChain(rack: LiveAPI): LiveAPI | null {
  // insert_chain returns ["id", chainId] on success, or 1 on failure.
  const result = rack.call("insert_chain");

  if (!Array.isArray(result) || result[0] !== "id") {
    console.warn(
      `could not create a chain in "${targetLabel(rack)}", skipping`,
    );

    return null;
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
 */
function copyChainDevices(chain: LiveAPI, created: LiveAPI): void {
  const deviceCount = chain.getChildCount("devices");

  if (deviceCount === 0) return;

  // Take the destination path now: the temp track shifts every later track
  // index, so a path read inside the copy would be one track off.
  const destinationChainPath = pathField(created).path;

  if (destinationChainPath == null) {
    console.warn(
      "the new chain has no addressable path, so its devices were " +
        "not copied",
    );

    return;
  }

  withTempTrackCopy(chain.path, "chain", ({ tempPath, sourceTrackIndex }) => {
    const adjusted = adjustTrackIndicesForTempTrack(
      destinationChainPath,
      sourceTrackIndex,
    );

    for (let index = 0; index < deviceCount; index++) {
      const source = LiveAPI.from(`${tempPath} devices 0`);

      if (!source.exists()) break;

      // Append: the destination slot is whatever index the chain is up to,
      // which keeps the copies in the source's order.
      const outcome = moveDeviceToPath(source, `${adjusted}/d${index}`, source);

      if (outcome !== "moved") {
        console.warn(
          `${pathPrefix(chain)}/d${index} could not be copied into the new chain`,
        );

        break;
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
  if (sourceRack.getProperty("has_macro_mappings") !== 1) return;

  console.warn(
    `the source rack ${targetLabel(sourceRack)} has macro mappings, and ` +
      "they do not come with a copied chain — re-map the copy's devices in Live " +
      "if you need them",
  );
}
