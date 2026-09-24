// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { assertDefined } from "#src/shared/error-message.ts";
import { moveDeviceToPath } from "#src/tools/device/update/helpers/move-device.ts";
import {
  extractDevicePath,
  insertionContainerPath,
} from "#src/tools/shared/device/helpers/path/insertion-path.ts";
import { isProducerPalDevice } from "#src/tools/shared/device/is-producer-pal-device.ts";
import { type CopyLabels } from "../sources/copy-labels.ts";
import {
  adjustTrackIndicesForTempTrack,
  canonicalPath,
  withTempTrackCopy,
} from "./temp-track-copy.ts";
import {
  pathField,
  targetLabel,
} from "#src/tools/shared/validation/object-path-for-api.ts";
import { type NamedTarget } from "#src/tools/shared/validation/lists/named-targets.ts";
import { copyToDestinations } from "./copy-per-destination.ts";

/** A finished device copy: what it is, where it was sent, and what it landed in. */
interface DeviceCopy {
  id: string;
  destination: string;
  /** The container the move reported; absent when Live never confirmed one. */
  containerId?: string;
}

/**
 * Duplicates a device to one or more destination paths, one entry per
 * destination. Supports comma-separated toPath for multiple destinations.
 * @param object - LiveAPI device object
 * @param toPath - Destination path(s), comma-separated for multiple
 * @param source - The source device, as the caller named it
 * @param labels - The call's names and colors
 * @param count - Number of copies (warns if > 1)
 * @returns One entry per destination, in the order toPath named them
 */
export function duplicateDeviceWithPaths(
  object: LiveAPI,
  toPath: string | undefined,
  source: NamedTarget,
  labels: CopyLabels,
  count: number,
): object[] {
  return copyToDestinations(
    object,
    toPath,
    source,
    labels,
    count,
    "device",
    (device, destination, name) =>
      withDevicePath(duplicateDevice(device, destination, name)),
  );
}

/**
 * Name the copy by where it ended up. Read after duplicateDevice returns, not
 * inside it: the temp track it works through shifts every later track index,
 * so a path or a container read before the cleanup is one track off — which is
 * why the container is rebuilt here from the id the move reported, and lazily,
 * since nothing but a drum-pad spelling looks at it.
 * @param result - The copy's id, destination and landing container
 * @returns The result with its path
 */
function withDevicePath(result: DeviceCopy): { id: string; path?: string } {
  const { destination, containerId } = result;

  return {
    id: result.id,
    ...pathField(
      LiveAPI.from(result.id),
      containerId == null
        ? undefined
        : {
            container: () => LiveAPI.from(`id ${containerId}`),
            path: insertionContainerPath(destination, "toPath"),
          },
    ),
  };
}

/**
 * Duplicate a device using the track duplication workaround.
 * Since Ableton Live has no native duplicate_device API, we:
 * 1. Duplicate the track containing the device
 * 2. Move the duplicated device to the destination
 * 3. Delete the temporary track
 *
 * @param device - LiveAPI device object to duplicate
 * @param toPath - Destination path (e.g., "t1/d0", "t0/d0/c0/d1")
 * @param name - Optional name for the duplicated device
 * @returns The new device and where it was sent
 * @throws Error when no copy was made
 */
function duplicateDevice(
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
      const adjustedDestination = adjustTrackIndicesForTempTrack(
        canonicalPath(destination),
        landing,
      );

      // Name the caller's toPath and the real source, not the adjusted path and
      // the temp copy — the temp track shifted its track index, and the cleanup
      // deletes it. Nothing survives a failure either way: the copy is still on
      // the temp track.
      // Live confirms the device is in this container before the move reports
      // "moved", which is what makes the destination safe to name it by.
      const { outcome, container, reason } = moveDeviceToPath(
        tempDevice,
        adjustedDestination,
        device,
        destination,
      );

      if (outcome === "no-destination") {
        throw new Error(
          `${sourceLabel} not copied — no destination at toPath "${destination}"`,
        );
      }

      if (outcome === "refused") {
        const refusal = `the copy of ${sourceLabel} could not be moved to "${destination}"`;

        throw new Error(reason == null ? refusal : `${refusal}: ${reason}`);
      }

      if (outcome === "unresolvable") {
        throw new Error(`${sourceLabel} not copied — ${reason}`);
      }

      if (name) {
        tempDevice.set("name", name);
      }

      // Read the device's id before the temp track goes away.
      return { id: tempDevice.id, destination, containerId: container?.id };
    },
  );
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
