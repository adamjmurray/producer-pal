// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";
import { toLiveApiId } from "#src/tools/shared/utils.ts";
import { coerceInt } from "../specialized-device-param-helpers.ts";

// Wavetable mod-matrix helpers. AJM-373. See
// dev/Specialized-Devices.md.
//
// Wavetable's modulation matrix is imperative: targets are registered by
// DeviceParameter reference, indexed by position, and cells are read/written
// via device.call("get/set_modulation_value", targetIndex, sourceIndex, amount).
//
// The 13 sources are addressed by name (MOD_SOURCES, in matrix column order),
// verified against Live 12.4's UI (2026-05-22). A bare integer index 0-12 is
// also accepted for robustness. No LOM property exposes the source names.
//
// Matrix keyed by PARAMETER NAME (from get_modulation_target_parameter_name),
// not display label (visible_modulation_target_names).

// Modulation sources in matrix column order (index = sourceIndex 0-12).
export const MOD_SOURCES = [
  "Amp",
  "Env 2",
  "Env 3",
  "LFO 1",
  "LFO 2",
  "Vel",
  "Key",
  "PB",
  "Press",
  "Mod",
  "Rand",
  "Note PB",
  "Slide",
] as const;

/** Total source count (13). */
const SOURCE_COUNT = MOD_SOURCES.length;

// Defensive cap on the matrix-target scan. The loops stop at the LOM's numeric
// sentinel; this guards against an infinite loop if a future Live version stops
// returning it. Far above any real device's parameter count.
const MAX_TARGETS = 512;

/**
 * Resolve the target index for a named parameter in the modulation matrix.
 * Iterates `get_modulation_target_parameter_name` until the sentinel (number)
 * is returned. Matching is case-insensitive and trims surrounding whitespace
 * (mirroring source resolution); LLMs case-mangle param names. Returns -1 when
 * the target is not found.
 * @param device - LiveAPI device object
 * @param target - Parameter name to find
 * @returns Target index (0-based), or -1 if not found
 */
export function resolveTargetIndex(device: LiveAPI, target: string): number {
  const needle = target.trim().toLowerCase();

  for (let i = 0; i < MAX_TARGETS; i++) {
    const name = device.call("get_modulation_target_parameter_name", i);

    // Sentinel: the LOM returns number 1 for out-of-range indices.
    if (typeof name === "number") {
      break;
    }

    if (typeof name === "string" && name.toLowerCase() === needle) {
      return i;
    }
  }

  return -1;
}

/**
 * Find a DeviceParameter child by name (checks getProperty("name") on each).
 * Matching is case-insensitive and trims surrounding whitespace.
 * @param device - LiveAPI device object
 * @param name - Parameter name to find
 * @returns The matching LiveAPI parameter, or undefined
 */
export function findParamChild(
  device: LiveAPI,
  name: string,
): LiveAPI | undefined {
  const needle = name.trim().toLowerCase();
  const children = device.getChildren("parameters");

  return children.find(
    (p) => String(p.getProperty("name")).toLowerCase() === needle,
  );
}

/**
 * Handle the setModulation action: write a modulation-matrix cell.
 * Auto-adds the target parameter when not yet registered.
 *
 * Args: [target: string, source: name|int 0-12, amount: float]
 * Source accepts a name (e.g. "LFO 1") or a bare index 0-12; see
 * resolveSourceIndex.
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
  const s = resolveSourceIndex(args[1] as string | number);

  if (s < 0) {
    console.warn(
      `${toolName}: setModulation source "${String(args[1])}" is invalid. Valid: ${MOD_SOURCES.join(", ")}`,
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

  // Enforce documented -1..1 contract. Live may clamp internally, but writing
  // an out-of-range amount means the request didn't say what the caller meant.
  if (Math.abs(a) > 1) {
    console.warn(
      `${toolName}: setModulation amount must be in -1..1 (got ${a})`,
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
  const s = resolveSourceIndex(args[1] as string | number);

  if (s < 0) {
    console.warn(
      `${toolName}: clearModulation source "${String(args[1])}" is invalid. Valid: ${MOD_SOURCES.join(", ")}`,
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

  if (!isParameterModulatable(device, param)) {
    console.warn(
      `${toolName}: addModulationTarget "${name}" — parameter is not modulatable`,
    );

    return;
  }

  device.call("add_parameter_to_modulation_matrix", toLiveApiId(param.id));
}

/**
 * Read the full modulation matrix state as an array of nonzero cells.
 * Iterates all target slots (stops at sentinel) × all 13 source indices.
 * Only nonzero amounts are included in the result.
 * @param device - LiveAPI device object
 * @returns Array of { target, source, amount } entries
 */
export function readModulations(device: LiveAPI): unknown[] {
  const result: { target: string; source: string; amount: number }[] = [];

  for (let t = 0; t < MAX_TARGETS; t++) {
    const name = device.call("get_modulation_target_parameter_name", t);

    // Sentinel: number 1 signals end of valid targets.
    if (typeof name === "number") {
      break;
    }

    for (let s = 0; s < SOURCE_COUNT; s++) {
      const v = device.call("get_modulation_value", t, s);

      if (typeof v === "number" && v !== 0) {
        // s is bounded by SOURCE_COUNT, so MOD_SOURCES[s] is always defined.
        const source = MOD_SOURCES[s] as string;

        result.push({ target: String(name), source, amount: v });
      }
    }
  }

  return result;
}

// --- internal ---

/**
 * Resolve a modulation source to its column index. Accepts a source name
 * (case-insensitive, e.g. "LFO 1") or a bare integer index 0-12.
 * @param value - Source name or index
 * @returns Source index 0-12, or -1 when invalid
 */
function resolveSourceIndex(value: string | number): number {
  const name = String(value).trim().toLowerCase();
  const byName = MOD_SOURCES.findIndex((s) => s.toLowerCase() === name);

  if (byName >= 0) {
    return byName;
  }

  const n = coerceInt(value);

  return n != null && n >= 0 && n < SOURCE_COUNT ? n : -1;
}

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

  if (!isParameterModulatable(device, param)) {
    console.warn(
      `${toolName}: setModulation target "${target}" — parameter is not modulatable`,
    );

    return -1;
  }

  device.call("add_parameter_to_modulation_matrix", toLiveApiId(param.id));
  targetIndex = resolveTargetIndex(device, target);

  if (targetIndex < 0) {
    console.warn(
      `${toolName}: setModulation target "${target}" — could not add to matrix`,
    );
  }

  return targetIndex;
}

/**
 * Whether the device's `is_parameter_modulatable` returns 1 for this child.
 * Pre-check before `add_parameter_to_modulation_matrix` so we don't smuggle a
 * non-modulatable param into the matrix (mirrors the read-side filter in
 * `readOptions.modulatableParameters`).
 * @param device - LiveAPI device object
 * @param param - DeviceParameter child to test
 * @returns true when modulatable
 */
function isParameterModulatable(device: LiveAPI, param: LiveAPI): boolean {
  return device.call("is_parameter_modulatable", toLiveApiId(param.id)) === 1;
}
