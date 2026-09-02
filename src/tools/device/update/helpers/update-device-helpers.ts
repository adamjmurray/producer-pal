// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-utils.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { noteNameToMidi } from "#src/shared/pitch.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  carryChainMixer,
  chainMixerToCarry,
  sourceChain,
  warnIfChainMixerLeftBehind,
} from "#src/tools/shared/device/helpers/chain-mixer-helpers.ts";
import { stripReturnSlotLetter } from "#src/tools/shared/validation/name-utils.ts";
import { targetLabel } from "#src/tools/shared/validation/object-path-for-api.ts";
import { deviceHasInstrument } from "#src/tools/shared/device/helpers/device-state-helpers.ts";
import {
  type InsertionPathResolution,
  resolveDrumPadFromPath,
  resolveInsertionPath,
  resolvePathToLiveApi,
} from "#src/tools/shared/device/helpers/path/device-path-helpers.ts";
import { toLiveApiId } from "#src/tools/shared/utils.ts";

// ============================================================================
// Device move helpers
// ============================================================================

/**
 * The pad a toPath names, when it names one in this rack. Resolution is by path
 * rather than by object so a toPath pointing at nothing (a track that doesn't
 * exist) is refused rather than read as "same rack".
 *
 * A chain or device below the pad ("t0/d0/pD1/c0", the spelling read-device
 * prints for a layered pad) still names that pad: the move is an in_note
 * re-map, so the pad is the only destination there is.
 *
 * A later pad segment ("t0/d0/pC1/c0/d0/pE1") names a nested rack's pad, and
 * that's the destination — it's a legal move whenever the nested rack is the
 * source's own.
 * @param toPath - Target drum pad path
 * @param drumRackPath - Live API path of the rack holding the source chain
 * @returns The pad's note name, "*" for the catch-all pad, or null once the
 *   reason it can't be the destination has been warned
 */
function targetPadNote(toPath: string, drumRackPath: string): string | null {
  const resolved = resolvePadPath(toPath);

  if (resolved?.drumPadNote == null) {
    console.warn(`toPath "${toPath}" is not a drum pad path`);

    return null;
  }

  const { liveApiPath, drumPadNote, remainingSegments } = resolved;
  const nested = lastPadIndex(remainingSegments);
  const pad =
    nested < 0
      ? { rackPath: liveApiPath, note: drumPadNote }
      : nestedPad(liveApiPath, drumPadNote, remainingSegments, nested);

  // The move is an in_note re-map within one rack, so a toPath naming a pad
  // elsewhere can't be honored. Without this it lands on that note in the
  // SOURCE rack instead — the wrong pad, reported as a success.
  if (pad?.rackPath !== drumRackPath) {
    console.warn(
      `toPath "${toPath}" does not name a pad in this rack, and a pad move stays within one rack; ` +
        `move the pad's device instead (update-device on the device path)`,
    );

    return null;
  }

  return pad.note;
}

/**
 * Where the last pad segment sits, so a nested rack's pad is read as the
 * destination rather than the outer pad the path opens with.
 * @param segments - Segments after the first pad
 * @returns Its index, or -1 when no pad follows
 */
function lastPadIndex(segments: string[]): number {
  for (let index = segments.length - 1; index >= 0; index--) {
    if (segments[index]?.startsWith("p")) return index;
  }

  return -1;
}

/**
 * The pad a nested rack's pad segment names. Path resolution stops at the first
 * pad, so the rack holding a later one is only findable by walking the live
 * objects between them.
 * @param liveApiPath - Live API path of the outermost rack
 * @param drumPadNote - Its pad the path opens with
 * @param segments - Segments after that pad
 * @param padIndex - Index of the last pad segment
 * @returns The nested rack's path and the pad's note, or null when the path
 *   reaches no rack
 */
function nestedPad(
  liveApiPath: string,
  drumPadNote: string,
  segments: string[],
  padIndex: number,
): { rackPath: string; note: string } | null {
  const { target, targetType } = resolveDrumPadFromPath(
    liveApiPath,
    drumPadNote,
    segments.slice(0, padIndex),
  );

  return target == null || targetType !== "device"
    ? null
    : { rackPath: target.path, note: (segments[padIndex] as string).slice(1) };
}

/**
 * Resolve a pad toPath, treating a path that doesn't parse as naming no pad.
 * @param toPath - Target drum pad path
 * @returns The resolved path, or null when it doesn't resolve
 */
function resolvePadPath(toPath: string) {
  try {
    return resolvePathToLiveApi(toPath, "toPath");
  } catch {
    return null;
  }
}

/**
 * What a device move did. The caller words "no-destination" and "refused",
 * because only it knows the path the user asked for — a duplicate's is adjusted
 * for its temp track. "unresolvable" is worded here, where the reason is.
 */
export type DeviceMoveOutcome =
  | "moved"
  | "no-destination"
  | "refused"
  | "unresolvable";

/**
 * Move a device to a new location. Never throws: a toPath naming no place a
 * device can go warns and reports "unresolvable", so the other ids and
 * destinations of the same call still get their work done.
 * @param device - LiveAPI device object
 * @param toPath - Target path
 * @param source - The device the user is really moving or copying, when
 *   `device` is a temp copy of it (device duplication); drives the
 *   left-behind chain mixer warning
 * @param reportPath - How to spell toPath in warnings, when the caller adjusted
 *   it (device duplication shifts track indices past its temp track)
 * @returns "moved" once the device is at the destination, "no-destination" when
 *   toPath names nothing, "refused" when Live wouldn't take it, or
 *   "unresolvable" when toPath doesn't resolve at all
 */
export function moveDeviceToPath(
  device: LiveAPI,
  toPath: string,
  source: LiveAPI = device,
  reportPath: string = toPath,
): DeviceMoveOutcome {
  const destination = resolveMoveDestination(toPath, reportPath);

  if (destination == null) {
    return "unresolvable";
  }

  const { container, position } = destination;

  if (!container?.exists()) {
    return "no-destination";
  }

  // Read the chain before the move: on a plain move the source is the device
  // itself, and afterward it answers with the chain it landed in.
  const chain = sourceChain(source);

  // Decide before the move: afterward the destination holds this device, so it
  // no longer reads as the untouched chain that makes carrying safe.
  const carry = chainMixerToCarry(chain, container);

  const liveSet = LiveAPI.from(livePath.liveSet);

  liveSet.call(
    "move_device",
    toLiveApiId(device.id),
    toLiveApiId(container.id),
    position ?? 0,
  );

  // Live drops some moves without a word. Check rather than assume: the device
  // is still wherever it was, and reporting its id would name a device that
  // never arrived — for a duplicate, one the cleanup is about to delete.
  if (!container.getChildIds("devices").includes(toLiveApiId(device.id))) {
    console.warn(
      `Live refused the move of ${targetLabel(device)}${refusalReason(device, container)}`,
    );

    return "refused";
  }

  if (carry != null) {
    carryChainMixer(carry, container);
  } else {
    // Device duplication passes the real source alongside a temp copy; a plain
    // move leaves `source` defaulted to the device itself.
    warnIfChainMixerLeftBehind(chain, container, source.id !== device.id);
  }

  return "moved";
}

/**
 * Resolve where a move should land. Resolution throws for a path that names
 * nothing a device can go in — a missing track or device, a chain in a Drum
 * Rack, a device that isn't a rack — so catch it here and warn instead.
 * @param toPath - Target path, as handed to the move
 * @param reportPath - How to spell it in the warning
 * @returns The destination, or null when the path didn't resolve
 */
function resolveMoveDestination(
  toPath: string,
  reportPath: string,
): InsertionPathResolution | null {
  try {
    // Every caller here got the path from a `toPath` param, so name it that.
    return resolveInsertionPath(toPath, "toPath");
  } catch (error) {
    const reason = errorMessage(error);

    console.warn(
      `device not moved: ${toPath === reportPath ? reason : reason.replaceAll(toPath, reportPath)}`,
    );

    return null;
  }
}

/**
 * Why Live turned a move down, when the destination says it plainly enough
 * @param device - The device that stayed put
 * @param container - Where it was headed
 * @returns Explanatory clause, or "" when nothing obvious accounts for it
 */
function refusalReason(device: LiveAPI, container: LiveAPI): string {
  return deviceHasInstrument(device) &&
    container.someChild("devices", deviceHasInstrument)
    ? ": the destination already has an instrument, and only one is allowed"
    : "";
}

/**
 * Move a drum chain to a different pad by updating in_note
 * @param chain - LiveAPI drum chain object
 * @param toPath - Target drum pad path
 * @param moveEntirePad - If true, move all chains with same in_note
 */
export function moveDrumChainToPath(
  chain: LiveAPI,
  toPath: string,
  moveEntirePad: boolean,
): void {
  const drumRackPath = chain.path.replace(/ chains \d+$/, "");
  const targetNote = targetPadNote(toPath, drumRackPath);

  if (targetNote == null) {
    return;
  }

  // The path grammar refuses a note name with no MIDI value, so the only pad
  // that isn't a note is the catch-all. Live 12.4.3 clamps a drum chain's
  // in_note to 0-127, so the move can't happen and Live would refuse it
  // silently — say so instead of reporting a no-op as a move.
  if (targetNote === "*") {
    console.warn(
      `updateDevice: cannot move a drum chain to the catch-all pad "${toPath}" — ` +
        `Live has no way to set a chain to "all notes"`,
    );

    return;
  }

  const targetInNote = noteNameToMidi(targetNote) as number;

  const sourceInNote = chain.getProperty("in_note") as number;
  const rackChains = LiveAPI.from(drumRackPath).getChildren("chains");
  const inNotes = rackChains.map((c) => c.getProperty("in_note") as number);

  warnIfDestinationOccupied(toPath, inNotes, sourceInNote, targetInNote);

  if (moveEntirePad) {
    for (const [index, c] of rackChains.entries()) {
      if (inNotes[index] === sourceInNote) {
        c.set("in_note", targetInNote);
      }
    }
  } else {
    chain.set("in_note", targetInNote);
  }
}

/**
 * Live layers a moved chain onto whatever the destination pad already holds
 * rather than replacing it, so the pad ends up playing both. Say so — the
 * caller asked for a move and would otherwise read the result as a swap.
 * @param toPath - Destination pad path as written, for the warning
 * @param inNotes - Every rack chain's in_note, in rack order
 * @param sourceInNote - The moving chain's in_note
 * @param targetInNote - The destination pad's in_note
 */
function warnIfDestinationOccupied(
  toPath: string,
  inNotes: number[],
  sourceInNote: number,
  targetInNote: number,
): void {
  if (targetInNote === sourceInNote) return;

  const occupants = inNotes.filter((note) => note === targetInNote).length;

  if (occupants === 0) return;

  console.warn(
    `updateDevice: drum pad "${toPath}" already had ${occupants} chain(s), ` +
      `so the move layers on top of them rather than replacing them`,
  );
}

// ============================================================================
// Collapsed state — kept for potential future use
// ============================================================================

// export function updateCollapsedState(
//   device: LiveAPI,
//   collapsed: boolean,
// ): void {
//   const deviceView = LiveAPI.from(`${device.path} view`);
//   if (deviceView.exists()) {
//     deviceView.set("is_collapsed", collapsed ? 1 : 0);
//   }
// }

// Parameter values are handled in update-device-param-setters.ts
export { setParamValues } from "../update-device-param-setters.ts";

// ============================================================================
// Macro variations
// ============================================================================

/**
 * Update macro variation state for rack devices
 * @param device - Live API device object
 * @param action - Variation action: create, load, delete, revert, randomize
 * @param index - Variation index for load/delete (0-based)
 */
export function updateMacroVariation(
  device: LiveAPI,
  action?: string,
  index?: number,
): void {
  const canHaveChains = device.getProperty("can_have_chains");

  if (!canHaveChains) {
    console.warn(
      `updateDevice: macro variations only available on rack devices; skipping ${targetLabel(device)}`,
    );

    return;
  }

  if (!validateMacroVariationParams(action, index)) {
    return;
  }

  warnIfIndexIgnored(action, index);

  if (!setVariationIndex(device, action, index)) {
    return;
  }

  executeMacroVariationAction(device, action);
}

/**
 * Validate macro variation parameter combinations
 * @param action - Variation action
 * @param index - Variation index
 * @returns True if parameters are valid
 */
function validateMacroVariationParams(
  action: string | undefined,
  index: number | undefined,
): boolean {
  if (index != null && action == null) {
    console.warn(
      "updateDevice: macroVariationIndex requires macroVariation 'load' or 'delete'",
    );

    return false;
  }

  if ((action === "load" || action === "delete") && index == null) {
    console.warn(
      `updateDevice: macroVariation '${action}' requires macroVariationIndex`,
    );

    return false;
  }

  return true;
}

/**
 * Warn if index parameter is ignored for this action
 * @param action - Variation action
 * @param index - Variation index
 */
function warnIfIndexIgnored(
  action: string | undefined,
  index: number | undefined,
): void {
  if (index == null) {
    return;
  }

  if (action === "create") {
    console.warn(
      "updateDevice: macroVariationIndex ignored for 'create' (variations always appended)",
    );
  } else if (action === "revert") {
    console.warn("updateDevice: macroVariationIndex ignored for 'revert'");
  } else if (action === "randomize") {
    console.warn("updateDevice: macroVariationIndex ignored for 'randomize'");
  }
}

/**
 * Set the selected variation index on device
 * @param device - Rack device
 * @param action - Variation action
 * @param index - Variation index to select
 * @returns True if successful
 */
function setVariationIndex(
  device: LiveAPI,
  action: string | undefined,
  index: number | undefined,
): boolean {
  if ((action !== "load" && action !== "delete") || index == null) {
    return true;
  }

  const variationCount = device.getProperty("variation_count") as number;

  if (index >= variationCount) {
    console.warn(
      `updateDevice: variation index ${index} out of range on ${targetLabel(device)} (${variationCount} available)`,
    );

    return false;
  }

  device.set("selected_variation_index", index);

  return true;
}

/**
 * Execute the macro variation action on device
 * @param device - Rack device
 * @param action - Action to execute
 */
function executeMacroVariationAction(
  device: LiveAPI,
  action: string | undefined,
): void {
  switch (action) {
    case "create":
      device.call("store_variation");
      break;
    case "load":
      device.call("recall_selected_variation");
      break;
    case "revert":
      device.call("recall_last_used_variation");
      break;
    case "delete":
      device.call("delete_selected_variation");
      break;
    case "randomize":
      device.call("randomize_macros");
      break;
  }
}

// ============================================================================
// Macro count
// ============================================================================

/**
 * Update visible macro count for rack devices.
 * Macros are added/removed in pairs, so odd counts are rounded up to the next even.
 * @param device - Live API device object
 * @param targetCount - Target number of visible macros (0-16)
 */
export function updateMacroCount(device: LiveAPI, targetCount: number): void {
  const canHaveChains = device.getProperty("can_have_chains");

  if (!canHaveChains) {
    console.warn(
      `updateDevice: macro count only available on rack devices; skipping ${targetLabel(device)}`,
    );

    return;
  }

  // Macros are added/removed in pairs - round up odd numbers to next even
  let effectiveTarget = targetCount;

  if (targetCount % 2 !== 0) {
    effectiveTarget = Math.min(targetCount + 1, 16);
    console.warn(
      `updateDevice: macro count on ${targetLabel(device)} rounded from ${targetCount} to ${effectiveTarget} (macros come in pairs)`,
    );
  }

  const currentCount = device.getProperty("visible_macro_count") as number;
  const diff = effectiveTarget - currentCount;
  const pairCount = Math.abs(diff) / 2;

  if (diff > 0) {
    for (let i = 0; i < pairCount; i++) {
      device.call("add_macro");
    }
  } else if (diff < 0) {
    for (let i = 0; i < pairCount; i++) {
      device.call("remove_macro");
    }
  }
}

// ============================================================================
// A/B Compare
// ============================================================================

/**
 * Update A/B Compare state for devices that support it
 * @param device - Live API device object
 * @param action - "a", "b", or "save"
 */
export function updateABCompare(device: LiveAPI, action: string): void {
  const canCompareAB = device.getProperty("can_compare_ab");

  if (!canCompareAB) {
    console.warn(
      `updateDevice: A/B Compare not available on ${targetLabel(device)}`,
    );

    return;
  }

  switch (action) {
    case "a":
      device.set("is_using_compare_preset_b", 0);
      break;
    case "b":
      device.set("is_using_compare_preset_b", 1);
      break;
    case "save":
      device.call("save_preset_to_compare_ab_slot");
      break;
  }
}

/**
 * Live prepends a rack return chain's send letter to its name, so writing back
 * the name read-device reported ("F Pedal") would double it ("F F Pedal").
 * @param chain - The chain being renamed
 * @param name - Requested name
 * @returns Name to write
 */
export function stripReturnChainLetter(chain: LiveAPI, name: string): string {
  return stripReturnSlotLetter(chain.path, name, /return_chains (\d+)$/, " ");
}
