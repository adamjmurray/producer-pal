// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { type ChainMixerApplied } from "#src/tools/shared/device/helpers/chain-mixer-helpers.ts";
import { type ParamResult } from "#src/tools/shared/device/helpers/device-display-helpers.ts";
import {
  type DrumPadGroup,
  chainsOnDrumPad,
  drumPadPath,
  resolveDrumPadGroup,
} from "#src/tools/shared/device/helpers/path/device-drumpad-navigation.ts";
import {
  insertionContainerPath,
  resolveDrumPadFromPath,
  resolvePathToLiveApi,
} from "#src/tools/shared/device/helpers/path/device-path-helpers.ts";
import { isProducerPalDevice } from "#src/tools/shared/device/is-producer-pal-device.ts";
import { unwrapSingleResult } from "#src/tools/shared/utils.ts";
import { getColorForIndex } from "#src/tools/shared/validation/color-utils.ts";
import { type ListEntries } from "#src/tools/shared/validation/lists/list-pairing.ts";
import { getNameForIndex } from "#src/tools/shared/validation/name-utils.ts";
import {
  type WrittenContainer,
  pathField,
  targetLabel,
} from "#src/tools/shared/validation/object-path-for-api.ts";
// Type-only, and it has to stay that way: update-device.ts imports
// updateMultipleTargets from here, so a value import would be a runtime cycle.
import { type TargetItem } from "../update-device.ts";
import { moveDrumChainToPath } from "./update-device-drum-move-helpers.ts";
import { updateDrumPadGroup } from "./update-device-drum-pad-helpers.ts";
import {
  moveDeviceToPath,
  stripReturnChainLetter,
} from "./update-device-helpers.ts";
import {
  type UpdateTargetOptions,
  updateDeviceProperties,
  updateNonDeviceProperties,
} from "./update-device-property-helpers.ts";
import {
  isDeviceType,
  isValidUpdateType,
} from "./update-device-type-helpers.ts";

/** One target's result: what it is, plus whatever the call wrote on it. */
interface UpdateTargetResult extends ChainMixerApplied {
  id: string;
  path?: string;
  params?: ParamResult[];
}

/** A bare pad path names the whole pad, so it resolves to a group of objects
 * rather than to one. Everything else resolves to a single object. */
type ResolvedTarget =
  | { kind: "object"; target: LiveAPI }
  | { kind: "drum-pad"; group: DrumPadGroup; padPath: string };

/** An object's own last path segment, so the rest of the path is its container. */
const OWN_SEGMENT = /\/[^/]+$/;

/**
 * Update every target the call named, resolving each by the param that named it
 * @param items - The targets, each tagged with the param it came from
 * @param updateOptions - Options to pass to updateTarget
 * @param parsedNames - Comma-separated names array, or null
 * @param parsedColors - Comma-separated colors array, or null
 * @returns Single result or array of results
 */
export function updateMultipleTargets(
  items: TargetItem[],
  updateOptions: UpdateTargetOptions,
  parsedNames: ListEntries | null,
  parsedColors: ListEntries | null,
): Record<string, unknown> | Record<string, unknown>[] {
  const results: Record<string, unknown>[] = [];

  for (let i = 0; i < items.length; i++) {
    const { value, kind } = items[i] as TargetItem;
    const resolved =
      kind === "id" ? resolveIdToTarget(value) : resolvePathToTargetSafe(value);

    if (!resolved) {
      console.warn(`target not found at ${kind} "${value}"`);
      continue;
    }

    const options: UpdateTargetOptions = {
      ...updateOptions,
      name: getNameForIndex(updateOptions.name, i, parsedNames),
      color: getColorForIndex(updateOptions.color, i, parsedColors),
    };

    const result =
      resolved.kind === "drum-pad"
        ? updateDrumPadGroup(resolved.group, resolved.padPath, options)
        : updateTarget(
            resolved.target,
            options,
            kind === "path" ? value : undefined,
          );

    if (result) {
      results.push(result as Record<string, unknown>);
    }
  }

  return unwrapSingleResult(results);
}

// --- Helpers below main exports ---

/**
 * Resolve an ID to a LiveAPI target
 * @param id - Object ID
 * @returns Resolved target or null if not found
 */
function resolveIdToTarget(id: string): ResolvedTarget | null {
  const target = LiveAPI.from(id);

  if (!target.exists()) return null;

  return drumPadTarget(target) ?? { kind: "object", target };
}

/**
 * A DrumPad id names the same thing its pad path does, so give it the same
 * whole-pad update. read-device hands these ids out, and without this most of
 * what it reports on a pad answers "not applicable to DrumPad" when written
 * back by id.
 * @param target - The object an id resolved to
 * @returns The whole-pad target, or null when this isn't a pad
 */
function drumPadTarget(target: LiveAPI): ResolvedTarget | null {
  if (target.type !== "DrumPad") return null;

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
  } catch (e) {
    console.warn(errorMessage(e));

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
 * Update a single target (device, chain, or drum pad)
 * @param target - Live API object to update
 * @param options - Update options
 * @param writtenPath - The path the call named the target by, if it named one
 * @returns Result with ID and any params written, or null if update failed
 */
function updateTarget(
  target: LiveAPI,
  options: UpdateTargetOptions,
  writtenPath?: string,
): UpdateTargetResult | null {
  const type = target.type;

  // Validate type is updatable
  if (!isValidUpdateType(type)) {
    console.warn(`cannot update ${type} objects: ${targetLabel(target)}`);

    return null;
  }

  // Handle move operation first (before other updates)
  const moved =
    options.toPath == null
      ? undefined
      : moveTargetToPath(target, type, options.toPath);

  // A move re-parents the object, so its toPath replaces the address the call
  // reached it by.
  const written = moved ?? writtenContainer(writtenPath);

  // No DrumPad case: a pad is never a lone target — id and path both resolve
  // one to the whole pad, and updateDrumPadGroup writes `name` to its chain,
  // since Live drops writes to `pad.name`.
  if (options.name != null) {
    target.set("name", stripReturnChainLetter(target, options.name));
  }

  if (!isDeviceType(type)) {
    // The chain's own mixer reads back here, so a clamped or snapped level is
    // visible instead of the caller's argument being assumed to have landed.
    const mixer = updateNonDeviceProperties(target, type, options);

    return { id: target.id, ...pathField(target, written), ...mixer };
  }

  const params = updateDeviceProperties(target, type, options);
  const result: UpdateTargetResult = {
    id: target.id,
    ...pathField(target, written),
  };

  if (params.length > 0) result.params = params;

  return result;
}

/**
 * Carry out the `toPath` move a call asked for.
 * @param target - The object being updated
 * @param type - Its Live API type
 * @param toPath - Where the call asked to move it
 * @returns The destination as the call spelled it, for naming the object
 *   afterwards; undefined when it stayed where it was
 */
function moveTargetToPath(
  target: LiveAPI,
  type: string,
  toPath: string,
): WrittenContainer | undefined {
  if (isProducerPalDevice(target)) {
    console.warn(
      `cannot move the Producer Pal device ${targetLabel(target)}, skipping the move`,
    );

    return undefined;
  }

  if (isDeviceType(type)) {
    return moveDeviceAndName(target, toPath);
  }

  if (type === "DrumChain") {
    moveDrumChainToPath(target, toPath, false);

    return undefined;
  }

  console.warn(`cannot move ${type} ${targetLabel(target)}`);

  return undefined;
}

/**
 * Move a device, and say where it landed as the call spelled it.
 * @param device - The device being moved
 * @param toPath - Where the call asked to move it
 * @returns The destination spelling, or undefined when the move didn't happen
 */
function moveDeviceAndName(
  device: LiveAPI,
  toPath: string,
): WrittenContainer | undefined {
  const { outcome, container } = moveDeviceToPath(device, toPath);

  // "unresolvable" said why itself. Either way the move is skipped and the
  // rest of this update — and of the batch — carries on.
  if (outcome === "no-destination") {
    console.warn(`move target at path "${toPath}" does not exist`);
  } else if (outcome === "refused") {
    console.warn(`${targetLabel(device)} was not moved to "${toPath}"`);
  }

  // Live confirms the device is in this container before the move reports
  // "moved", which is what makes the destination safe to name it by.
  return container == null
    ? undefined
    : {
        container: () => container,
        path: insertionContainerPath(toPath, "toPath"),
      };
}

/**
 * The container spelling to echo for a target the call named by path.
 * @param writtenPath - The path the call named the target by
 * @returns The container spelling, or undefined for an id-addressed target
 */
function writtenContainer(
  writtenPath: string | undefined,
): WrittenContainer | undefined {
  if (writtenPath == null) return undefined;

  const path = writtenPath.replace(OWN_SEGMENT, "");

  return { container: () => containerFromPath(path), path };
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
