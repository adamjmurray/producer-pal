// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { toLiveApiId } from "#src/tools/shared/helpers/live-api-values.ts";
import { coerceInt } from "../specialized-param-access.ts";
import { type ActionOutcome } from "../specialized-device-types.ts";

// Wavetable mod-matrix helpers. See dev/live-api/specialized-devices/instruments.md.
//
// The matrix is imperative: targets are registered by DeviceParameter
// reference, indexed by position, and cells go through
// device.call("get/set_modulation_value", targetIndex, sourceIndex, amount).
// Sources are addressed by name (MOD_SOURCES, in matrix column order, verified
// against Live 12.4's UI) or a bare index 0-12 — no LOM property exposes them.
// Targets are keyed by PARAMETER NAME (get_modulation_target_parameter_name),
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

// Defensive cap on the matrix-target scan: the loops stop at the LOM's numeric
// sentinel, and a future Live that stopped returning it would spin forever.
const MAX_TARGETS = 512;

/**
 * Resolve the target index for a named parameter in the modulation matrix.
 * Matching is case-insensitive and trims whitespace: LLMs case-mangle names.
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
 * Args: [target: string, source: name (e.g. "LFO 1") | int 0-12, amount: float]
 * @param device - LiveAPI device object
 * @param args - Parsed action arguments
 * @returns Null when the cell was written, otherwise why it wasn't
 */
export function setModulationAction(
  device: LiveAPI,
  args: Array<string | number>,
): ActionOutcome {
  if (args.length < 3) {
    return "requires 3 arguments (target, source, amount)";
  }

  const target = String(args[0]);
  const s = resolveSourceIndex(args[1] as string | number);

  if (s < 0) {
    return invalidSource(args[1] as string | number);
  }

  const a = Number(args[2]);

  if (!Number.isFinite(a)) {
    return `amount must be a finite number (got "${String(args[2])}")`;
  }

  // Enforce documented -1..1 contract. Live may clamp internally, but writing
  // an out-of-range amount means the request didn't say what the caller meant.
  if (Math.abs(a) > 1) {
    return `amount must be in -1..1 (got ${a})`;
  }

  const targetIndex = ensureModulationTarget(device, target);

  if (typeof targetIndex === "string") {
    return targetIndex;
  }

  device.call("set_modulation_value", targetIndex, s, a);

  return null;
}

/**
 * Handle the clearModulation action: zero a modulation-matrix cell.
 * Does NOT add a missing target (nothing to clear).
 *
 * Args: [target: string, source: int 0-12]
 * @param device - LiveAPI device object
 * @param args - Parsed action arguments
 * @returns Null when the cell was cleared, otherwise why it wasn't
 */
export function clearModulationAction(
  device: LiveAPI,
  args: Array<string | number>,
): ActionOutcome {
  if (args.length < 2) {
    return "requires 2 arguments (target, source)";
  }

  const target = String(args[0]);
  const s = resolveSourceIndex(args[1] as string | number);

  if (s < 0) {
    return invalidSource(args[1] as string | number);
  }

  const targetIndex = resolveTargetIndex(device, target);

  // Not a refusal: an unrouted target is already the state asked for.
  if (targetIndex < 0) {
    return {
      reason: `target "${target}" is not in the modulation matrix — nothing to clear`,
    };
  }

  device.call("set_modulation_value", targetIndex, s, 0);

  return null;
}

/**
 * Handle the addModulationTarget action: register a parameter in the matrix.
 *
 * Args: [parameterName: string]
 * @param device - LiveAPI device object
 * @param args - Parsed action arguments
 * @returns Null when the target was added, otherwise why it wasn't
 */
export function addModulationTargetAction(
  device: LiveAPI,
  args: Array<string | number>,
): ActionOutcome {
  if (args.length === 0) {
    return "requires 1 argument (parameterName)";
  }

  const name = String(args[0]);

  // Not a refusal: the parameter is already routable.
  if (resolveTargetIndex(device, name) >= 0) {
    return {
      reason: `parameter "${name}" is already in the modulation matrix`,
    };
  }

  const added = ensureModulationTarget(device, name);

  return typeof added === "string" ? added : null;
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
 * Why a source the matrix has no column for was refused.
 * @param value - The source the call sent
 * @returns The reason, naming every valid source
 */
function invalidSource(value: string | number): string {
  return `source "${String(value)}" is invalid. Valid: ${MOD_SOURCES.join(", ")}`;
}

/**
 * Register a parameter as a modulation target.
 * @param device - LiveAPI device object
 * @param target - Parameter name
 * @returns Null when it was added, otherwise why it wasn't
 */
function addTargetToMatrix(device: LiveAPI, target: string): string | null {
  const param = findParamChild(device, target);

  if (param == null) {
    return `parameter "${target}" not found`;
  }

  if (!isParameterModulatable(device, param)) {
    return `parameter "${target}" is not modulatable`;
  }

  device.call("add_parameter_to_modulation_matrix", toLiveApiId(param.id));

  return null;
}

/**
 * Ensure a named parameter is registered as a modulation target, adding it if
 * needed.
 * @param device - LiveAPI device object
 * @param target - Parameter name
 * @returns The resolved target index, or the reason there is none
 */
function ensureModulationTarget(
  device: LiveAPI,
  target: string,
): number | string {
  const existing = resolveTargetIndex(device, target);

  if (existing >= 0) {
    return existing;
  }

  const refused = addTargetToMatrix(device, target);

  if (refused != null) {
    return refused;
  }

  const added = resolveTargetIndex(device, target);

  return added < 0 ? `parameter "${target}" — could not add to matrix` : added;
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
