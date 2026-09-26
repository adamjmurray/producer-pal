// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ChainMixerReport } from "./chain-mixer-report.ts";
import { type ParamResult } from "#src/tools/shared/device/helpers/param-reading.ts";
import { type ActionResult } from "#src/tools/shared/device/specialized/specialized-device-types.ts";
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
import { isProducerPalDevice } from "#src/tools/shared/device/is-producer-pal-device.ts";
import { getColorForIndex } from "#src/tools/shared/validation/color-parsing.ts";
import { type ListEntries } from "#src/tools/shared/validation/lists/list-pairing.ts";
import { type NamedTarget } from "#src/tools/shared/validation/lists/named-targets.ts";
import {
  writeFanOut,
  type WriteResult,
} from "#src/tools/shared/validation/lists/write-fan-out.ts";
import { getNameForIndex } from "#src/tools/shared/validation/name-parsing.ts";
import {
  type WrittenContainer,
  pathField,
  targetLabel,
} from "#src/tools/shared/validation/object-path-for-api.ts";
import { moveDeviceToPath } from "./move-device.ts";
import { moveDrumChainToPath } from "./move-drum-chain.ts";
import { stripReturnChainLetter } from "./strip-return-chain-letter.ts";
import { updateDrumPadGroup } from "./update-drum-pad-group.ts";
import {
  type UpdateTargetOptions,
  refuseIfNoParamLanded,
  updateDeviceProperties,
  updateNonDeviceProperties,
} from "./update-device-properties.ts";
import {
  type TargetNotes,
  newTargetNotes,
  noteTarget,
  refuseTargetWork,
  reportTargetNotes,
} from "#src/tools/shared/helpers/target-notes.ts";
import {
  isDeviceType,
  isValidUpdateType,
  liveObjectWords,
} from "./update-target-types.ts";

/** One target's result: what it is, plus whatever the call wrote on it. */
interface UpdateTargetResult extends ChainMixerReport {
  id: string;
  path?: string;
  /** The rack chains a toPath had to make first ("c2-c3"), when it made any */
  created?: string;
  params?: ParamResult[];
  actions?: ActionResult[];
}

/** Whether a `toPath` move happened, and what it made getting there. */
interface TargetMove {
  moved?: boolean;
  created?: string;
}

/** A target's entry, its id, and the call's spelling of its container when
 * that spelling is kept. */
interface TargetUpdate {
  id: string;
  result: { path?: string };
  written?: WrittenContainer;
}

/** A bare pad path names the whole pad, so it resolves to a group of objects
 * rather than to one. Everything else resolves to a single object. */
export type ResolvedTarget =
  | { kind: "object"; target: LiveAPI }
  | { kind: "drum-pad"; group: DrumPadGroup; padPath: string };

/** An object's own last path segment, so the rest of the path is its container. */
const OWN_SEGMENT = /\/[^/]+$/;

/** What loading a target's preset did: replaced the device or kept it, or why not. */
export type PresetOutcome = { replaced: boolean } | { error: string };

/** One entry per target, except where null means one value covers them all. */
export interface TargetLists {
  names: ListEntries | null;
  colors: ListEntries | null;
  /** Where each target moves, undefined where the call named nowhere */
  destinations: Array<string | undefined>;
  /** The other per-target strings for the target at an index */
  valuesAt: (
    index: number,
  ) => Pick<UpdateTargetOptions, "sendReturn" | "mappedPitch" | "preset">;
}

/**
 * Update every target the call named, resolving each by the param that named it
 * @param items - The targets, each tagged with the param it came from
 * @param updateOptions - Options to pass to updateTarget, minus the per-target lists
 * @param lists - The name, color and destination lists, paired with the targets
 * @param presetOutcomes - What loading each target's preset did, by index
 * @returns The result when one target was named, otherwise one entry per target
 */
export function updateMultipleTargets(
  items: NamedTarget[],
  updateOptions: UpdateTargetOptions,
  lists: TargetLists,
  presetOutcomes: Array<PresetOutcome | undefined> = [],
): WriteResult<Record<string, unknown>> {
  // Resolve every target before the first write: a move re-indexes what it
  // leaves, so a later path would name whatever slid into the slot.
  const targets = items.map(resolveUpFront);
  const updated: TargetUpdate[] = [];

  const results = writeFanOut<object>(items, ({ param, value }, i) => {
    // Rethrows a failed resolution, whose message is the target's reason.
    const resolved = (targets[i] as () => ResolvedTarget)();
    const options: UpdateTargetOptions = {
      ...updateOptions,
      name: getNameForIndex(updateOptions.name, i, lists.names),
      color: getColorForIndex(updateOptions.color, i, lists.colors),
      toPath: lists.destinations[i],
      ...lists.valuesAt(i),
    };

    if (resolved.kind === "drum-pad") {
      const padResult = updateDrumPadGroup(
        resolved.group,
        resolved.padPath,
        options,
      );

      // A virtual pad has no id, and nothing to name.
      if (padResult.id != null) {
        updated.push({ id: padResult.id, result: padResult });
      }

      return padResult;
    }

    const update = updateTarget(
      resolved.target,
      options,
      param === "path" ? value : undefined,
      presetOutcomes[i],
    );

    updated.push(update);

    return update.result;
  });

  // A later move can push an earlier target along, so name each one once every
  // target has had its turn.
  for (const update of updated) {
    renamePath(update);
  }

  return results as WriteResult<Record<string, unknown>>;
}

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

// --- Helpers below main exports ---

/**
 * Resolve one target now, keeping a failure to throw when its turn comes.
 * @param item - The target, tagged with the param that named it
 * @returns Hands back the resolved target, or throws why it has none
 */
function resolveUpFront(item: NamedTarget): () => ResolvedTarget {
  try {
    const resolved = resolveNamedTarget(item);

    return () => resolved;
  } catch (error) {
    return () => {
      throw error;
    };
  }
}

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
 * Update a single target (device, chain, or drum pad)
 * @param target - Live API object to update
 * @param options - Update options
 * @param writtenPath - The path the call named the target by, if it named one
 * @param presetOutcome - What loading its preset did, when the call sent one
 * @returns Result with ID and any params written, and the container spelling
 *   it was named by
 * @throws Error when this kind of object can't be written to
 */
function updateTarget(
  target: LiveAPI,
  options: UpdateTargetOptions,
  writtenPath?: string,
  presetOutcome?: PresetOutcome,
): TargetUpdate {
  const type = target.type;

  // Validate type is updatable
  if (!isValidUpdateType(type)) {
    throw new Error(
      `cannot update ${liveObjectWords(type)}: ${targetLabel(target)}`,
    );
  }

  const notes = newTargetNotes();

  notePresetOutcome(notes, presetOutcome);

  // Handle move operation first (before other updates)
  const moved: TargetMove =
    options.toPath == null
      ? {}
      : moveTargetToPath(target, type, options.toPath, notes);

  // A moved device is named where it landed: the call's toPath spelling can
  // name a chain to make ("c+") rather than the one it made.
  const written = moved.moved ? undefined : writtenContainer(writtenPath);
  const madeChains = moved.created == null ? {} : { created: moved.created };

  // No DrumPad case: a pad is never a lone target — id and path both resolve
  // one to the whole pad, and updateDrumPadGroup writes `name` to its chain,
  // since Live drops writes to `pad.name`.
  if (options.name != null) {
    target.set("name", stripReturnChainLetter(target, options.name));
  }

  if (!isDeviceType(type)) {
    // The chain's own mixer reads back here, so a clamped or snapped level is
    // visible instead of the caller's argument being assumed to have landed.
    const mixer = updateNonDeviceProperties(target, type, options, notes);

    refuseIfNoParamLanded(notes, mixer.params);

    const result = reportTargetNotes(
      {
        id: target.id,
        // Filled in by renamePath once every target has run.
        path: undefined,
        ...madeChains,
        ...mixer,
      },
      notes,
      options,
    );

    return { id: result.id, result, written };
  }

  const { params, actions } = updateDeviceProperties(
    target,
    type,
    options,
    notes,
  );
  const result: UpdateTargetResult = {
    id: target.id,
    // Filled in by renamePath once every target has run.
    path: undefined,
    ...madeChains,
  };

  if (params.length > 0) {
    result.params = params;
  }

  if (actions.length > 0) {
    result.actions = actions;
  }

  return {
    id: result.id,
    result: reportTargetNotes(result, notes, options),
    written,
  };
}

/**
 * Say what loading a preset did, when there's anything to say: why it didn't
 * load, or that a new device took the old one's place.
 * @param notes - What the target's entry has to say, added to
 * @param outcome - What loading the preset did, if the call sent one
 */
function notePresetOutcome(
  notes: TargetNotes,
  outcome: PresetOutcome | undefined,
): void {
  if (outcome == null) {
    return;
  }

  if ("error" in outcome) {
    refuseTargetWork(notes, ["preset"], `preset not loaded: ${outcome.error}`);
  } else if (outcome.replaced) {
    noteTarget(
      notes,
      "the preset replaced the device with a new one (new id); any automation on the old device is gone",
    );
  }
}

/**
 * Name a target by where it sits now, keeping its entry's key order.
 * @param update - The target, whose entry is updated in place
 * @param update.id - Its id
 * @param update.result - Its entry
 * @param update.written - The container spelling it was named by, if any
 */
function renamePath({ id, result, written }: TargetUpdate): void {
  const { path } = pathField(LiveAPI.from(id), written);

  if (path == null) {
    delete result.path;
  } else {
    result.path = path;
  }
}

/**
 * Carry out the `toPath` move a call asked for.
 * @param target - The object being updated
 * @param type - Its Live API type
 * @param toPath - Where the call asked to move it
 * @param notes - What the target's entry has to say, added to
 * @returns Whether it moved, plus any chains the path made
 */
function moveTargetToPath(
  target: LiveAPI,
  type: string,
  toPath: string,
  notes: TargetNotes,
): TargetMove {
  if (isProducerPalDevice(target)) {
    refuseTargetWork(
      notes,
      ["toPath"],
      "the Producer Pal device cannot be moved",
    );

    return {};
  }

  if (isDeviceType(type)) {
    return moveDevice(target, toPath, notes);
  }

  if (type === "DrumChain") {
    moveDrumChainToPath([target], toPath, notes);

    return {};
  }

  // Only a chain is left: an updatable target is a device, a chain or a pad,
  // devices and DrumChains are handled above, and a pad never reaches here.
  refuseTargetWork(
    notes,
    ["toPath"],
    "a chain cannot be moved; move its devices instead",
  );

  return {};
}

/**
 * Move a device, noting why when it didn't move.
 * @param device - The device being moved
 * @param toPath - Where the call asked to move it
 * @param notes - What the device's entry has to say, added to
 * @returns Whether it moved, plus any chains the path made on the way
 */
function moveDevice(
  device: LiveAPI,
  toPath: string,
  notes: TargetNotes,
): TargetMove {
  const { outcome, reason, created } = moveDeviceToPath(
    device,
    toPath,
    device,
    toPath,
    notes,
  );

  // The move is skipped either way, and the rest of this update — and of the
  // batch — carries on.
  if (outcome === "unresolvable") {
    refuseTargetWork(notes, ["toPath"], `not moved: ${reason}`);
  } else if (outcome === "no-destination") {
    refuseTargetWork(
      notes,
      ["toPath"],
      `not moved: nothing at toPath "${toPath}"`,
    );
  } else if (outcome === "refused") {
    const explained = reason == null ? "" : `: ${reason}`;

    refuseTargetWork(notes, ["toPath"], `not moved to "${toPath}"${explained}`);
  }

  return {
    moved: outcome === "moved",
    ...(created == null ? {} : { created }),
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
  if (writtenPath == null) {
    return undefined;
  }

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
