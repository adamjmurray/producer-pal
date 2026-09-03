// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Turning a `path` param into the ids it names, for every type a path can
// address. A path that names the wrong kind of thing warns with the type it
// actually found, and its slot comes back null — so what a miss costs is the
// caller's call: `delete` keeps the slot and reports the object undeleted,
// `duplicate` refuses the whole call before it makes anything.

import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { clipIdPerPath } from "#src/tools/clip/helpers/clip-path-lookup.ts";
import {
  findDrumPad,
  resolveDrumPadFromPath,
  resolvePathToLiveApi,
} from "#src/tools/shared/device/helpers/path/device-path-helpers.ts";
import { type ResolvedPath } from "#src/tools/shared/device/helpers/path/device-path-to-live-api.ts";
import { type IdPerPath } from "#src/tools/shared/validation/lists/target-lists.ts";
import { pathEntries } from "#src/tools/shared/validation/helpers/object-path-helpers.ts";
import {
  sceneIdPerPath,
  trackIdPerPath,
} from "#src/tools/shared/validation/path-target-lookup.ts";

/** The types that live in the Set itself, rather than in a device chain. */
const SET_LOOKUPS: Record<string, IdPerPath> = {
  track: trackIdPerPath,
  scene: sceneIdPerPath,
  clip: clipIdPerPath,
};

/**
 * The path-to-id lookup a type is addressed by.
 * @param type - Object type ("track", "scene", "clip", "device", "drum-pad", or "chain")
 * @returns A lookup giving one id per path entry, null where a path named none
 */
export function idPerPathForType(type: string): IdPerPath {
  return (
    SET_LOOKUPS[type] ?? ((paths, tool) => chainIdPerPath(paths, tool, type))
  );
}

// --- Helpers below main exports ---

/**
 * Resolves the paths of a type that lives in a device chain — a device, a drum
 * pad, or a chain.
 * @param paths - Comma-separated paths
 * @param tool - Tool name, for warnings
 * @param type - The target type ("device", "drum-pad", or "chain")
 * @returns One id per path entry, null where a path named none
 */
function chainIdPerPath(
  paths: string,
  tool: string,
  type: string,
): Array<string | null> {
  const ids: Array<string | null> = [];

  for (const entry of pathEntries(paths)) {
    try {
      ids.push(resolvePathToId(resolvePathToLiveApi(entry), entry, type, tool));
    } catch (e) {
      console.warn(`${tool}: ${errorMessage(e)}`);
      ids.push(null);
    }
  }

  return ids;
}

/**
 * Resolves a single path resolution result to an ID
 * @param resolved - Result from resolvePathToLiveApi
 * @param targetPath - Original path for error messages
 * @param type - The target type ("device", "drum-pad", or "chain")
 * @param tool - Tool name, for warnings
 * @returns The resolved ID or null
 */
function resolvePathToId(
  resolved: ResolvedPath,
  targetPath: string,
  type: string,
  tool: string,
): string | null {
  if (type === "drum-pad") {
    return resolveDrumPadPathToId(resolved, targetPath, tool);
  }

  if (type === "chain") {
    return resolveChainPathToId(resolved, targetPath, tool);
  }

  return resolveDevicePathToId(resolved, targetPath, tool);
}

/**
 * Resolves a path to the id of the whole drum pad it names. Only a bare pad
 * path qualifies: both operations a pad takes — clearing it, copying it — act
 * on the whole pad, so a path naming something inside one would reach further
 * than the caller asked.
 * @param resolved - Result from resolvePathToLiveApi
 * @param targetPath - Original path for error messages
 * @param tool - Tool name, for warnings
 * @returns The pad's ID, or null when the path doesn't name one
 */
function resolveDrumPadPathToId(
  resolved: ResolvedPath,
  targetPath: string,
  tool: string,
): string | null {
  if (resolved.targetType !== "drum-pad") {
    console.warn(
      `${tool}: path "${targetPath}" resolves to ${resolved.targetType}, not drum-pad`,
    );

    return null;
  }

  // Resolution stops at the first pad, so a further pad segment is a pad of a
  // nested rack — padless, and worth saying so rather than claiming the path
  // names nothing.
  if (resolved.remainingSegments.length > 0) {
    console.warn(
      resolved.remainingSegments.some((segment) => segment.startsWith("p"))
        ? `${tool}: path "${targetPath}" names a pad of a nested Drum Rack, which has no pad objects — name a chain or a device inside it instead`
        : `${tool}: path "${targetPath}" names something inside a drum pad, not the pad itself (expected something like "t0/d0/pC1")`,
    );

    return null;
  }

  // resolveDrumPadFromPath returns the pad's *chain*, and the pad-level calls
  // are silent no-ops on a chain — so find the DrumPad object itself.
  const pad = findDrumPad(resolved.liveApiPath, resolved.drumPadNote as string);

  if (!pad) {
    console.warn(`${tool}: drum-pad at path "${targetPath}" does not exist`);

    return null;
  }

  return pad.id;
}

/**
 * Resolves a path to the chain it names. A layer of a drum pad
 * ("t0/d0/pC1/c1"), a rack chain ("t0/d0/c1"), or a rack return chain.
 * @param resolved - Result from resolvePathToLiveApi
 * @param targetPath - Original path for error messages
 * @param tool - Tool name, for warnings
 * @returns The chain's ID, or null when the path doesn't name one
 */
function resolveChainPathToId(
  resolved: ResolvedPath,
  targetPath: string,
  tool: string,
): string | null {
  if (resolved.targetType === "drum-pad") {
    return resolveDrumChainPathToId(resolved, targetPath, tool);
  }

  if (
    resolved.targetType !== "chain" &&
    resolved.targetType !== "return-chain"
  ) {
    console.warn(
      `${tool}: path "${targetPath}" resolves to ${resolved.targetType}, not chain`,
    );

    return null;
  }

  const chain = LiveAPI.from(resolved.liveApiPath);

  if (!chain.exists()) {
    console.warn(`${tool}: chain at path "${targetPath}" does not exist`);

    return null;
  }

  return chain.id;
}

/**
 * Resolves a drum pad path to one of the pad's chains. A bare pad path names
 * the whole pad, so it takes the drum-pad type rather than this one.
 * @param resolved - Result from resolvePathToLiveApi
 * @param targetPath - Original path for error messages
 * @param tool - Tool name, for warnings
 * @returns The chain's ID, or null when the path doesn't name one
 */
function resolveDrumChainPathToId(
  resolved: ResolvedPath,
  targetPath: string,
  tool: string,
): string | null {
  if (resolved.remainingSegments.length === 0) {
    console.warn(
      `${tool}: path "${targetPath}" names a whole drum pad; use ` +
        `type="drum-pad", or name one layer like "${targetPath}/c0"`,
    );

    return null;
  }

  const result = resolveDrumPadFromPath(
    resolved.liveApiPath,
    resolved.drumPadNote as string,
    resolved.remainingSegments,
  );

  if (!result.target || result.targetType !== "chain") {
    console.warn(`${tool}: chain at path "${targetPath}" does not exist`);

    return null;
  }

  return result.target.id;
}

/**
 * Resolves a path to the device it names, including a device inside a drum pad.
 * @param resolved - Result from resolvePathToLiveApi
 * @param targetPath - Original path for error messages
 * @param tool - Tool name, for warnings
 * @returns The device's ID, or null when the path doesn't name one
 */
function resolveDevicePathToId(
  resolved: ResolvedPath,
  targetPath: string,
  tool: string,
): string | null {
  // Direct device path (not through drum pad)
  if (resolved.targetType === "device") {
    const target = LiveAPI.from(resolved.liveApiPath);

    if (!target.exists()) {
      console.warn(`${tool}: device at path "${targetPath}" does not exist`);

      return null;
    }

    return target.id;
  }

  // Device nested inside a drum pad. Two forms resolve to the same device:
  // the explicit-chain `t0/d0/pC1/c0/d0` (remainingSegments ["c0","d0"]) and
  // the implicit-chain `t0/d0/pC1/d0` (["d0"], chain 0 implied) — matching the
  // forms read-device and update-device accept. `>= 1` covers both; a bare pad
  // (`pC1`, length 0) is the whole-pad case handled as a "drum-pad" target, and
  // an explicit chain with no device (`pC1/c0`, ["c0"]) resolves to a chain and
  // is rejected by the targetType check below.
  if (
    resolved.targetType === "drum-pad" &&
    resolved.remainingSegments.length > 0
  ) {
    const result = resolveDrumPadFromPath(
      resolved.liveApiPath,
      resolved.drumPadNote as string,
      resolved.remainingSegments,
    );

    if (!result.target || result.targetType !== "device") {
      console.warn(`${tool}: device at path "${targetPath}" does not exist`);

      return null;
    }

    return result.target.id;
  }

  console.warn(
    `${tool}: path "${targetPath}" resolves to ${resolved.targetType}, not device`,
  );

  return null;
}
