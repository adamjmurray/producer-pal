// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  resolveContainerWithAutoCreate,
  resolveOrCreateDrumPadChain,
} from "#src/tools/shared/device/helpers/device-chain-creation-helpers.ts";
import {
  requireDeviceContainer,
  trackSegmentPath,
} from "#src/tools/shared/validation/object-path-helpers.ts";
import {
  parseObjectPath,
  type DeviceSegment,
  type IndexedSegment,
  type TrackSegment,
} from "#src/tools/shared/validation/object-path.ts";
import { resolveDevicePath } from "./device-path-to-live-api.ts";

// Re-export all functions for backwards compatibility
export { extractDevicePath } from "./device-path-builders.ts";
export { buildChainPath } from "./device-path-builders.ts";
export { buildReturnChainPath } from "./device-path-builders.ts";
export { buildDrumPadPath } from "./device-path-builders.ts";
export { resolvePathToLiveApi } from "./device-path-to-live-api.ts";
export { resolveDrumPadFromPath } from "./device-drumpad-navigation.ts";

export interface InsertionPathResolution {
  container: LiveAPI | null;
  position: number | null;
}

/**
 * Resolve a path to a container (track or chain) for device insertion.
 * A path ending in a device index names that position; one ending in a
 * container (t, rt, mt, c, rc, p) appends.
 *
 * Examples:
 * - "t0" -> track 0, append
 * - "t0/d3" -> track 0, position 3
 * - "t0/d0/c0" -> chain 0 of device 0 on track 0, append
 * - "t0/d0/c0/d1" -> chain 0 of device 0 on track 0, position 1
 * - "t0/d0/pC1" -> drum pad C1 chain 0, append
 * - "rt0/d0" -> return track 0, device 0; "mt/d0" -> master track
 *
 * @param path - Device insertion path
 * @param label - Param name the path came from, for error messages
 * @returns Container and optional position
 */
export function resolveInsertionPath(
  path: string,
  label = "path",
): InsertionPathResolution {
  const { root, segments } = requireDeviceContainer(
    parseObjectPath(path, label),
    label,
  );
  const last = segments.at(-1);

  if (last?.kind === "device") {
    return {
      container: resolveContainer(root, segments.slice(0, -1), path),
      position: last.index,
    };
  }

  return { container: resolveContainer(root, segments, path), position: null };
}

// --- Helpers below main exports ---

/**
 * Resolve a container path (track or chain) to a LiveAPI object.
 * Auto-creates missing chains for regular racks. Throws for Drum Racks.
 * @param root - Parsed track root
 * @param segments - Device-chain segments below the root
 * @param path - Original path, for error messages
 * @returns LiveAPI object (Track or Chain)
 */
function resolveContainer(
  root: TrackSegment,
  segments: DeviceSegment[],
  path: string,
): LiveAPI | null {
  const indexed: IndexedSegment[] = [];

  for (const segment of segments) {
    // A drum pad resolves by MIDI note against a live rack, so the whole path
    // goes through the pad navigator rather than the chain walker.
    if (segment.kind === "drum-pad") {
      return resolveDrumPadContainer(root, segments);
    }

    indexed.push(segment);
  }

  if (indexed.length === 0) return LiveAPI.from(trackSegmentPath(root));

  return resolveContainerWithAutoCreate(root, indexed, path);
}

/**
 * Resolve a drum pad container path with auto-creation of missing chains
 * @param root - Parsed track root
 * @param segments - Device-chain segments, at least one of them a drum pad
 * @returns LiveAPI object (Chain)
 */
function resolveDrumPadContainer(
  root: TrackSegment,
  segments: DeviceSegment[],
): LiveAPI | null {
  const resolved = resolveDevicePath({ kind: "device", root, segments });
  const rack = LiveAPI.from(resolved.liveApiPath);

  return resolveOrCreateDrumPadChain(
    rack,
    // The path had a drum pad segment, so resolution stopped at one
    resolved.drumPadNote as string,
    resolved.remainingSegments,
  );
}
