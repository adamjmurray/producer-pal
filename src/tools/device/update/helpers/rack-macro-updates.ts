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
 * @param index - Variation index, as the target it pairs with reads it
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

/** The most macros a rack shows. */
const MAX_MACRO_COUNT = 16;

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

  const target = evenMacroCount(targetCount, notes);
  // Read the mappings first: lowering the count may take them with it, and then
  // nothing is left to explain the count the rack settled on.
  const hadMappings = (device.getProperty("has_macro_mappings") as number) > 0;
  const before = device.getProperty("visible_macro_count") as number;
  const method = target > before ? "add_macro" : "remove_macro";

  for (let i = 0; i < Math.abs(target - before) / 2; i++) {
    device.call(method);
  }

  reportMacroCount(device, { before, target, hadMappings }, notes);
}

/** What one macroCount write asked for, and what the rack was before it. */
interface MacroCountWrite {
  before: number;
  target: number;
  hadMappings: boolean;
}

/**
 * The count to write, rounded up to the next even one: Live adds and removes
 * macros in pairs.
 * @param targetCount - The count the call asked for
 * @param notes - What this device's entry has to say, added to
 * @returns The even count
 */
function evenMacroCount(targetCount: number, notes: TargetNotes): number {
  if (targetCount % 2 === 0) {
    return targetCount;
  }

  const effective = Math.min(targetCount + 1, MAX_MACRO_COUNT);

  noteTarget(
    notes,
    `macroCount rounded from ${targetCount} to ${effective} (macros come in pairs)`,
  );

  return effective;
}

/**
 * Say what the count actually did, read back off the rack. Live keeps a mapped
 * macro visible, and whether lowering the count drops a mapping or is refused
 * outright is unverified — so the entry reports the count that landed rather
 * than either assumption.
 * @param device - The rack
 * @param write - What the write asked for, and what the rack was before it
 * @param write.before - The count the rack showed beforehand
 * @param write.target - The even count the write asked for
 * @param write.hadMappings - Whether a macro was mapped beforehand
 * @param notes - What this device's entry has to say, added to
 */
function reportMacroCount(
  device: LiveAPI,
  { before, target, hadMappings }: MacroCountWrite,
  notes: TargetNotes,
): void {
  const landed = device.getProperty("visible_macro_count") as number;

  if (landed !== target) {
    const why = hadMappings ? ": Live keeps a mapped macro visible" : "";

    noteTarget(notes, `macroCount landed at ${landed}, not ${target}${why}`);

    return;
  }

  if (hadMappings && landed < before) {
    noteTarget(
      notes,
      `macros ${landed + 1} to ${before} hidden; any mappings on them are gone`,
    );
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
