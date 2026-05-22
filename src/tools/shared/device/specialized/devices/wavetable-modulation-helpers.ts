// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";
import { coerceInt } from "../specialized-device-param-helpers.ts";

// Wavetable mod-matrix helpers. AJM-373. See
// dev/plans/Specialized-Device-Classes.md.
//
// Wavetable's modulation matrix is imperative: targets are registered by
// DeviceParameter reference, indexed by position, and cells are read/written
// via device.call("get/set_modulation_value", targetIndex, sourceIndex, amount).
//
// Source indices 0-12 are valid (13 sources total). No LOM property exposes
// source names — the index is passed directly by the caller and labelled as
// "source" in the output. Verified by probe: index 13+ returns sentinel 1.
//
// Matrix keyed by PARAMETER NAME (from get_modulation_target_parameter_name),
// not display label (visible_modulation_target_names).

/** Maximum valid source index (inclusive, probe-verified). */
const MAX_SOURCE_INDEX = 12;

/** Total source count = MAX_SOURCE_INDEX + 1 = 13. */
const SOURCE_COUNT = MAX_SOURCE_INDEX + 1;

/**
 * Resolve the target index for a named parameter in the modulation matrix.
 * Iterates `get_modulation_target_parameter_name` until the sentinel (number)
 * is returned. Returns -1 when the target is not found.
 * @param device - LiveAPI device object
 * @param target - Parameter name to find
 * @returns Target index (0-based), or -1 if not found
 */
export function resolveTargetIndex(device: LiveAPI, target: string): number {
  for (let i = 0; ; i++) {
    const name = device.call("get_modulation_target_parameter_name", i);

    // Sentinel: the LOM returns number 1 for out-of-range indices.
    if (typeof name === "number") {
      return -1;
    }

    if (name === target) {
      return i;
    }
  }
}

/**
 * Find a DeviceParameter child by name (checks getProperty("name") on each).
 * @param device - LiveAPI device object
 * @param name - Parameter name to find
 * @returns The matching LiveAPI parameter, or undefined
 */
export function findParamChild(
  device: LiveAPI,
  name: string,
): LiveAPI | undefined {
  const children = device.getChildren("parameters");

  return children.find((p) => p.getProperty("name") === name);
}

/**
 * Handle the setModulation action: write a modulation-matrix cell.
 * Auto-adds the target parameter when not yet registered.
 *
 * Args: [target: string, source: int 0-12, amount: float]
 * Source is an integer index (pending name verification from the Wavetable UI).
 * @param device - LiveAPI device object
 * @param args - Parsed action arguments
 * @param toolName - Calling tool name for warning prefix
 */
export function setModulationAction(
  device: LiveAPI,
  args: Array<string | number>,
  toolName: string,
): void {
  if (args.length < 3) {
    console.warn(
      `${toolName}: setModulation requires 3 arguments (target, source, amount)`,
    );

    return;
  }

  const target = String(args[0]);
  // args[1] is source index (0-12); pending Wavetable UI verification of names
  const s = coerceInt(args[1] as string | number);

  if (s == null || s < 0 || s > MAX_SOURCE_INDEX) {
    console.warn(
      `${toolName}: setModulation source must be an integer 0-${MAX_SOURCE_INDEX} (got "${String(args[1])}")`,
    );

    return;
  }

  const a = Number(args[2]);

  if (!Number.isFinite(a)) {
    console.warn(
      `${toolName}: setModulation amount must be a finite number (got "${String(args[2])}")`,
    );

    return;
  }

  const targetIndex = ensureModulationTarget(device, target, toolName);

  if (targetIndex < 0) {
    return;
  }

  device.call("set_modulation_value", targetIndex, s, a);
}

/**
 * Handle the clearModulation action: zero a modulation-matrix cell.
 * Does NOT add a missing target (nothing to clear).
 *
 * Args: [target: string, source: int 0-12]
 * @param device - LiveAPI device object
 * @param args - Parsed action arguments
 * @param toolName - Calling tool name for warning prefix
 */
export function clearModulationAction(
  device: LiveAPI,
  args: Array<string | number>,
  toolName: string,
): void {
  if (args.length < 2) {
    console.warn(
      `${toolName}: clearModulation requires 2 arguments (target, source)`,
    );

    return;
  }

  const target = String(args[0]);
  const s = coerceInt(args[1] as string | number);

  if (s == null || s < 0 || s > MAX_SOURCE_INDEX) {
    console.warn(
      `${toolName}: clearModulation source must be an integer 0-${MAX_SOURCE_INDEX} (got "${String(args[1])}")`,
    );

    return;
  }

  const targetIndex = resolveTargetIndex(device, target);

  if (targetIndex < 0) {
    console.warn(
      `${toolName}: clearModulation target "${target}" is not in the modulation matrix`,
    );

    return;
  }

  device.call("set_modulation_value", targetIndex, s, 0);
}

/**
 * Handle the addModulationTarget action: register a parameter in the matrix.
 *
 * Args: [parameterName: string]
 * @param device - LiveAPI device object
 * @param args - Parsed action arguments
 * @param toolName - Calling tool name for warning prefix
 */
export function addModulationTargetAction(
  device: LiveAPI,
  args: Array<string | number>,
  toolName: string,
): void {
  if (args.length === 0) {
    console.warn(
      `${toolName}: addModulationTarget requires 1 argument (parameterName)`,
    );

    return;
  }

  const name = String(args[0]);
  const param = findParamChild(device, name);

  if (param == null) {
    console.warn(
      `${toolName}: addModulationTarget "${name}" — parameter not found`,
    );

    return;
  }

  device.call("add_parameter_to_modulation_matrix", param);
}

/**
 * Read the full modulation matrix state as an array of nonzero cells.
 * Iterates all target slots (stops at sentinel) × all 13 source indices.
 * Only nonzero amounts are included in the result.
 * @param device - LiveAPI device object
 * @returns Array of { target, source, amount } entries
 */
export function readModulations(device: LiveAPI): unknown[] {
  const result: { target: string; source: number; amount: number }[] = [];

  for (let t = 0; ; t++) {
    const name = device.call("get_modulation_target_parameter_name", t);

    // Sentinel: number 1 signals end of valid targets.
    if (typeof name === "number") {
      break;
    }

    for (let s = 0; s < SOURCE_COUNT; s++) {
      const v = device.call("get_modulation_value", t, s);

      if (typeof v === "number" && v !== 0) {
        result.push({ target: String(name), source: s, amount: v });
      }
    }
  }

  return result;
}

// --- internal ---

/**
 * Ensure a named parameter is registered as a modulation target, adding it if
 * needed. Returns the resolved target index, or -1 on failure.
 * @param device - LiveAPI device object
 * @param target - Parameter name
 * @param toolName - Calling tool for warning prefix
 * @returns Resolved target index, or -1
 */
function ensureModulationTarget(
  device: LiveAPI,
  target: string,
  toolName: string,
): number {
  let targetIndex = resolveTargetIndex(device, target);

  if (targetIndex >= 0) {
    return targetIndex;
  }

  // Target not in matrix — try to add it.
  const param = findParamChild(device, target);

  if (param == null) {
    console.warn(
      `${toolName}: setModulation target "${target}" — parameter not found`,
    );

    return -1;
  }

  device.call("add_parameter_to_modulation_matrix", param);
  targetIndex = resolveTargetIndex(device, target);

  if (targetIndex < 0) {
    console.warn(
      `${toolName}: setModulation target "${target}" — could not add to matrix`,
    );
  }

  return targetIndex;
}
