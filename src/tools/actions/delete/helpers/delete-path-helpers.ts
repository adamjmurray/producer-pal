// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Turning delete's `path` param into the ids it names. Every type a path can
// address resolves here, so a path that names the wrong kind of thing warns
// with the type it actually found rather than failing at the delete itself.

import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  findDrumPad,
  resolveDrumPadFromPath,
  resolvePathToLiveApi,
} from "#src/tools/shared/device/helpers/path/device-path-helpers.ts";
import { type ResolvedPath } from "#src/tools/shared/device/helpers/path/device-path-to-live-api.ts";

/** What a batch of paths resolved to, and which of them named nothing. */
export interface ResolvedPaths {
  /** Ids of the objects the paths named, in path order. */
  ids: string[];
  /** Paths that named nothing deletable. The warning says why. */
  unresolved: string[];
}

/**
 * Resolves paths to their IDs for the types a path can name. Paths that name
 * nothing come back in `unresolved` so the caller can report them as
 * `deleted: false` — an empty result reads as "nothing to do" to a model, and
 * one that skims past the warning then reports the delete as done.
 * @param paths - Array of paths to resolve
 * @param type - The target type ("device", "drum-pad", or "chain")
 * @returns The resolved ids, plus the paths that named nothing
 */
export function resolvePathsToIds(
  paths: string[],
  type: string,
): ResolvedPaths {
  const ids: string[] = [];
  const unresolved: string[] = [];

  for (const targetPath of paths) {
    try {
      const resolved = resolvePathToLiveApi(targetPath);
      const resolvedId = resolvePathToId(resolved, targetPath, type);

      if (resolvedId) {
        ids.push(resolvedId);
      } else {
        unresolved.push(targetPath);
      }
    } catch (e) {
      console.warn(`delete: ${errorMessage(e)}`);
      unresolved.push(targetPath);
    }
  }

  return { ids, unresolved };
}

/**
 * Resolves a path to the id of the whole drum pad it names. Only a bare pad
 * path qualifies: `delete_all_chains` clears the pad, so a path naming
 * something inside one would delete more than the caller asked for.
 * @param resolved - Result from resolvePathToLiveApi
 * @param targetPath - Original path for error messages
 * @returns The pad's ID, or null when the path doesn't name one
 */
function resolveDrumPadPathToId(
  resolved: ResolvedPath,
  targetPath: string,
): string | null {
  if (resolved.targetType !== "drum-pad") {
    console.warn(
      `delete: path "${targetPath}" resolves to ${resolved.targetType}, not drum-pad`,
    );

    return null;
  }

  // Resolution stops at the first pad, so a further pad segment is a pad of a
  // nested rack — padless, and worth saying so rather than claiming the path
  // names nothing.
  if (resolved.remainingSegments.length > 0) {
    console.warn(
      resolved.remainingSegments.some((segment) => segment.startsWith("p"))
        ? `delete: path "${targetPath}" names a pad of a nested Drum Rack. Such a rack has no pad objects, and Live can only clear a pad — delete the pad's devices to empty it instead`
        : `delete: path "${targetPath}" names something inside a drum pad, not the pad itself (expected something like "t0/d0/pC1")`,
    );

    return null;
  }

  // resolveDrumPadFromPath returns the pad's *chain*, and delete_all_chains
  // on a chain is a silent no-op — so find the DrumPad object itself.
  const pad = findDrumPad(resolved.liveApiPath, resolved.drumPadNote as string);

  if (!pad) {
    console.warn(`delete: drum-pad at path "${targetPath}" does not exist`);

    return null;
  }

  return pad.id;
}

/**
 * Resolves a path to the chain it names. A layer of a drum pad
 * ("t0/d0/pC1/c1"), a rack chain ("t0/d0/c1"), or a rack return chain.
 * @param resolved - Result from resolvePathToLiveApi
 * @param targetPath - Original path for error messages
 * @returns The chain's ID, or null when the path doesn't name one
 */
function resolveChainPathToId(
  resolved: ResolvedPath,
  targetPath: string,
): string | null {
  if (resolved.targetType === "drum-pad") {
    return resolveDrumChainPathToId(resolved, targetPath);
  }

  if (
    resolved.targetType !== "chain" &&
    resolved.targetType !== "return-chain"
  ) {
    console.warn(
      `delete: path "${targetPath}" resolves to ${resolved.targetType}, not chain`,
    );

    return null;
  }

  const chain = LiveAPI.from(resolved.liveApiPath);

  if (!chain.exists()) {
    console.warn(`delete: chain at path "${targetPath}" does not exist`);

    return null;
  }

  return chain.id;
}

/**
 * Resolves a drum pad path to one of the pad's chains. A bare pad path names
 * the whole pad, so it takes the drum-pad type rather than this one.
 * @param resolved - Result from resolvePathToLiveApi
 * @param targetPath - Original path for error messages
 * @returns The chain's ID, or null when the path doesn't name one
 */
function resolveDrumChainPathToId(
  resolved: ResolvedPath,
  targetPath: string,
): string | null {
  if (resolved.remainingSegments.length === 0) {
    console.warn(
      `delete: path "${targetPath}" names a whole drum pad; use ` +
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
    console.warn(`delete: chain at path "${targetPath}" does not exist`);

    return null;
  }

  return result.target.id;
}

/**
 * Resolves a single path resolution result to an ID
 * @param resolved - Result from resolvePathToLiveApi
 * @param targetPath - Original path for error messages
 * @param type - The target type ("device", "drum-pad", or "chain")
 * @returns The resolved ID or null
 */
function resolvePathToId(
  resolved: ResolvedPath,
  targetPath: string,
  type: string,
): string | null {
  if (type === "drum-pad") return resolveDrumPadPathToId(resolved, targetPath);
  if (type === "chain") return resolveChainPathToId(resolved, targetPath);

  return resolveDevicePathToId(resolved, targetPath);
}

/**
 * Resolves a path to the device it names, including a device inside a drum pad.
 * @param resolved - Result from resolvePathToLiveApi
 * @param targetPath - Original path for error messages
 * @returns The device's ID, or null when the path doesn't name one
 */
function resolveDevicePathToId(
  resolved: ResolvedPath,
  targetPath: string,
): string | null {
  // Direct device path (not through drum pad)
  if (resolved.targetType === "device") {
    const target = LiveAPI.from(resolved.liveApiPath);

    if (!target.exists()) {
      console.warn(`delete: device at path "${targetPath}" does not exist`);

      return null;
    }

    return target.id;
  }

  // Device nested inside a drum pad. Two forms resolve to the same device:
  // the explicit-chain `t0/d0/pC1/c0/d0` (remainingSegments ["c0","d0"]) and
  // the implicit-chain `t0/d0/pC1/d0` (["d0"], chain 0 implied) — matching the
  // forms read-device and update-device accept. `>= 1` covers both; a bare pad
  // (`pC1`, length 0) is the whole-pad case handled as a "drum-pad" delete, and
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
      console.warn(`delete: device at path "${targetPath}" does not exist`);

      return null;
    }

    return result.target.id;
  }

  console.warn(
    `delete: path "${targetPath}" resolves to ${resolved.targetType}, not device`,
  );

  return null;
}
