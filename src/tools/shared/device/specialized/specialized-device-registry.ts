// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";
import { compressorSpec } from "./devices/compressor.ts";
import { driftSpec } from "./devices/drift.ts";
import { eqEightSpec } from "./devices/eq-eight.ts";
import { hybridReverbSpec } from "./devices/hybrid-reverb.ts";
import { meldSpec } from "./devices/meld.ts";
import {
  autoFilterSpec,
  autoPanTremoloSpec,
  phaserFlangerSpec,
} from "./devices/modulation-rate-effects.ts";
import { roarSpec } from "./devices/roar.ts";
import { simplerSpec } from "./devices/simpler.ts";
import { spectralResonatorSpec } from "./devices/spectral-resonator.ts";
import { wavetableSpec } from "./devices/wavetable.ts";
import { parseAction } from "./specialized-device-action-parser.ts";
import { applyInactiveStates } from "./specialized-device-inactive.ts";
import {
  type ActionDef,
  type PseudoParam,
  type SpecializedDeviceSpec,
} from "./specialized-device-types.ts";

// Central registry of specialized-device specs and the dispatch entry points
// used by the device read/update plumbing. Devices are matched by
// `class_display_name` (consistent with the existing Simpler handling). See
// dev/Specialized-Devices.md.

const SPECS: SpecializedDeviceSpec[] = [
  // Instruments
  driftSpec,
  meldSpec,
  simplerSpec,
  wavetableSpec,
  // Audio effects
  autoFilterSpec,
  autoPanTremoloSpec,
  compressorSpec,
  eqEightSpec,
  hybridReverbSpec,
  phaserFlangerSpec,
  roarSpec,
  spectralResonatorSpec,
];

const SPEC_BY_DISPLAY_NAME = new Map<string, SpecializedDeviceSpec>();

for (const spec of SPECS) {
  for (const displayName of spec.displayNames) {
    SPEC_BY_DISPLAY_NAME.set(displayName, spec);
  }
}

/**
 * Look up the specialized spec for a device by its class_display_name.
 * @param device - LiveAPI device object
 * @returns The matching spec, or undefined for a generic device
 */
export function getSpecForDevice(
  device: LiveAPI,
): SpecializedDeviceSpec | undefined {
  const displayName = device.getProperty("class_display_name") as string;

  return SPEC_BY_DISPLAY_NAME.get(displayName);
}

/**
 * Attempt to apply a pseudo-param write for a specialized device. Returns
 * whether the key was recognized as a pseudo-param (so the caller knows not to
 * fall through to DeviceParameter resolution).
 * @param device - LiveAPI device object
 * @param key - Param name from the `params` input
 * @param value - Coerced value
 * @param toolName - Calling tool name for warning prefix
 * @returns true if the key matched a pseudo-param (handled or warned)
 */
export function applySpecializedParamWrite(
  device: LiveAPI,
  key: string,
  value: string | number,
  toolName: string,
): boolean {
  const spec = getSpecForDevice(device);

  if (!spec?.params) {
    return false;
  }

  const param = findParam(spec.params, key);

  if (!param) {
    return false;
  }

  if (!param.write) {
    console.warn(`${toolName}: "${param.name}" is read-only`);

    return true;
  }

  param.write(device, value, toolName);

  return true;
}

/**
 * Read the specialized read-pseudo-params for a device (returned alongside
 * DeviceParameters in the `parameters` output).
 * @param device - LiveAPI device object
 * @param search - Optional case-insensitive name filter
 * @returns Array of {name, value} entries
 */
export function readSpecializedParams(
  device: LiveAPI,
  search?: string,
): Record<string, unknown>[] {
  const spec = getSpecForDevice(device);

  if (!spec?.params) {
    return [];
  }

  const entries: Record<string, unknown>[] = [];

  for (const param of spec.params) {
    const value = param.read(device);

    // !== undefined (not != null): a meaningful null — e.g. Compressor's "No
    // Input" sidechain source — must still be emitted; only an absent/N/A param
    // (undefined) is skipped.
    if (value !== undefined) {
      entries.push({ name: param.name, value });
    }
  }

  return filterBySearch(entries, search);
}

/**
 * Parse and dispatch the `actions` arg for a specialized device. Unknown or
 * malformed actions warn-and-skip.
 * @param device - LiveAPI device object
 * @param actions - Raw action strings
 * @param toolName - Calling tool name for warning prefix
 */
export function applySpecializedActions(
  device: LiveAPI,
  actions: string[],
  toolName: string,
): void {
  const spec = getSpecForDevice(device);

  for (const raw of actions) {
    const parsed = parseAction(raw);

    if (!parsed) {
      console.warn(`${toolName}: could not parse action "${raw}"`);
      continue;
    }

    const action = findAction(spec, parsed.name);

    if (!action) {
      console.warn(
        `${toolName}: unknown action "${parsed.name}" for this device`,
      );
      continue;
    }

    action.handler(device, parsed.args, toolName);
  }
}

/**
 * Read the available actions for a device's specialized class (for
 * `include: ["actions"]`). Lets the model discover what it can do to a device
 * at runtime instead of relying on the skills prompt.
 * @param device - LiveAPI device object
 * @returns Array of {name, signature, description} entries (empty when none)
 */
export function readSpecializedActions(
  device: LiveAPI,
): Record<string, unknown>[] {
  const spec = getSpecForDevice(device);

  if (!spec?.actions) {
    return [];
  }

  return Object.entries(spec.actions).map(([name, def]) => ({
    name,
    signature: def.signature,
    description: def.description,
  }));
}

/**
 * Read the `options` catalogs for a device (for `include: ["options"]`):
 * `paramOptions` (each writable pseudo-param's static valid values) plus any
 * dynamic catalogs the device contributes via `readOptions` (IR files,
 * wavetables, sidechain sources). Lets the model discover accepted values
 * without a failed write.
 * @param device - LiveAPI device object
 * @returns Catalog object (empty when the device contributes none)
 */
export function readSpecializedOptions(
  device: LiveAPI,
): Record<string, unknown> {
  const spec = getSpecForDevice(device);

  if (!spec) {
    return {};
  }

  const dynamic = spec.readOptions ? spec.readOptions(device) : {};
  const paramOptions = collectParamOptions(spec);

  // paramOptions first (the valid-values reference), then dynamic catalogs.
  return Object.keys(paramOptions).length > 0
    ? { paramOptions, ...dynamic }
    : dynamic;
}

/**
 * Build the static `paramOptions` catalog: each writable pseudo-param's declared
 * valid values, keyed by param name. State-independent — it lists what a param
 * accepts, not its current value. Params without `options` (booleans, free-form
 * values, read-only, or dynamic-choice params) are omitted.
 * @param spec - Device spec
 * @returns Map of param name → valid values (array or constraint string)
 */
function collectParamOptions(
  spec: SpecializedDeviceSpec,
): Record<string, readonly (string | number)[] | string> {
  const result: Record<string, readonly (string | number)[] | string> = {};

  for (const param of spec.params) {
    if (param.options != null) {
      result[param.name] = param.options;
    }
  }

  return result;
}

/**
 * Mark a device's parameters inactive per its specialized `inactiveWhen` rules
 * (no-op for generic devices or specs without rules). Mutates `parameters` in
 * place; call only when reading param values, since `state` is value-level.
 * @param device - LiveAPI device object
 * @param parameters - Parameter entries to annotate (mutated in place)
 */
export function applySpecializedInactiveStates(
  device: LiveAPI,
  parameters: Record<string, unknown>[],
): void {
  const spec = getSpecForDevice(device);

  if (spec?.inactiveWhen) {
    applyInactiveStates(spec.inactiveWhen, parameters);
  }
}

/**
 * Read the modulation-matrix state for a device (the `modulations` output
 * field; Wavetable only).
 * @param device - LiveAPI device object
 * @returns Array of modulation entries, or undefined when not applicable
 */
export function readSpecializedModulations(
  device: LiveAPI,
): unknown[] | undefined {
  const spec = getSpecForDevice(device);

  return spec?.readModulations ? spec.readModulations(device) : undefined;
}

/**
 * Find a pseudo-param by name (case-insensitive).
 * @param params - Spec's param list
 * @param key - Name to find
 * @returns The matching param, or undefined
 */
function findParam(
  params: PseudoParam[],
  key: string,
): PseudoParam | undefined {
  const keyLower = key.toLowerCase();

  return params.find((p) => p.name.toLowerCase() === keyLower);
}

/**
 * Find an action definition by name (case-insensitive).
 * @param spec - Device spec
 * @param name - Action name to find
 * @returns The matching action definition, or undefined
 */
function findAction(
  spec: SpecializedDeviceSpec | undefined,
  name: string,
): ActionDef | undefined {
  if (!spec?.actions) {
    return undefined;
  }

  const nameLower = name.toLowerCase();
  const key = Object.keys(spec.actions).find(
    (k) => k.toLowerCase() === nameLower,
  );

  return key == null ? undefined : spec.actions[key];
}

/**
 * Filter pseudo-param entries by a case-insensitive substring on the name.
 * @param entries - Param entries
 * @param search - Optional search term
 * @returns Filtered entries (or all when no search)
 */
function filterBySearch(
  entries: Record<string, unknown>[],
  search: string | undefined,
): Record<string, unknown>[] {
  if (!search) {
    return entries;
  }

  const searchLower = search.toLowerCase().trim();

  return entries.filter((entry) =>
    String(entry.name).toLowerCase().includes(searchLower),
  );
}
