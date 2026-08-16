// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { assertDefined } from "#src/shared/error-utils.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  resolveContainerWithAutoCreate,
  resolveOrCreateDrumPadChain,
} from "#src/tools/shared/device/helpers/device-chain-creation-helpers.ts";
import { parseTrackSegment } from "#src/tools/shared/validation/destination-path.ts";
import { resolvePathToLiveApi } from "./device-path-to-live-api.ts";

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
 * Resolve a track segment to a LiveAPI track object
 * @param segment - Track segment (e.g., "t0", "rt0", "mt")
 * @param label - Param name for error messages
 * @returns LiveAPI track object
 */
function resolveTrack(segment: string, label: string): LiveAPI {
  const track = parseTrackSegment(segment, label);

  if (track.kind === "master-track") {
    return LiveAPI.from(livePath.masterTrack());
  }

  if (track.kind === "return-track") {
    return LiveAPI.from(livePath.returnTrack(track.returnIndex));
  }

  return LiveAPI.from(livePath.track(track.trackIndex));
}

/**
 * Resolve a drum pad container path with auto-creation of missing chains
 * @param path - Path containing drum pad notation
 * @returns LiveAPI object (Chain)
 */
function resolveDrumPadContainer(path: string): LiveAPI | null {
  const resolved = resolvePathToLiveApi(path);

  if (resolved.targetType !== "drum-pad") {
    return LiveAPI.from(resolved.liveApiPath);
  }

  // drumPadNote is guaranteed for drum-pad targetType
  const drumPadNote = resolved.drumPadNote as string;
  const rack = LiveAPI.from(resolved.liveApiPath);

  return resolveOrCreateDrumPadChain(
    rack,
    drumPadNote,
    resolved.remainingSegments,
  );
}

/**
 * Resolve a container path (track or chain) to a LiveAPI object.
 * Auto-creates missing chains for regular racks. Throws for Drum Racks.
 * @param path - Container path (e.g., "0", "0/0/0", "0/0/pC1")
 * @param label - Param name for error messages
 * @returns LiveAPI object (Track or Chain)
 */
function resolveContainer(path: string, label: string): LiveAPI | null {
  const segments = path.split("/");

  if (segments.length === 1)
    return resolveTrack(assertDefined(segments[0], "track segment"), label);
  if (segments.some((s) => s.startsWith("p")))
    return resolveDrumPadContainer(path);

  return resolveContainerWithAutoCreate(segments, path);
}

/**
 * Resolve a path to a container (track or chain) for device insertion.
 * With explicit prefixes, insertion semantics are simple:
 * - Path ending with 'd' prefix -> insert at that position
 * - Path ending with container (t, rt, mt, c, rc, p) -> append
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
  if (!path || typeof path !== "string") {
    throw new Error("Path must be a non-empty string");
  }

  const segments = path.split("/");

  if (segments.length === 0 || segments[0] === "") {
    throw new Error(`Invalid path: ${path}`);
  }

  // Simple prefix-based logic: path ending with 'd' = position, otherwise = append
  const lastSegment = assertDefined(segments.at(-1), "last path segment");
  const hasPosition = lastSegment.startsWith("d");

  if (hasPosition) {
    const position = Number.parseInt(lastSegment.slice(1));

    if (Number.isNaN(position) || position < 0) {
      throw new Error(`Invalid device position in path: ${path}`);
    }

    const containerPath = segments.slice(0, -1).join("/");
    const container = resolveContainer(containerPath, label);

    return { container, position };
  }

  const container = resolveContainer(path, label);

  return { container, position: null };
}
