// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type DrumPadGroup,
  chainsOnDrumPad,
  drumPadPath,
  resolveDrumPadGroup,
} from "#src/tools/shared/device/helpers/path/device-drumpad-navigation.ts";
import { nothingAtPath } from "#src/tools/shared/device/helpers/path/device-path-to-live-api.ts";
import {
  resolveDrumPadFromPath,
  resolvePathToLiveApi,
} from "#src/tools/shared/device/helpers/path/insertion-path.ts";
import { type NamedTarget } from "#src/tools/shared/validation/lists/named-targets.ts";
import { type WrittenContainer } from "#src/tools/shared/validation/object-path-for-api.ts";

/** A bare pad path names the whole pad, so it resolves to a group of objects
 * rather than to one. Everything else resolves to a single object. */
export type ResolvedTarget =
  | { kind: "object"; target: LiveAPI }
  | { kind: "drum-pad"; group: DrumPadGroup; padPath: string };

/** An object's own last path segment, so the rest of the path is its container. */
const OWN_SEGMENT = /\/[^/]+$/;

/**
 * Resolve a target by the param that named it.
 * @param item - The target, tagged with the param that named it
 * @param item.param - Which param named it
 * @param item.value - The id or path
 * @returns The resolved target
 * @throws Error when it names nothing a target can be
 */
export function resolveNamedTarget({
  param,
  value,
}: NamedTarget): ResolvedTarget {
  const resolved =
    param === "id" ? resolveIdToTarget(value) : resolvePathToTarget(value);

  if (!resolved) {
    throw new Error(
      param === "id" ? `id "${value}" does not exist` : nothingAtPath(value),
    );
  }

  return resolved;
}

/**
 * What names a resolved target: the same object has the same key whichever way
 * the call spelled it (an id, a path, a type segment like `inst`).
 * @param resolved - A resolved target
 * @returns The key
 */
export function resolvedTargetKey(resolved: ResolvedTarget): string {
  if (resolved.kind === "object") {
    return resolved.target.id;
  }

  const { pad, chains } = resolved.group;

  // A pad with no DrumPad object is known by the chains it routes to.
  return pad?.id ?? `pad-chains:${chains.map((chain) => chain.id).join(",")}`;
}

/**
 * The container spelling to echo for a target the call named by path.
 * @param writtenPath - The path the call named the target by
 * @returns The container spelling, or undefined for an id-addressed target
 */
export function writtenContainer(
  writtenPath: string | undefined,
): WrittenContainer | undefined {
  if (writtenPath == null) {
    return undefined;
  }

  const path = writtenPath.replace(OWN_SEGMENT, "");

  return { container: () => containerFromPath(path), path };
}

// --- Helpers below main exports ---

/**
 * Resolve an ID to a LiveAPI target
 * @param id - Object ID
 * @returns Resolved target or null if not found
 */
function resolveIdToTarget(id: string): ResolvedTarget | null {
  const target = LiveAPI.from(id);

  if (!target.exists()) {
    return null;
  }

  return drumPadTarget(target) ?? { kind: "object", target };
}

/**
 * A DrumPad id names the same thing its pad path does, so give it the same
 * whole-pad update. read-device hands these ids out, and without this most of
 * what it reports on a pad is "not applicable to a drum pad" when written back.
 * @param target - The object an id resolved to
 * @returns The whole-pad target, or null when this isn't a pad
 */
function drumPadTarget(target: LiveAPI): ResolvedTarget | null {
  if (target.type !== "DrumPad") {
    return null;
  }

  return {
    kind: "drum-pad",
    group: { pad: target, chains: chainsOnDrumPad(target) },
    padPath: drumPadPath(target),
  };
}

/**
 * Safely resolve a path to a Live API target, catching errors
 * @param path - Device/chain/drum-pad path
 * @returns Resolved target or null if not found or invalid
 */
function resolvePathToTargetSafe(path: string): ResolvedTarget | null {
  try {
    return resolvePathToTarget(path);
  } catch {
    // Only the container spelling to echo comes through here, and the target's
    // own entry already carries whatever went wrong with the path.
    return null;
  }
}

/**
 * Resolve a path to a Live API target (device, chain, or drum pad)
 * @param path - Device/chain/drum-pad path
 * @returns Resolved target or null if not found
 */
function resolvePathToTarget(path: string): ResolvedTarget | null {
  const resolved = resolvePathToLiveApi(path);

  // A type segment that named no device says what the container holds instead
  // of the bare miss the substituted position would report.
  if (resolved.namesNothing != null) {
    throw new Error(nothingAtPath(path, resolved.namesNothing));
  }

  switch (resolved.targetType) {
    case "device": // fallthrough
    case "chain": // fallthrough

    case "return-chain": {
      const target = resolveTargetFromPath(resolved.liveApiPath);

      return target ? { kind: "object", target } : null;
    }

    case "drum-pad": {
      // drumPadNote is guaranteed for drum-pad targetType
      const drumPadNote = resolved.drumPadNote as string;
      const { remainingSegments } = resolved;

      // A bare pad path (pC1) names the whole pad; anything further down
      // (pC1/c0, pC1/d0) names one object inside it.
      if (remainingSegments.length === 0) {
        const group = resolveDrumPadGroup(resolved.liveApiPath, drumPadNote);

        return group ? { kind: "drum-pad", group, padPath: path } : null;
      }

      const drumPadResult = resolveDrumPadFromPath(
        resolved.liveApiPath,
        drumPadNote,
        remainingSegments,
      );

      return drumPadResult.target
        ? { kind: "object", target: drumPadResult.target }
        : null;
    }

    // Unreachable: every TargetType is handled above, and the `never` keeps it
    // that way if a new one is added.
    /* v8 ignore start -- exhaustive switch: all TargetType values handled above */
    default: {
      const exhaustive: never = resolved.targetType;

      return exhaustive;
    }
    /* v8 ignore stop */
  }
}

/**
 * Resolve device or chain target from Live API path
 * @param liveApiPath - Live API canonical path
 * @returns LiveAPI object or null if not found
 */
function resolveTargetFromPath(liveApiPath: string): LiveAPI | null {
  const target = LiveAPI.from(liveApiPath);

  return target.exists() ? target : null;
}

/**
 * The object a container spelling names. Resolved from the spelling itself, not
 * off the target: pathField substitutes the spelling only once it checks out as
 * the target's parent, and a container read off the target proves nothing.
 * @param path - The container as the call spelled it
 * @returns The container, or null when the spelling names nothing
 */
function containerFromPath(path: string): LiveAPI | null {
  const resolved = resolvePathToTargetSafe(path);

  // A bare pad path names the whole pad, and a device written below one sits in
  // the pad's first chain.
  return resolved?.kind === "drum-pad"
    ? (resolved.group.chains[0] ?? null)
    : (resolved?.target ?? null);
}
