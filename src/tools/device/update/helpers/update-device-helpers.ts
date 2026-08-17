// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { livePath } from "#src/shared/live-api-path-builders.ts";
import { noteNameToMidi } from "#src/shared/pitch.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import {
  carryChainMixer,
  chainMixerToCarry,
  warnIfChainMixerLeftBehind,
} from "#src/tools/shared/device/helpers/chain-mixer-helpers.ts";
import {
  resolveInsertionPath,
  resolvePathToLiveApi,
} from "#src/tools/shared/device/helpers/path/device-path-helpers.ts";
import { toLiveApiId } from "#src/tools/shared/utils.ts";

// ============================================================================
// Device move helpers
// ============================================================================

/**
 * Parse drum pad note from a path
 * @param path - Path that may contain a drum pad segment
 * @returns Note name (e.g., "C1", "F#2") or null if not a drum pad path
 */
function parseDrumPadNoteFromPath(path: string): string | null {
  const match = path.match(/\/p([A-G][#b]?\d+|\*)(?:\/|$)/);

  return match ? (match[1] ?? null) : null;
}

/**
 * Whether a pad path names the rack the chain already lives in. Resolution is
 * by path rather than by object so a toPath pointing at nothing (a track that
 * doesn't exist) is refused rather than read as "same rack".
 * @param toPath - Target drum pad path
 * @param drumRackPath - Live API path of the rack holding the source chain
 * @returns True when toPath's rack is that same rack
 */
function targetsSameRack(toPath: string, drumRackPath: string): boolean {
  try {
    return resolvePathToLiveApi(toPath, "toPath").liveApiPath === drumRackPath;
  } catch {
    // A path that doesn't parse can't be shown to name this rack.
    return false;
  }
}

/**
 * Move a device to a new location
 * @param device - LiveAPI device object
 * @param toPath - Target path
 * @param source - The device the user is really moving or copying, when
 *   `device` is a temp copy of it (device duplication); drives the
 *   left-behind chain mixer warning
 * @returns false when the destination doesn't exist, so the caller can report
 *   it in its own terms; true once the device has moved
 */
export function moveDeviceToPath(
  device: LiveAPI,
  toPath: string,
  source: LiveAPI = device,
): boolean {
  // Every caller here got the path from a `toPath` param, so name it that.
  const { container, position } = resolveInsertionPath(toPath, "toPath");

  if (!container?.exists()) {
    return false;
  }

  // Decide before the move: afterward the destination holds this device, so it
  // no longer reads as the untouched chain that makes carrying safe.
  const carry = chainMixerToCarry(source, container);

  // Device duplication passes the real source alongside a temp copy; a plain
  // move leaves `source` defaulted to the device itself.
  if (carry == null) {
    warnIfChainMixerLeftBehind(source, container, source.id !== device.id);
  }

  const liveSet = LiveAPI.from(livePath.liveSet);

  liveSet.call(
    "move_device",
    toLiveApiId(device.id),
    toLiveApiId(container.id),
    position ?? 0,
  );

  if (carry != null) {
    carryChainMixer(carry, container);
  }

  return true;
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
  const targetNote = parseDrumPadNoteFromPath(toPath);

  if (targetNote == null) {
    console.warn(`toPath "${toPath}" is not a drum pad path`);

    return;
  }

  const targetInNote = targetNote === "*" ? -1 : noteNameToMidi(targetNote);

  if (targetInNote == null) {
    console.warn(`invalid note "${targetNote}" in toPath`);

    return;
  }

  const drumRackPath = chain.path.replace(/ chains \d+$/, "");

  // The move is an in_note re-map within one rack, so a toPath naming a pad
  // elsewhere can't be honored. Without this it lands on that note in the
  // SOURCE rack instead — the wrong pad, reported as a success.
  if (!targetsSameRack(toPath, drumRackPath)) {
    console.warn(
      `toPath "${toPath}" does not name a pad in this rack, and a pad move stays within one rack; ` +
        `move the pad's device instead (update-device on the device path)`,
    );

    return;
  }

  if (moveEntirePad) {
    const sourceInNote = chain.getProperty("in_note");
    const drumRack = LiveAPI.from(drumRackPath);
    const allChains = drumRack.getChildren("chains");

    for (const c of allChains) {
      if (c.getProperty("in_note") === sourceInNote) {
        c.set("in_note", targetInNote);
      }
    }
  } else {
    chain.set("in_note", targetInNote);
  }
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
      "updateDevice: macro variations only available on rack devices",
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
      `updateDevice: variation index ${index} out of range (${variationCount} available)`,
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
    console.warn("updateDevice: macro count only available on rack devices");

    return;
  }

  // Macros are added/removed in pairs - round up odd numbers to next even
  let effectiveTarget = targetCount;

  if (targetCount % 2 !== 0) {
    effectiveTarget = Math.min(targetCount + 1, 16);
    console.warn(
      `updateDevice: macro count rounded from ${targetCount} to ${effectiveTarget} (macros come in pairs)`,
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
    console.warn("updateDevice: A/B Compare not available on this device");

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
 * Strip a leading letter when it matches the chain's own slot.
 * @param chain - The chain being renamed
 * @param name - Requested name
 * @returns Name to write
 */
export function stripReturnChainLetter(chain: LiveAPI, name: string): string {
  const match = /return_chains (\d+)$/.exec(chain.path);

  if (match == null) {
    return name;
  }

  const index = Number(match[1]);

  // Past Z we don't know what Live labels the chain, so leave the name alone.
  if (index > 25) {
    return name;
  }

  const prefix = `${String.fromCharCode(65 + index)} `;

  return name.toUpperCase().startsWith(prefix)
    ? name.slice(prefix.length)
    : name;
}
