// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Turning a `path` param into the ids it names, for every type a path can
// address. A path that names the wrong kind of thing reports the type it
// actually found, and its slot comes back empty — so what a miss costs is the
// caller's call: `delete` keeps the slot and reports the target skipped,
// `duplicate` refuses the whole call before it makes anything.

import { clipIdAtPath } from "#src/tools/clip/helpers/clip-path-lookup.ts";
import {
  findDrumPad,
  resolveDrumPadFromPath,
  resolvePathToLiveApi,
} from "#src/tools/shared/device/helpers/path/insertion-path.ts";
import { type ResolvedPath } from "#src/tools/shared/device/helpers/path/device-path-to-live-api.ts";
import { type IdPerPath } from "#src/tools/shared/validation/lists/target-lists.ts";
import {
  type IdLookup,
  idPerPath,
  nothingThere,
  type PathResolution,
  resolvePathEntry,
} from "#src/tools/shared/validation/helpers/id-per-path-lookup.ts";
import {
  sceneIdAtPath,
  trackIdAtPath,
} from "#src/tools/shared/validation/path-target-lookup.ts";

/** One path entry's lookup, for the types that live in the Set itself. */
type IdAtPath = (entry: string) => IdLookup;

/** The types that live in the Set itself, rather than in a device chain. */
const SET_LOOKUPS: Record<string, IdAtPath> = {
  track: trackIdAtPath,
  scene: sceneIdAtPath,
  clip: clipIdAtPath,
};

/**
 * The path-to-id lookup a type is addressed by.
 * @param type - Object type ("track", "scene", "clip", "device", "drum-pad", or "chain")
 * @returns A lookup giving one id per path entry, null where a path named none
 */
export function idPerPathForType(type: string): IdPerPath {
  return (paths) => idPerPath(paths, "path", idAtPathForType(type));
}

/**
 * The same lookup for one path, for a caller that reports a miss instead of
 * warning: the resolution says what the entry named, or why it named nothing.
 * @param type - Object type ("track", "scene", "clip", "device", "drum-pad", or "chain")
 * @param entry - One path, as the caller wrote it
 * @returns What that entry named
 */
export function resolvePathForType(
  type: string,
  entry: string,
): PathResolution {
  return resolvePathEntry(entry, idAtPathForType(type));
}

// --- Helpers below main exports ---

/**
 * One entry's lookup for a type, whether it lives in the Set or in a chain.
 * @param type - Object type ("track", "scene", "clip", "device", "drum-pad", or "chain")
 * @returns The lookup for one path entry of that type
 */
function idAtPathForType(type: string): IdAtPath {
  return SET_LOOKUPS[type] ?? ((entry) => chainIdAtPath(entry, type));
}

/**
 * Resolves the path of a type that lives in a device chain — a device, a drum
 * pad, or a chain.
 * @param entry - One path, as the caller wrote it
 * @param type - The target type ("device", "drum-pad", or "chain")
 * @returns The object's id, or why there isn't one
 */
function chainIdAtPath(entry: string, type: string): IdLookup {
  return resolvePathToId(resolvePathToLiveApi(entry), entry, type);
}

/**
 * Resolves a single path resolution result to an ID
 * @param resolved - Result from resolvePathToLiveApi
 * @param targetPath - Original path, for the reason
 * @param type - The target type ("device", "drum-pad", or "chain")
 * @returns The resolved id, or why there isn't one
 */
function resolvePathToId(
  resolved: ResolvedPath,
  targetPath: string,
  type: string,
): IdLookup {
  if (type === "drum-pad") {
    return resolveDrumPadPathToId(resolved, targetPath);
  }

  if (type === "chain") {
    return resolveChainPathToId(resolved, targetPath);
  }

  return resolveDevicePathToId(resolved, targetPath);
}

/**
 * Resolves a path to the id of the whole drum pad it names. Only a bare pad
 * path qualifies: both operations a pad takes — clearing it, copying it — act
 * on the whole pad, so a path naming something inside one would reach further
 * than the caller asked.
 * @param resolved - Result from resolvePathToLiveApi
 * @param targetPath - Original path, for the reason
 * @returns The pad's id, or why the path doesn't name one
 */
function resolveDrumPadPathToId(
  resolved: ResolvedPath,
  targetPath: string,
): IdLookup {
  if (resolved.targetType !== "drum-pad") {
    throw new Error(
      `path "${targetPath}" resolves to ${resolved.targetType}, not drum-pad`,
    );
  }

  // Resolution stops at the first pad, so a further pad segment is a pad of a
  // nested rack — padless, and worth saying so rather than claiming the path
  // names nothing.
  if (resolved.remainingSegments.length > 0) {
    throw new Error(
      resolved.remainingSegments.some((segment) => segment.startsWith("p"))
        ? `path "${targetPath}" names a pad of a nested Drum Rack, which has no pad objects — name a chain or a device inside it instead`
        : `path "${targetPath}" names something inside a drum pad, not the pad itself (expected something like "t0/d0/pC1")`,
    );
  }

  // resolveDrumPadFromPath returns the pad's *chain*, and the pad-level calls
  // are silent no-ops on a chain — so find the DrumPad object itself.
  const pad = findDrumPad(resolved.liveApiPath, resolved.drumPadNote as string);

  if (!pad) {
    return nothingThere(`drum-pad at path "${targetPath}" does not exist`);
  }

  return { id: pad.id };
}

/**
 * Resolves a path to the chain it names. A layer of a drum pad
 * ("t0/d0/pC1/c1"), a rack chain ("t0/d0/c1"), or a rack return chain.
 * @param resolved - Result from resolvePathToLiveApi
 * @param targetPath - Original path, for the reason
 * @returns The chain's id, or why the path doesn't name one
 */
function resolveChainPathToId(
  resolved: ResolvedPath,
  targetPath: string,
): IdLookup {
  if (resolved.targetType === "drum-pad") {
    return resolveDrumChainPathToId(resolved, targetPath);
  }

  if (
    resolved.targetType !== "chain" &&
    resolved.targetType !== "return-chain"
  ) {
    throw new Error(
      `path "${targetPath}" resolves to ${resolved.targetType}, not chain`,
    );
  }

  const chain = LiveAPI.from(resolved.liveApiPath);

  if (!chain.exists()) {
    return nothingThere(`chain at path "${targetPath}" does not exist`);
  }

  return { id: chain.id };
}

/**
 * Resolves a drum pad path to one of the pad's chains. A bare pad path names
 * the whole pad, so it takes the drum-pad type rather than this one.
 * @param resolved - Result from resolvePathToLiveApi
 * @param targetPath - Original path, for the reason
 * @returns The chain's id, or why the path doesn't name one
 */
function resolveDrumChainPathToId(
  resolved: ResolvedPath,
  targetPath: string,
): IdLookup {
  if (resolved.remainingSegments.length === 0) {
    throw new Error(
      `path "${targetPath}" names a whole drum pad; use ` +
        `type="drum-pad", or name one layer like "${targetPath}/c0"`,
    );
  }

  const result = resolveDrumPadFromPath(
    resolved.liveApiPath,
    resolved.drumPadNote as string,
    resolved.remainingSegments,
  );

  if (!result.target || result.targetType !== "chain") {
    return nothingThere(`chain at path "${targetPath}" does not exist`);
  }

  return { id: result.target.id };
}

/**
 * Resolves a path to the device it names, including a device inside a drum pad.
 * @param resolved - Result from resolvePathToLiveApi
 * @param targetPath - Original path, for the reason
 * @returns The device's id, or why the path doesn't name one
 */
function resolveDevicePathToId(
  resolved: ResolvedPath,
  targetPath: string,
): IdLookup {
  // Direct device path (not through drum pad)
  if (resolved.targetType === "device") {
    const target = LiveAPI.from(resolved.liveApiPath);

    if (!target.exists()) {
      return nothingThere(`device at path "${targetPath}" does not exist`);
    }

    return { id: target.id };
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
      return nothingThere(`device at path "${targetPath}" does not exist`);
    }

    return { id: result.target.id };
  }

  throw new Error(
    `path "${targetPath}" resolves to ${resolved.targetType}, not device`,
  );
}
