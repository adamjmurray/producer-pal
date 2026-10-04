// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { assertDefined, errorMessage } from "#src/shared/error-message.ts";
import { moveDeviceToPath } from "#src/tools/device/update/helpers/move-device.ts";
import { withChainsLeft } from "#src/tools/shared/device/helpers/path/chains-left.ts";
import { extractDevicePath } from "#src/tools/shared/device/helpers/path/insertion-path.ts";
import { isProducerPalDevice } from "#src/tools/shared/device/is-producer-pal-device.ts";
import { joinDetails } from "#src/tools/shared/helpers/entry-details.ts";
import {
  newTargetNotes,
  noteTarget,
} from "#src/tools/shared/helpers/target-notes.ts";
import {
  adjustTrackIndicesForTempTrack,
  canonicalPath,
  withTempTrackCopy,
} from "./temp-track-copy.ts";
import {
  pathField,
  targetLabel,
} from "#src/tools/shared/validation/object-path-for-api.ts";

/** A device copy's entry. Its path is added by settleDevicePaths. */
export interface DeviceCopy {
  id: string;
  path?: string;
  /** The rack chains the destination had to make first ("c2-c3") */
  created?: string;
  /** What didn't finish after the device was copied, when something didn't */
  detail?: string;
}

/**
 * Name each copy by where it sits once every copy is made: a later copy
 * inserted ahead of an earlier one pushes it along, and the temp track a copy
 * works through shifts every later track index until it is deleted.
 * @param entries - The call's device entries, copies updated in place
 */
export function settleDevicePaths(entries: DeviceCopy[]): void {
  for (const entry of entries) {
    Object.assign(entry, pathField(LiveAPI.from(entry.id)));
  }
}

/**
 * Duplicate a device using the track duplication workaround.
 * Since Ableton Live has no native duplicate_device API, we:
 * 1. Duplicate the track containing the device
 * 2. Move the duplicated device to the destination
 * 3. Delete the temporary track
 *
 * Once the move has landed, the device exists: a name that won't take, or a
 * temp track that won't go, is on its entry rather than a throw.
 * @param device - LiveAPI device object to duplicate
 * @param toPath - Destination path (e.g., "t1/d0", "t0/d0/c0/d1")
 * @param name - Optional name for the duplicated device
 * @returns The new device's id
 * @throws Error when no copy was made
 */
export function duplicateDevice(
  device: LiveAPI,
  toPath: string | undefined,
  name: string | undefined,
): DeviceCopy {
  // A copy would be a second Producer Pal device fighting the first for the
  // same connection — and the track-duplication workaround below spawns one
  // before it ever reaches the destination.
  if (isProducerPalDevice(device)) {
    throw new Error(
      `cannot duplicate the Producer Pal device ${targetLabel(device)}`,
    );
  }

  // Read before the temp track exists: it shifts every later track index, so a
  // path read inside the copy would name the wrong track.
  const sourceLabel = targetLabel(device);
  const notes = newTargetNotes();
  const copy = withTempTrackCopy(
    device.path,
    "device",
    ({ tempPath, ...landing }) => {
      const tempDevice = LiveAPI.from(tempPath);

      if (!tempDevice.exists()) {
        throw new Error(
          `device not found in duplicated track at path "${tempPath}"`,
        );
      }

      const destination = toPath ?? calculateDefaultDestination(device.path);

      // Canonicalize before shifting: the adjuster only knows the "t<n>"
      // spelling, so a bare "2" went through unshifted and the copy landed a
      // track short.
      const adjustedDestination = adjustTrackIndicesForTempTrack(
        canonicalPath(destination),
        landing,
      );

      // Name the caller's toPath and the real source, not the adjusted path and
      // the temp copy — the temp track shifted its track index, and the cleanup
      // deletes it. Nothing survives a failure either way: the copy is still on
      // the temp track.
      const { outcome, reason, created, madeChains } = moveDeviceToPath(
        tempDevice,
        adjustedDestination,
        device,
        destination,
      );

      if (outcome === "no-destination") {
        throw new Error(
          withChainsLeft(
            `${sourceLabel} not copied — no destination at toPath "${destination}"`,
            madeChains,
          ),
        );
      }

      if (outcome === "refused") {
        const refusal = `the copy of ${sourceLabel} could not be moved to "${destination}"`;

        throw new Error(
          withChainsLeft(
            reason == null ? refusal : `${refusal}: ${reason}`,
            madeChains,
          ),
        );
      }

      if (outcome === "unresolvable") {
        throw new Error(`${sourceLabel} not copied — ${reason}`);
      }

      // Read the device's id before the temp track goes away.
      const copied: DeviceCopy = {
        id: tempDevice.id,
        ...(created == null ? {} : { created }),
      };

      if (name) {
        try {
          tempDevice.set("name", name);
        } catch (error) {
          noteTarget(
            notes,
            `the device was copied, but naming it failed: ${errorMessage(error)}`,
          );
        }
      }

      return copied;
    },
    (note) => noteTarget(notes, `the device was copied, but ${note}`),
  );
  const detail = joinDetails(notes.said);

  return detail == null ? copy : { ...copy, detail };
}

/**
 * Calculate the default destination: position after the original device on the same track
 * @param devicePath - Full Live API path of the source device
 * @returns Simplified path for destination
 */
function calculateDefaultDestination(devicePath: string): string {
  // Never null here: extractRegularTrackIndex already matched the same
  // "live_set tracks N" prefix extractDevicePath needs.
  const simplifiedPath = assertDefined(
    extractDevicePath(devicePath),
    `device path for "${devicePath}"`,
  );

  // Parse the path to increment the last device index
  const segments = simplifiedPath.split("/");
  const lastSegment = segments.at(-1);

  if (lastSegment?.startsWith("d")) {
    const deviceIndex = Number.parseInt(lastSegment.slice(1));

    segments[segments.length - 1] = `d${deviceIndex + 1}`;

    return segments.join("/");
  }

  // Fallback: append to the container
  return simplifiedPath;
}
