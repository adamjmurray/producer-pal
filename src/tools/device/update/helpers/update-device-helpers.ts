// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-utils.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
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
  resolveInsertionPath,
} from "#src/tools/shared/device/helpers/path/device-path-helpers.ts";
import { toLiveApiId } from "#src/tools/shared/utils.ts";

// ============================================================================
// Device move helpers
// ============================================================================

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
      `macro variations only available on rack devices; skipping ${targetLabel(device)}`,
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
      "macroVariationIndex requires macroVariation 'load' or 'delete'",
    );

    return false;
  }

  if ((action === "load" || action === "delete") && index == null) {
    console.warn(`macroVariation '${action}' requires macroVariationIndex`);

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
      "macroVariationIndex ignored for 'create' (variations always appended)",
    );
  } else if (action === "revert") {
    console.warn("macroVariationIndex ignored for 'revert'");
  } else if (action === "randomize") {
    console.warn("macroVariationIndex ignored for 'randomize'");
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
      `variation index ${index} out of range on ${targetLabel(device)} (${variationCount} available)`,
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
      `macro count only available on rack devices; skipping ${targetLabel(device)}`,
    );

    return;
  }

  // Macros are added/removed in pairs - round up odd numbers to next even
  let effectiveTarget = targetCount;

  if (targetCount % 2 !== 0) {
    effectiveTarget = Math.min(targetCount + 1, 16);
    console.warn(
      `macro count on ${targetLabel(device)} rounded from ${targetCount} to ${effectiveTarget} (macros come in pairs)`,
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
    console.warn(`A/B Compare not available on ${targetLabel(device)}`);

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
