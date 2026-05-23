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
import { roarSpec } from "./devices/roar.ts";
import { simplerSpec } from "./devices/simpler.ts";
import { spectralResonatorSpec } from "./devices/spectral-resonator.ts";
import { wavetableSpec } from "./devices/wavetable.ts";
import { parseAction } from "./specialized-device-action-parser.ts";
import {
  type ActionHandler,
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
  compressorSpec,
  eqEightSpec,
  hybridReverbSpec,
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
  return readParamEntries(device, () => true, search);
}

/**
 * Read only the sample-group pseudo-params for a device (Simpler's sample +
 * gainDb), used by the focused `include: ["sample"]` read.
 * @param device - LiveAPI device object
 * @returns Array of {name, value} entries (empty for non-sample devices)
 */
export function readSpecializedSampleParams(
  device: LiveAPI,
): Record<string, unknown>[] {
  return readParamEntries(device, (param) => param.sampleGroup === true);
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

    const handler = findAction(spec, parsed.name);

    if (!handler) {
      console.warn(
        `${toolName}: unknown action "${parsed.name}" for this device`,
      );
      continue;
    }

    handler(device, parsed.args, toolName);
  }
}

/**
 * Read the dynamic `options` catalogs for a device (for `include: ["options"]`).
 * @param device - LiveAPI device object
 * @returns Catalog object (empty when the device contributes none)
 */
export function readSpecializedOptions(
  device: LiveAPI,
): Record<string, unknown> {
  const spec = getSpecForDevice(device);

  return spec?.readOptions ? spec.readOptions(device) : {};
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
 * Read the pseudo-params matching a predicate into {name, value} entries.
 * @param device - LiveAPI device object
 * @param predicate - Selects which params to read
 * @param search - Optional case-insensitive name filter
 * @returns Array of {name, value} entries
 */
function readParamEntries(
  device: LiveAPI,
  predicate: (param: PseudoParam) => boolean,
  search?: string,
): Record<string, unknown>[] {
  const spec = getSpecForDevice(device);

  if (!spec?.params) {
    return [];
  }

  const entries: Record<string, unknown>[] = [];

  for (const param of spec.params) {
    if (!predicate(param)) {
      continue;
    }

    const value = param.read(device);

    if (value !== undefined) {
      entries.push({ name: param.name, value });
    }
  }

  return filterBySearch(entries, search);
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
 * Find an action handler by name (case-insensitive).
 * @param spec - Device spec
 * @param name - Action name to find
 * @returns The matching handler, or undefined
 */
function findAction(
  spec: SpecializedDeviceSpec | undefined,
  name: string,
): ActionHandler | undefined {
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
