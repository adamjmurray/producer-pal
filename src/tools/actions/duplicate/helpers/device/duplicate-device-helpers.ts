// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { assertDefined } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { moveDeviceToPath } from "#src/tools/device/update/helpers/update-device-helpers.ts";
import { extractDevicePath } from "#src/tools/shared/device/helpers/path/device-path-helpers.ts";
import { isProducerPalDevice } from "#src/tools/shared/device/is-producer-pal-device.ts";
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
import {
  pathField,
  targetLabel,
} from "#src/tools/shared/validation/object-path-for-api.ts";
import { pathEntries } from "#src/tools/shared/validation/object-path-helpers.ts";

/**
 * Duplicates a device to one or more destination paths.
 * Supports comma-separated toPath for multiple destinations.
 * @param object - LiveAPI device object
 * @param toPath - Destination path(s), comma-separated for multiple
 * @param labels - The call's names and colors
 * @param count - Number of copies (warns if > 1)
 * @returns Result object, or an array of them for multiple destinations
 */
export function duplicateDeviceWithPaths(
  object: LiveAPI,
  toPath: string | undefined,
  labels: CopyLabels,
  count: number,
): object | object[] {
  // Reads a blank toPath as omitted the way clips do, and refuses one that
  // names nothing rather than quietly falling back to the default destination.
  const paths = pathEntries(toPath, "toPath");

  claimLabels(labels, Math.max(paths.length, 1));

  if (paths.length <= 1) {
    // A lone copy that was skipped has nothing to report but its warning.
    return (
      withDevicePath(
        duplicateDevice(object, paths[0], labelName(labels, 0), count),
      ) ?? []
    );
  }

  // Read the source fresh per destination. A LiveAPI object follows its path,
  // and an earlier copy inserted at or before the source's own index shifts it
  // up — so reusing this one would duplicate whatever moved into its place.
  // Take the id before anything moves; after the first copy the path is stale.
  const sourceId = object.id;

  // Always an array here: one object back from a two-destination call would
  // read as a one-destination call that worked.
  return paths
    .map((path, i) =>
      withDevicePath(
        duplicateDevice(LiveAPI.from(sourceId), path, labelName(labels, i), 1),
      ),
    )
    .filter((result) => result != null);
}

/**
 * Name the copy by where it ended up. Read after duplicateDevice returns, not
 * inside it: the temp track it works through shifts every later track index,
 * so a path read before the cleanup is one track off.
 * @param result - The copy's id, or null when the copy was skipped
 * @returns The result with its path, or null
 */
function withDevicePath(
  result: { id: string } | null,
): { id: string; path?: string } | null {
  if (result == null) return null;

  return { id: result.id, ...pathField(LiveAPI.from(result.id)) };
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
 * @param count - Number of duplicates (only 1 supported, warns if > 1)
 * @returns The new device, or null when the copy was skipped
 */
function duplicateDevice(
  device: LiveAPI,
  toPath: string | undefined,
  name: string | undefined,
  count = 1,
): { id: string } | null {
  if (count > 1) {
    console.warn(
      "count parameter ignored for device duplication (only single copy supported)",
    );
  }

  // A copy would be a second Producer Pal device fighting the first for the
  // same connection — and the track-duplication workaround below spawns one
  // before it ever reaches the destination.
  if (isProducerPalDevice(device)) {
    console.warn(
      "duplicate: cannot duplicate the Producer Pal device, skipping",
    );

    return null;
  }

  // Read before the temp track exists: it shifts every later track index, so a
  // path read inside the copy would name the wrong track.
  const sourceLabel = targetLabel(device);

  return withTempTrackCopy(
    device.path,
    "device",
    ({ tempPath, sourceTrackIndex }) => {
      const tempDevice = LiveAPI.from(tempPath);

      if (!tempDevice.exists()) {
        throw new Error(
          `duplicate failed: device not found in duplicated track at path "${tempPath}"`,
        );
      }

      const destination = toPath ?? calculateDefaultDestination(device.path);

      // Canonicalize before shifting: the adjuster only knows the "t<n>"
      // spelling, so a bare "2" went through unshifted and the copy landed a
      // track short.
      const adjustedDestination = adjustTrackIndicesForTempTrack(
        canonicalPath(destination),
        sourceTrackIndex,
      );

      // Skip rather than throw, so the other destinations of a comma-separated
      // toPath still get their copies. Name the caller's toPath, not the adjusted
      // one — the temp track shifted its track index. Either way nothing
      // survives: the copy is still on the temp track, which the cleanup deletes.
      const outcome = moveDeviceToPath(
        tempDevice,
        adjustedDestination,
        device,
        destination,
      );

      if (outcome === "no-destination") {
        console.warn(
          `duplicate: ${sourceLabel} not copied — no destination at toPath "${destination}"`,
        );

        return null;
      }

      if (outcome === "refused") {
        console.warn(
          `duplicate: the copy of ${sourceLabel} could not be moved to "${destination}"`,
        );

        return null;
      }

      // A path that didn't resolve at all already warned why, naming this path.
      if (outcome === "unresolvable") {
        return null;
      }

      if (name) {
        tempDevice.set("name", name);
      }

      // Read the device's id before the temp track goes away.
      return { id: tempDevice.id };
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
