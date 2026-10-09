// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { errorMessage } from "#src/shared/error-message.ts";
import { LIVE_API_DEVICE_TYPE_INSTRUMENT } from "#src/tools/constants.ts";
import { deleteDeviceObject } from "#src/tools/actions/delete/helpers/delete-object-by-type.ts";
import { getDeviceInsertionPoint } from "#src/tools/device/update/helpers/wrap/wrapped-rack.ts";
import {
  extractDevicePath,
  peekInsertionContainerPath,
} from "#src/tools/shared/device/helpers/path/insertion-path.ts";
import { joinDetails } from "#src/tools/shared/helpers/entry-details.ts";
import {
  type TargetNotes,
  noteTarget,
} from "#src/tools/shared/helpers/target-notes.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";
import { calculateDefaultDestination } from "../default-device-destination.ts";
import { type DeviceCopy } from "../device-copy-entry.ts";
import { moveDeviceCopy, nameDeviceCopy } from "../device-copy-finish.ts";
import {
  type DeviceIdentity,
  identityOf,
  isCopyOf,
} from "./device-copy-identity.ts";
import { duplicateOnRemoteScript } from "./remote-device-duplicate.ts";
import { canonicalPath } from "../temp-track-copy.ts";

/** Where a device sits, and where its copy is to end up. */
interface InPlaceTarget {
  /** The track or chain holding the device */
  container: LiveAPI;
  /** The device's index in it */
  index: number;
  /** Where to move the copy afterwards; none when Live's own spot will do */
  moveTo?: string;
}

/**
 * Copy a device with Live's own duplicate_device, through the remote script.
 * Live puts the copy right after the original, so it is moved on from there
 * when the caller wants it elsewhere.
 *
 * Gives up, touching nothing, when this isn't the way to copy it: no remote
 * script, an instrument (Live refuses those), or a destination in the
 * original's own container, where an index could mean two things.
 *
 * Nothing is moved or deleted until the device at the copy's place is checked
 * to be a copy of the original. A copy the move can't place is deleted again,
 * so a failed call leaves no stray beside the original.
 * @param device - LiveAPI device object to copy
 * @param toPath - Where the copy goes, or undefined for just after the original
 * @param name - Optional name for the copy
 * @param sourceLabel - The source, named for errors
 * @param notes - What the device's entry has to say, added to
 * @param deadline - The request deadline from ToolContext
 * @returns The copy's entry, or null when the temp-track route has to do it
 * @throws Error when no copy was made, one was made and could not be placed,
 *   or a copy can't be told from what is there
 */
export async function copyDeviceInPlace(
  device: LiveAPI,
  toPath: string | undefined,
  name: string | undefined,
  sourceLabel: string,
  notes: TargetNotes,
  deadline?: number | null,
): Promise<DeviceCopy | null> {
  const target = inPlaceTarget(device, toPath);

  if (target == null) {
    return null;
  }

  const { container } = target;
  const spot = target.index + 1;
  const original = identityOf(device);
  const countBefore = container.getChildIds("devices").length;
  const answer = await duplicateOnRemoteScript(
    { path: device.path, name: original.name },
    deadline,
  );

  if (answer.kind === "unavailable") {
    return null;
  }

  if (answer.kind === "failed") {
    if (!answer.unfinished) {
      throw new Error(`${sourceLabel} not copied — ${answer.reason}`);
    }

    // An answer that never came may still have been acted on.
    if (container.getChildIds("devices").length !== countBefore + 1) {
      throw new Error(
        `${sourceLabel} not copied — ${answer.reason}; Live may have copied it anyway, to ${where(container, spot)}, so check before re-running`,
      );
    }
  } else if (answer.index !== spot) {
    throw new Error(
      `${sourceLabel} was copied, but to ${where(container, answer.index)}, not ${where(container, spot)}; nothing was moved or deleted, so check before re-running`,
    );
  }

  const copy = container.child("devices", String(spot));

  if (!isCopyOf(copy, original)) {
    const why = answer.kind === "failed" ? ` (${answer.reason})` : "";

    throw new Error(
      `${sourceLabel} may have been copied${why}, but the device at ${where(container, spot)} isn't a copy of it; nothing was moved or deleted, so check before re-running`,
    );
  }

  if (answer.kind === "failed") {
    noteTarget(
      notes,
      `the device was copied, but the remote script's answer was: ${answer.reason}`,
    );
  }

  let created: string | undefined;

  if (target.moveTo != null) {
    try {
      created = moveDeviceCopy(
        copy,
        target.moveTo,
        device,
        toPath as string,
        sourceLabel,
      );
    } catch (error) {
      throw withStrayCopyDeleted(error, copy.id, original);
    }
  }

  nameDeviceCopy(copy, name, notes);

  return { id: copy.id, ...(created == null ? {} : { created }) };
}

// --- Helpers below main export ---

/**
 * Where a device's copy goes, or null when this route can't be used.
 * @param device - The device to copy
 * @param toPath - The caller's destination, or undefined for the default
 * @returns The target, or null
 */
function inPlaceTarget(
  device: LiveAPI,
  toPath: string | undefined,
): InPlaceTarget | null {
  if (device.getProperty("type") === LIVE_API_DEVICE_TYPE_INSTRUMENT) {
    return null;
  }

  const { container, position } = getDeviceInsertionPoint(device);
  const target = { container, index: position };
  const justAfter = calculateDefaultDestination(device.path);
  const destination = toPath == null ? justAfter : canonicalPath(toPath);

  if (destination === justAfter) {
    return target;
  }

  // An index into the container the copy already sits in could count the
  // original, the copy, or neither, and a path through one of its racks shifts
  // when the copy goes in. The temp-track route has neither problem. Compared
  // by Live path: `c2` and `pC1` name one drum chain.
  const reaches = peekInsertionContainerPath(destination, "toPath");

  return reaches == null ||
    reaches === container.path ||
    reaches.startsWith(`${container.path} `)
    ? null
    : { ...target, moveTo: destination };
}

/**
 * Name a device slot the way the caller reads paths.
 * @param container - The track or chain holding it
 * @param index - The slot's index
 * @returns The slot's path, e.g. "t0/d2"
 */
function where(container: LiveAPI, index: number): string {
  const slot = container.child("devices", String(index)).path;

  return extractDevicePath(slot) ?? slot;
}

/**
 * Delete a copy that could not be placed, wherever it is now, once it is
 * checked to still be that copy.
 * @param error - Why the copy could not be placed
 * @param copyId - The copy's id
 * @param original - What the copy looked like when it was found
 * @returns The error to throw: the original, or one that also says where the
 *   copy is left when it can't be deleted
 */
function withStrayCopyDeleted(
  error: unknown,
  copyId: string,
  original: DeviceIdentity,
): unknown {
  const copy = LiveAPI.from(copyId);
  let left: string | null;

  try {
    left = isCopyOf(copy, original)
      ? deleteDeviceObject(copyId, copy)
      : "it no longer looks like the copy";
  } catch (deleteError) {
    left = errorMessage(deleteError);
  }

  if (left == null) {
    return error;
  }

  return new Error(
    joinDetails([
      errorMessage(error),
      `the copy may be left at ${copy.exists() ? targetLabel(copy) : "an unknown place"}: it wasn't deleted (${left})`,
    ]),
    { cause: error },
  );
}
