// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type MappedMacros } from "#src/tools/shared/device/rack-macro-mappings.ts";
import { refuseParamsOutsideAction } from "#src/tools/shared/schema/refuse-params-outside-action.ts";
import {
  type TargetNotes,
  noteLanded,
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

  executeMacroVariationAction(device, action, notes);
}

/**
 * Refuses a macroVariation/macroVariationIndex pair that can't be read at all.
 * Nothing about a device decides it, so the call is refused before any of its
 * targets is touched.
 * @param action - Variation action
 * @param index - Variation index
 * @throws Error when load/delete has no index, or an index sits beside another
 *   action
 */
export function refuseMacroVariationParams(
  action: string | undefined,
  index: number | undefined,
): void {
  if (index == null && (action === "load" || action === "delete")) {
    throw new Error(`macroVariation '${action}' requires macroVariationIndex`);
  }

  refuseParamsOutsideAction(
    { macroVariation: action },
    { macroVariationIndex: index },
    { macroVariationIndex: { macroVariation: ["load", "delete"] } },
  );
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
  noteLanded(notes, "variation index");

  return true;
}

/**
 * Execute the macro variation action on device
 * @param device - Rack device
 * @param action - Action to execute
 * @param notes - What this device's entry has to say, told what lands
 */
function executeMacroVariationAction(
  device: LiveAPI,
  action: string | undefined,
  notes: TargetNotes,
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

  noteLanded(notes, `macroVariation ${action}`);
}

// ============================================================================
// Macro count
// ============================================================================

/** The most macros a rack shows. */
const MAX_MACRO_COUNT = 16;

/**
 * Update visible macro count for rack devices.
 * Macros are added/removed in pairs, so odd counts are rounded up to the next even.
 * Lowering the count hides macros but keeps their mappings.
 * @param device - Live API device object
 * @param targetCount - Target number of visible macros (0-16)
 * @param notes - What this device's entry has to say, added to
 * @param mapped - Which macros were mapped, read before the call, when it was
 *   worth asking
 */
export function updateMacroCount(
  device: LiveAPI,
  targetCount: number,
  notes: TargetNotes,
  mapped?: MappedMacros,
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

  const target = evenMacroCount(targetCount);

  if (target !== targetCount) {
    noteTarget(
      notes,
      `macroCount rounded from ${targetCount} to ${target} (macros come in pairs)`,
    );
  }

  const hadMappings = (device.getProperty("has_macro_mappings") as number) > 0;
  const before = device.getProperty("visible_macro_count") as number;
  const method = target > before ? "add_macro" : "remove_macro";

  for (let i = 0; i < Math.abs(target - before) / 2; i++) {
    device.call(method);
    noteLanded(notes, "macroCount");
  }

  reportMacroCount(device, { before, target, hadMappings, mapped }, notes);
}

/**
 * Whether a macroCount write would hide macros that have mappings, so the call
 * should find out which before it writes.
 * @param device - The target device
 * @param targetCount - The count the call asked for
 * @returns True for a rack with mappings that the count would lower
 */
export function mayHideMappedMacros(
  device: LiveAPI,
  targetCount: number,
): boolean {
  const before = device.getProperty("visible_macro_count") as number;

  // Live never shows fewer than 1 macro, so from 1 there is nothing to hide.
  return (
    Boolean(device.getProperty("can_have_chains")) &&
    (device.getProperty("has_macro_mappings") as number) > 0 &&
    before > 1 &&
    evenMacroCount(targetCount) < before
  );
}

/** What one macroCount write asked for, and what the rack was before it. */
interface MacroCountWrite {
  before: number;
  target: number;
  hadMappings: boolean;
  mapped?: MappedMacros;
}

/**
 * The count to write, rounded up to the next even one: Live adds and removes
 * macros in pairs.
 * @param targetCount - The count the call asked for
 * @returns The even count
 */
function evenMacroCount(targetCount: number): number {
  return targetCount % 2 === 0
    ? targetCount
    : Math.min(targetCount + 1, MAX_MACRO_COUNT);
}

/**
 * Say what the count actually did, read back off the rack, and which mapped
 * macros it hid. Lowering the count hides macros and keeps their mappings, so
 * the entry says so rather than leaving a mapped macro to vanish silently.
 * @param device - The rack
 * @param write - What the write asked for, and what the rack was before it
 * @param write.before - The count the rack showed beforehand
 * @param write.target - The even count the write asked for
 * @param write.hadMappings - Whether a macro was mapped beforehand
 * @param write.mapped - Which macros were mapped beforehand, when known
 * @param notes - What this device's entry has to say, added to
 */
function reportMacroCount(
  device: LiveAPI,
  { before, target, hadMappings, mapped }: MacroCountWrite,
  notes: TargetNotes,
): void {
  const landed = device.getProperty("visible_macro_count") as number;

  if (landed !== target) {
    // Live stops at 1 macro: removing from 2 leaves 1, never 0.
    const why = target === 0 && landed === 1 ? "; Live keeps at least 1" : "";

    noteTarget(notes, `macroCount landed at ${landed}, not ${target}${why}`);
  }

  if (landed < before && hadMappings) {
    const hidden = hiddenMappingsNote({ landed, before }, mapped);

    if (hidden != null) {
      noteTarget(notes, hidden);
    }
  }
}

/**
 * Say which mapped macros the count hid, or as much as is known.
 * @param hidden - The macros the write hid: those above `landed`, up to `before`
 * @param hidden.landed - The count the rack ended up showing
 * @param hidden.before - The count it showed before
 * @param mapped - Which macros were mapped beforehand, when known
 * @returns The note, or undefined when the remote script found none hidden
 */
function hiddenMappingsNote(
  { landed, before }: { landed: number; before: number },
  mapped: MappedMacros | undefined,
): string | undefined {
  if (mapped != null && "mapped" in mapped) {
    const hidden = mapped.mapped.filter((n) => n > landed && n <= before);

    if (hidden.length === 0) {
      return undefined;
    }

    const kept = hidden.length === 1 ? "its mapping is" : "their mappings are";

    return `${listMacros(hidden)} hidden; ${kept} kept`;
  }

  const range =
    landed + 1 === before
      ? `macro ${before}`
      : `macros ${landed + 1} to ${before}`;
  const unknown =
    mapped == null
      ? ""
      : `. Which are mapped couldn't be checked: ${mapped.unreadable}`;

  return `${range} hidden; any mappings on them are kept${unknown}`;
}

/**
 * Name macros by number.
 * @param numbers - The macro numbers, in order
 * @returns "macro 7", "macros 5 and 7", "macros 1, 5 and 7"
 */
function listMacros(numbers: number[]): string {
  if (numbers.length === 1) {
    return `macro ${String(numbers[0])}`;
  }

  return `macros ${numbers.slice(0, -1).join(", ")} and ${String(numbers.at(-1))}`;
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

  noteLanded(notes, "abCompare");
}
