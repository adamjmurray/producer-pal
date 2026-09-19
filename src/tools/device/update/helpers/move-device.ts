// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-message.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  carryChainMixer,
  chainMixerToCarry,
  sourceChain,
  warnIfChainMixerLeftBehind,
} from "#src/tools/shared/device/helpers/chain-mixer.ts";
import {
  ONE_INSTRUMENT_PER_CHAIN,
  deviceHasInstrument,
} from "#src/tools/shared/device/helpers/chain-info.ts";
import { nothingAtPath } from "#src/tools/shared/device/helpers/path/device-path-to-live-api.ts";
import {
  type InsertionPathResolution,
  resolveInsertionPath,
} from "#src/tools/shared/device/helpers/path/insertion-path.ts";
import { toLiveApiId } from "#src/tools/shared/helpers/live-api-values.ts";

/** What a device move did. The caller words "no-destination" and "refused":
 * only it knows the path the user asked for, since a duplicate's is adjusted
 * for its temp track. */
export type DeviceMoveOutcome =
  | "moved"
  | "no-destination"
  | "refused"
  | "unresolvable";

/** What a move did, and where it put the device. */
export interface DeviceMove {
  outcome: DeviceMoveOutcome;
  /** The container the device landed in, so a caller that has to name it
   * afterwards doesn't re-resolve toPath. Only a "moved" outcome has one. */
  container?: LiveAPI;
  /** Why the move didn't happen, spelled as the caller wrote it. Always on an
   * "unresolvable"; on a "refused" when the destination accounts for it. */
  reason?: string;
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
 * @returns What the move did, plus the container it landed in or why it didn't
 */
export function moveDeviceToPath(
  device: LiveAPI,
  toPath: string,
  source: LiveAPI | null = device,
  reportPath: string = toPath,
): DeviceMove {
  const destination = resolveMoveDestination(toPath, reportPath);

  if ("reason" in destination) {
    return { outcome: "unresolvable", reason: destination.reason };
  }

  return moveDeviceIntoContainer(device, destination, source, reportPath);
}

/**
 * Move a device into a container the caller already resolved. For a caller
 * that can only resolve a path once — a `c+` appends a chain every time.
 * @param device - LiveAPI device object
 * @param destination - The container, and the index in it (null appends)
 * @param destination.container - Where the device goes
 * @param destination.position - Index in the container, or null to append
 * @param source - As in moveDeviceToPath
 * @param reportPath - How to spell the destination in a warning
 * @returns What the move did, plus the container it landed in or why it didn't
 */
export function moveDeviceIntoContainer(
  device: LiveAPI,
  {
    container,
    position,
  }: Pick<InsertionPathResolution, "container" | "position">,
  source: LiveAPI | null,
  reportPath: string,
): DeviceMove {
  if (!container?.exists()) {
    return { outcome: "no-destination" };
  }

  if (isPastTheEnd(position, container, reportPath)) {
    return { outcome: "refused" };
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
    carryChainMixer(carry, container);
  } else if (source != null) {
    // Device duplication passes the real source alongside a temp copy; a plain
    // move leaves `source` defaulted to the device itself.
    warnIfChainMixerLeftBehind(chain, container, source.id !== device.id);
  }

  return { outcome: "moved", container };
}

/**
 * Whether a destination index is past where a device can go, warning if it is.
 *
 * Live takes 0 through the container's device count — count itself appends —
 * and ignores anything higher without a word, for a device arriving from
 * elsewhere and one moving within its own container alike.
 *
 * Nothing after the call can tell: `move_device` returns the position on
 * success and 1 on refusal, which a real move to index 1 matches, and the
 * arrival check reads the destination's device list, which already holds a
 * device that never left it.
 * @param position - Index the move is aimed at, or null to insert at the top
 * @param container - Where the device is headed
 * @param reportPath - How to spell the destination in the warning
 * @returns True when the move can't happen, having warned why
 */
function isPastTheEnd(
  position: number | null,
  container: LiveAPI,
  reportPath: string,
): boolean {
  if (position == null) {
    return false;
  }

  const count = container.getChildIds("devices").length;

  if (position <= count) {
    return false;
  }

  console.warn(
    `device not moved: "${reportPath}" is past the end of a container holding ${count} device${count === 1 ? "" : "s"}`,
  );

  return true;
}

/**
 * Resolve where a move should land. Resolution throws for a path that names
 * nothing a device can go in — a missing track or device, a chain in a Drum
 * Rack, a device that isn't a rack — so catch it here and hand the reason back.
 * @param toPath - Target path, as handed to the move
 * @param reportPath - How to spell it back to the caller
 * @returns The destination, or why the path didn't resolve
 */
function resolveMoveDestination(
  toPath: string,
  reportPath: string,
): InsertionPathResolution | { reason: string } {
  try {
    // Every caller here got the path from a `toPath` param, so name it that.
    const destination = resolveInsertionPath(toPath, "toPath");

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
 * Why Live turned a move down, when the destination says it plainly enough
 * @param device - The device that stayed put
 * @param container - Where it was headed
 * @returns The reason, or undefined when nothing obvious accounts for it
 */
function refusalReason(
  device: LiveAPI,
  container: LiveAPI,
): string | undefined {
  return deviceHasInstrument(device) &&
    container.someChild("devices", deviceHasInstrument)
    ? ONE_INSTRUMENT_PER_CHAIN
    : undefined;
}
