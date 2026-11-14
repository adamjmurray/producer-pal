// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type DryWalk } from "#src/tools/shared/device/helpers/chain-auto-creation.ts";
import {
  type DeviceKind,
  newChainMisfitReason,
} from "#src/tools/shared/device/helpers/path/device-fit.ts";
import {
  checkInsertionPath,
  pastTheEndReason,
} from "#src/tools/shared/device/helpers/path/insertion-path.ts";
import { nestedRackHintForPath } from "#src/tools/shared/device/helpers/path/nested-rack-hint.ts";
import { requireDeviceContainer } from "#src/tools/shared/validation/helpers/object-paths.ts";
import { pathPrefix } from "#src/tools/shared/validation/object-path-for-api.ts";
import { parseObjectPath } from "#src/tools/shared/validation/object-path.ts";
import { refuseIndexInNewChain } from "./index-in-new-chain.ts";

/**
 * Refuse a create path that can't take the device, before anything is made.
 * Resolving the path makes missing rack chains, and a refusal after that would
 * leave them behind, so this asks first without making any. It gives the
 * refusals resolving and inserting would, in the same words. Left to the
 * write: a second instrument in a chain (only Live shows it), and chains a drum
 * pad would make. A path that is only a slot on a track makes no chain, so it
 * isn't walked: resolving it refuses what it can.
 * @param path - Device insertion path, as the call wrote it
 * @param deviceName - The device, as the call named it
 * @param kind - The device's kind, or null when it isn't known yet
 * @throws Error when the path names no place that takes the device
 */
export function checkCreationPath(
  path: string,
  deviceName: string,
  kind: DeviceKind | null,
): void {
  if (namesOnlyASlot(path)) {
    return;
  }

  // A pad's chains aren't read: a kit is built a pad per path, and each read
  // scans the whole rack. refuseIndexInNewChain covers what leaks from a pad.
  const check = checkInsertionPath(path, "path", true);

  if (check.namesNothing != null) {
    throw new Error(namesNoDeviceReason(path, check.namesNothing));
  }

  if (check.undetermined) {
    // Only a pad's write can say whether its chain gets made, but a slot past
    // the end of one that would be is refused all the same.
    refuseIndexInNewChain(path);

    return;
  }

  const { container, position } = check;

  // A chain the path would make holds nothing, and takes what its rack takes.
  const reason = check.makesChain
    ? (pastTheEndReason(position, 0, path) ??
      newChainMisfit(deviceName, kind, check.newChain))
    : existingContainerReason(path, container, position);

  if (reason != null) {
    throw new Error(reason);
  }
}

/**
 * Why a path names no device to insert at.
 * @param path - The path as the call wrote it
 * @param namesNothing - What the container does hold
 * @returns The reason
 */
export function namesNoDeviceReason(
  path: string,
  namesNothing: string,
): string {
  return `path "${path}" names no device to insert at: ${namesNothing}`;
}

/**
 * Why a path's container isn't there.
 * @param path - The path as the call wrote it
 * @returns The reason
 */
export function missingContainerReason(path: string): string {
  return `container at path "${path}" does not exist${nestedRackHintForPath(path)}`;
}

// --- Helpers below main exports ---

// Why a container already in the Set won't take the device, or null.
function existingContainerReason(
  path: string,
  container: LiveAPI | null,
  position: number | null,
): string | null {
  if (!container?.exists()) {
    return missingContainerReason(path);
  }

  return pastTheEndReason(position, container.getChildCount("devices"), path);
}

// Whether a path is only a slot on a track (`t0`, `t0/d+`, `t0/d3`,
// `t0/inst`), which makes no chain on the way.
function namesOnlyASlot(path: string): boolean {
  const { segments, appendsChain, appendsDevice } = requireDeviceContainer(
    parseObjectPath(path, "path"),
    "path",
  );
  const [only] = segments;

  return (
    appendsChain !== true &&
    (appendsDevice === true
      ? segments.length === 0
      : only == null ||
        (segments.length === 1 &&
          (only.kind === "device" || only.kind === "device-by-type")))
  );
}

// Why a chain not yet made won't take the device, when its rack won't.
function newChainMisfit(
  deviceName: string,
  kind: DeviceKind | null,
  newChain: DryWalk["newChain"],
): string | null {
  return newChain == null || kind == null
    ? null
    : newChainMisfitReason(
        deviceName,
        kind,
        newChain.rack,
        `${pathPrefix(newChain.rack)}/c${newChain.index}`,
      );
}
