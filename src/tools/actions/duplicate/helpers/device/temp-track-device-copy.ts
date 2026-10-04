// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type TargetNotes,
  noteTarget,
} from "#src/tools/shared/helpers/target-notes.ts";
import { calculateDefaultDestination } from "./default-device-destination.ts";
import { moveDeviceCopy, nameDeviceCopy } from "./device-copy-finish.ts";
import {
  adjustTrackIndicesForTempTrack,
  canonicalPath,
  withTempTrackCopy,
} from "./temp-track-copy.ts";
import { type DeviceCopy } from "./device-copy-entry.ts";

/**
 * Copy a device by duplicating the track that holds it, moving the copy off
 * it, and deleting the track. For when the remote script can't do it.
 *
 * Once the move has landed, the device exists: a name that won't take, or a
 * temp track that won't go, is on the notes rather than a throw.
 * @param device - LiveAPI device object to copy
 * @param toPath - Where the copy goes, or undefined for just after the original
 * @param name - Optional name for the copy
 * @param sourceLabel - The source, named for errors. Read before the temp
 *   track exists: it shifts every later track index.
 * @param notes - What the device's entry has to say, added to
 * @returns The copy's entry
 * @throws Error when no copy was made
 */
export function copyThroughTempTrack(
  device: LiveAPI,
  toPath: string | undefined,
  name: string | undefined,
  sourceLabel: string,
  notes: TargetNotes,
): DeviceCopy {
  return withTempTrackCopy(
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
      const created = moveDeviceCopy(
        tempDevice,
        adjustTrackIndicesForTempTrack(canonicalPath(destination), landing),
        device,
        destination,
        sourceLabel,
      );

      // Read the device's id before the temp track goes away.
      const copied: DeviceCopy = {
        id: tempDevice.id,
        ...(created == null ? {} : { created }),
      };

      nameDeviceCopy(tempDevice, name, notes);

      return copied;
    },
    (note) => noteTarget(notes, `the device was copied, but ${note}`),
  );
}
