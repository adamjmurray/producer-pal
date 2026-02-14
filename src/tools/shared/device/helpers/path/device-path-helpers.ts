// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { noteNameToMidi } from "#src/shared/pitch.ts";
import {
  autoCreateDrumPadChains,
  resolveContainerWithAutoCreate,
} from "#src/tools/shared/device/helpers/device-chain-creation-helpers.ts";
import { assertDefined } from "#src/tools/shared/utils.ts";
import { resolveDrumPadFromPath } from "./device-drumpad-navigation.ts";
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
 * @returns LiveAPI track object
 */
function resolveTrack(segment: string): LiveAPI {
  if (segment === "mt") {
    return LiveAPI.from(livePath.masterTrack());
  }

  if (segment.startsWith("rt")) {
    const returnIndex = Number.parseInt(segment.slice(2));

    return LiveAPI.from(livePath.returnTrack(returnIndex));
  }

  if (segment.startsWith("t")) {
    const trackIndex = Number.parseInt(segment.slice(1));

    return LiveAPI.from(livePath.track(trackIndex));
  }

  throw new Error(`Invalid track segment: ${segment}`);
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
  const { remainingSegments } = resolved;

  // Try to resolve the drum pad chain
  const result = resolveDrumPadFromPath(
    resolved.liveApiPath,
    drumPadNote,
    remainingSegments,
  );

  // If found, return it
  if (result.target) {
    return result.target;
  }

  // If not found and we're looking for a chain, try auto-creation
  if (result.targetType === "chain") {
    const device = LiveAPI.from(resolved.liveApiPath);

    if (!device.exists()) {
      return null;
    }

    // Parse the note to MIDI
    const targetInNote = drumPadNote === "*" ? -1 : noteNameToMidi(drumPadNote);

    if (targetInNote == null) {
      return null;
    }

    // Get chain index from remaining segments (defaults to 0)
    // Chain index segment uses 'c' prefix: pC1/c2 means chain 2 of drum pad C1
    let chainIndex = 0;

    if (remainingSegments.length > 0) {
      const chainSegment = assertDefined(remainingSegments[0], "chain segment");

      chainIndex = chainSegment.startsWith("c")
        ? Number.parseInt(chainSegment.slice(1))
        : Number.parseInt(chainSegment);
    }

    if (Number.isNaN(chainIndex) || chainIndex < 0) {
      return null;
    }

    // Find existing chains with this in_note
    const allChains = device.getChildren("chains");
    const matchingChains = allChains.filter(
      (chain) => chain.getProperty("in_note") === targetInNote,
    );

    // Auto-create chains if needed
    if (chainIndex >= matchingChains.length) {
      autoCreateDrumPadChains(
        device,
        targetInNote,
        chainIndex,
        matchingChains.length,
      );
    }

    // Re-resolve after creation
    const resultAfter = resolveDrumPadFromPath(
      resolved.liveApiPath,
      drumPadNote,
      remainingSegments,
    );

    return resultAfter.target;
  }

  return null;
}

/**
 * Resolve a container path (track or chain) to a LiveAPI object.
 * Auto-creates missing chains for regular racks. Throws for Drum Racks.
 * @param path - Container path (e.g., "0", "0/0/0", "0/0/pC1")
 * @returns LiveAPI object (Track or Chain)
 */
function resolveContainer(path: string): LiveAPI | null {
  const segments = path.split("/");

  if (segments.length === 1)
    return resolveTrack(assertDefined(segments[0], "track segment"));
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
 * @returns Container and optional position
 */
export function resolveInsertionPath(path: string): InsertionPathResolution {
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
    const container = resolveContainer(containerPath);

    return { container, position };
  }

  const container = resolveContainer(path);

  return { container, position: null };
}
