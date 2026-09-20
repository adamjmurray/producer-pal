// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type TargetNotes,
  noteTarget,
  refuseTargetWork,
} from "#src/tools/shared/helpers/target-notes.ts";

// ============================================================================
// Macro variations
// ============================================================================

/** The params a macro variation write asks with, refused together. */
const VARIATION_PARAMS = ["macroVariation", "macroVariationIndex"];

/**
 * Update macro variation state for rack devices
 * @param device - Live API device object
 * @param action - Variation action: create, load, delete, revert, randomize
 * @param index - Variation index for load/delete (0-based)
 * @param notes - What this device's entry has to say, added to
 */
export function updateMacroVariation(
  device: LiveAPI,
  action: string | undefined,
  index: number | undefined,
  notes: TargetNotes,
): void {
  const canHaveChains = device.getProperty("can_have_chains");

  if (!canHaveChains) {
    refuseTargetWork(
      notes,
      VARIATION_PARAMS,
      "macro variations are only available on rack devices",
    );

    return;
  }

  if (!setVariationIndex(device, action, index, notes)) {
    return;
  }

  executeMacroVariationAction(device, action);
}

/**
 * The reason a macroVariation/macroVariationIndex pair can't be read at all.
 * Nothing about a device decides it, so the call is refused before any of its
 * targets is touched (ADR-0035).
 * @param action - Variation action
 * @param index - Variation index
 * @returns The reason, or null when the pair is usable
 */
export function macroVariationParamsReason(
  action: string | undefined,
  index: number | undefined,
): string | null {
  if (index == null) {
    return action === "load" || action === "delete"
      ? `macroVariation '${action}' requires macroVariationIndex`
      : null;
  }

  if (action == null) {
    return "macroVariationIndex requires macroVariation 'load' or 'delete'";
  }

  return action === "load" || action === "delete"
    ? null
    : `macroVariationIndex does nothing for macroVariation '${action}' — ` +
        "only 'load' and 'delete' take one";
}

/**
 * Set the selected variation index on device
 * @param device - Rack device
 * @param action - Variation action
 * @param index - Variation index to select
 * @param notes - What this device's entry has to say, added to
 * @returns True if successful
 */
function setVariationIndex(
  device: LiveAPI,
  action: string | undefined,
  index: number | undefined,
  notes: TargetNotes,
): boolean {
  if ((action !== "load" && action !== "delete") || index == null) {
    return true;
  }

  const variationCount = device.getProperty("variation_count") as number;

  if (index >= variationCount) {
    refuseTargetWork(
      notes,
      VARIATION_PARAMS,
      `variation index ${index} is out of range (${variationCount} available)`,
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
 * @param notes - What this device's entry has to say, added to
 */
export function updateMacroCount(
  device: LiveAPI,
  targetCount: number,
  notes: TargetNotes,
): void {
  const canHaveChains = device.getProperty("can_have_chains");

  if (!canHaveChains) {
    refuseTargetWork(
      notes,
      ["macroCount"],
      "macroCount is only available on rack devices",
    );

    return;
  }

  // Macros are added/removed in pairs - round up odd numbers to next even
  let effectiveTarget = targetCount;

  if (targetCount % 2 !== 0) {
    effectiveTarget = Math.min(targetCount + 1, 16);
    noteTarget(
      notes,
      `macroCount rounded from ${targetCount} to ${effectiveTarget} (macros come in pairs)`,
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
 * @param notes - What this device's entry has to say, added to
 */
export function updateABCompare(
  device: LiveAPI,
  action: string,
  notes: TargetNotes,
): void {
  const canCompareAB = device.getProperty("can_compare_ab");

  if (!canCompareAB) {
    refuseTargetWork(notes, ["abCompare"], "A/B Compare is not available here");

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
