// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { errorMessage } from "#src/shared/error-message.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import {
  carryChainMixer,
  chainMixerToCarry,
  noteChainMixerLeftBehind,
  sourceChain,
} from "#src/tools/shared/device/helpers/chain-mixer/chain-mixer-carry.ts";
import { type TargetNotes } from "#src/tools/shared/helpers/target-notes.ts";
import {
  loadedDeviceKind,
  misfitReason,
  newChainMisfitReason,
} from "#src/tools/shared/device/helpers/path/device-fit.ts";
import {
  ONE_INSTRUMENT_PER_CHAIN,
  isInstrumentTyped,
} from "#src/tools/shared/device/helpers/chain-info.ts";
import {
  checkInsertionPath,
  pastTheEndReason,
  type InsertionPathResolution,
  resolveInsertionPath,
} from "#src/tools/shared/device/helpers/path/insertion-path.ts";
import { nothingAtPath } from "#src/tools/shared/device/helpers/path/device-path-to-live-api.ts";
import { pathPrefix } from "#src/tools/shared/validation/object-path-for-api.ts";
import { type DryWalk } from "#src/tools/shared/device/helpers/chain-auto-creation.ts";
import { toLiveApiId } from "#src/tools/shared/helpers/live-api-values.ts";

/** What a device move did. The caller words "no-destination" and "refused":
 * only it knows the path the user asked for, since a duplicate's is adjusted
 * for its temp track. */
export type DeviceMoveOutcome =
  | "moved"
  | "no-destination"
  | "refused"
  | "unresolvable";

/** What a move did. */
export interface DeviceMove {
  outcome: DeviceMoveOutcome;
  /** Why the move didn't happen, spelled as the caller wrote it. Always on an
   * "unresolvable" and on a "refused". */
  reason?: string;
  /** The rack chains toPath had to make first ("c2-c3"), when it made any.
   * Only on a move that went through; a failed one names them in `madeChains`. */
  created?: string;
  /** Every chain toPath made, the `c+` one included, when the move did not go
   * through. They stay in the Set empty, so the caller names them in its own
   * words with `withChainsLeft`. */
  madeChains?: string;
}

/**
 * Move a device to a new location. Never throws: a toPath naming no place a
 * device can go reports "unresolvable" and why, so the other ids and
 * destinations of the same call still get their work done.
 * @param device - LiveAPI device object
 * @param toPath - Target path
 * @param source - The device really being moved or copied, when `device` is a
 *   temp copy of it (device duplication); drives the left-behind chain mixer
 *   warning. Null when the source chain's mixer is already on the destination
 *   (chain duplication), so there is nothing here to carry or warn about
 * @param reportPath - How to spell toPath back, when the caller adjusted it
 *   (device duplication shifts track indices past its temp track)
 * @param notes - What the device's entry has to say, added to; left out where
 *   the caller keeps no entry for this move
 * @returns What the move did, and why it didn't when it didn't
 */
export function moveDeviceToPath(
  device: LiveAPI,
  toPath: string,
  source: LiveAPI | null = device,
  reportPath: string = toPath,
  notes?: TargetNotes,
): DeviceMove {
  const destination = resolveMoveDestination(
    toPath,
    reportPath,
    resolveInsertionPath,
  );

  if ("reason" in destination) {
    return { outcome: "unresolvable", reason: destination.reason };
  }

  const move = moveDeviceIntoContainer(
    device,
    destination,
    source,
    reportPath,
    notes,
  );

  if (move.outcome !== "moved") {
    return destination.madeChains == null
      ? move
      : { ...move, madeChains: destination.madeChains };
  }

  return destination.createdChains == null
    ? move
    : { ...move, created: destination.createdChains };
}

/**
 * Whether a device could be moved to a path, found out without making
 * anything: no chain is made and nothing moves. Answers what moveDeviceToPath
 * would, in the same words, for what is known beforehand: a path naming no
 * place, a chain that can't be made, an index past the end, and a kind of device
 * the place won't take (when Live gives the device a kind). Left to the move: a
 * second instrument, which only Live's refusal shows, and a chain on a drum pad,
 * which only a write can tell about.
 * @param device - The device to move, or the one copied
 * @param toPath - Target path
 * @returns Why the move would not happen, or null when nothing says it won't
 */
export function checkMoveDestination(
  device: LiveAPI,
  toPath: string,
): DeviceMove | null {
  const destination = resolveMoveDestination(
    toPath,
    toPath,
    checkInsertionPath,
  );

  if ("reason" in destination) {
    return { outcome: "unresolvable", reason: destination.reason };
  }

  const { container, position } = destination;

  if (destination.undetermined) {
    return null;
  }

  // A chain the path would make holds nothing, and takes what its rack takes.
  if (destination.makesChain) {
    return refusalOf(
      pastTheEndReason(position, 0, toPath) ??
        newChainMisfit(device, destination.newChain),
    );
  }

  if (!container?.exists()) {
    return { outcome: "no-destination" };
  }

  return refusalOf(
    pastTheEndReason(
      position,
      container.getChildIds("devices").length,
      toPath,
    ) ??
      (loadedDeviceKind(device) == null ? null : misfitOf(device, container)),
  );
}

/**
 * Move a device into a container the caller already resolved. For a caller
 * that can only resolve a path once — a `c+` appends a chain every time.
 * @param device - LiveAPI device object
 * @param destination - The container, and the index in it (null appends)
 * @param destination.container - Where the device goes
 * @param destination.position - Index in the container, or null to append
 * @param source - As in moveDeviceToPath
 * @param reportPath - How to spell the destination back to the caller
 * @param notes - As in moveDeviceToPath
 * @returns What the move did, and why it didn't when it didn't
 */
export function moveDeviceIntoContainer(
  device: LiveAPI,
  {
    container,
    position,
  }: Pick<InsertionPathResolution, "container" | "position">,
  source: LiveAPI | null,
  reportPath: string,
  notes?: TargetNotes,
): DeviceMove {
  if (!container?.exists()) {
    return { outcome: "no-destination" };
  }

  const pastTheEnd = pastTheEndReason(
    position,
    container.getChildIds("devices").length,
    reportPath,
  );

  if (pastTheEnd != null) {
    return { outcome: "refused", reason: pastTheEnd };
  }

  // Read the chain before the move: on a plain move the source is the device
  // itself, and afterward it answers with the chain it landed in. No source
  // means the chain's mixer is already on the destination, so there is no
  // chain here to carry from or name.
  const chain = source == null ? null : sourceChain(source);

  // Decide before the move: afterward the destination holds this device, so it
  // no longer reads as the untouched chain that makes carrying safe.
  const carry = chainMixerToCarry(chain, container);

  const liveSet = LiveAPI.from(livePath.liveSet);

  liveSet.call(
    "move_device",
    toLiveApiId(device.id),
    toLiveApiId(container.id),
    // `move_device` always takes an index, so a path that names no slot ("d+"
    // or a bare container) spells the end out: Live takes the device count
    // itself as "append", which is where create-device puts one too.
    position ?? container.getChildIds("devices").length,
  );

  // Live drops some moves without a word. Check rather than assume: the device
  // is still wherever it was, and reporting its id would name a device that
  // never arrived — for a duplicate, one the cleanup is about to delete.
  if (!container.getChildIds("devices").includes(toLiveApiId(device.id))) {
    return { outcome: "refused", reason: refusalReason(device, container) };
  }

  if (carry != null) {
    carryChainMixer(carry, container, notes);
  } else if (source != null) {
    // Device duplication passes the real source alongside a temp copy; a plain
    // move leaves `source` defaulted to the device itself.
    noteChainMixerLeftBehind(chain, container, source.id !== device.id, notes);
  }

  return { outcome: "moved" };
}

/**
 * Resolve where a move should land. Resolution throws for a path that names
 * nothing a device can go in — a missing track or device, a chain in a Drum
 * Rack, a device that isn't a rack — so catch it here and hand the reason back.
 * @param toPath - Target path, as handed to the move
 * @param reportPath - How to spell it back to the caller
 * @param resolve - How to resolve it: making what it needs, or only checking
 * @returns The destination, or why the path didn't resolve
 */
function resolveMoveDestination<T extends InsertionPathResolution>(
  toPath: string,
  reportPath: string,
  resolve: (path: string, label: string) => T,
): T | { reason: string } {
  try {
    // Every caller here got the path from a `toPath` param, so name it that.
    const destination = resolve(toPath, "toPath");

    return destination.namesNothing == null
      ? destination
      : spelledForCaller(
          nothingAtPath(toPath, destination.namesNothing, "toPath"),
          toPath,
          reportPath,
        );
  } catch (error) {
    return spelledForCaller(errorMessage(error), toPath, reportPath);
  }
}

/**
 * A reason worded for the path the caller wrote, which a duplication's temp
 * track shifted out from under the move.
 * @param reason - Why the destination didn't resolve
 * @param toPath - The path the move was aimed at
 * @param reportPath - How to spell it back to the caller
 * @returns The reason, respelled
 */
function spelledForCaller(
  reason: string,
  toPath: string,
  reportPath: string,
): { reason: string } {
  return {
    reason:
      toPath === reportPath ? reason : reason.replaceAll(toPath, reportPath),
  };
}

/**
 * Why Live turned a move down, when the destination says it plainly enough: a
 * place that takes only some kinds of device, or a second instrument
 * @param device - The device that stayed put
 * @param container - Where it was headed
 * @returns The reason, or undefined when nothing obvious accounts for it
 */
function refusalReason(
  device: LiveAPI,
  container: LiveAPI,
): string | undefined {
  return (
    misfitOf(device, container) ??
    (isInstrumentTyped(device) &&
    container.someChild("devices", isInstrumentTyped)
      ? ONE_INSTRUMENT_PER_CHAIN
      : undefined)
  );
}

/**
 * Why a place takes only some kinds of device, when this one isn't among them.
 * @param device - The device that is headed there
 * @param container - Where it is headed
 * @returns The reason, or null when the place takes it
 */
function misfitOf(device: LiveAPI, container: LiveAPI): string | null {
  return misfitReason(
    deviceNameOf(device),
    loadedDeviceKind(device),
    container,
  );
}

// What a misfit calls a device: its class name, else the name it has.
function deviceNameOf(device: LiveAPI): string {
  return (
    (device.getProperty("class_display_name") as string | undefined) ??
    device.getName()
  );
}

/**
 * Why a chain not yet made won't take a device, when its rack won't have it.
 * @param device - The device that is headed there
 * @param newChain - The rack the chain would be made in, and its index
 * @returns The reason, or null when it would take it, or the device has no kind
 */
function newChainMisfit(
  device: LiveAPI,
  newChain: DryWalk["newChain"],
): string | null {
  const kind = loadedDeviceKind(device);

  if (newChain == null || kind == null) {
    return null;
  }

  return newChainMisfitReason(
    deviceNameOf(device),
    kind,
    newChain.rack,
    `${pathPrefix(newChain.rack)}/c${newChain.index}`,
  );
}

/**
 * A move refused for a reason, or no refusal when there is none.
 * @param reason - Why the move would be refused
 * @returns The refusal, or null
 */
function refusalOf(reason: string | null): DeviceMove | null {
  return reason == null ? null : { outcome: "refused", reason };
}
