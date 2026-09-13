// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ParamEntry } from "#src/tools/device/update/device-params-schema.ts";
import { isSpecializedParamKey } from "#src/tools/shared/device/specialized/specialized-device-registry.ts";
import { matchParamsByName } from "./param-name-resolution.ts";

/**
 * Refuse a params list with an entry the setter can't read.
 *
 * An entry with no name, no value, or nothing after its last "/" names no
 * parameter, so there is nothing to write. This is the shape a hole in a
 * comma-separated list already gets refused for — and refusing here, before
 * any device is touched, means the caller can fix the list and send it again
 * with nothing to clean up.
 *
 * A name repeated in the same list is refused too: values are read back once
 * after every write in the call lands, keyed by the param it resolved to, so
 * an earlier write to the same param is never observable — its result entry
 * would report a value that write never produced.
 * @param params - The params list as the caller sent it
 */
export function validateParamEntries(params: ParamEntry[] | undefined): void {
  const seen = new Set<string>();

  for (const [index, entry] of (params ?? []).entries()) {
    const key = entry.name.trim();

    if (key === "") {
      throw new Error(`params entry ${index + 1} has an empty name`);
    }

    if (entry.value.trim() === "") {
      throw new Error(`params entry "${key}" has an empty value`);
    }

    if (
      key.includes("/") &&
      key.slice(key.lastIndexOf("/") + 1).trim() === ""
    ) {
      throw new Error(`params entry "${key}" has an empty name after "/"`);
    }

    const dedupeKey = key.toLowerCase();

    if (seen.has(dedupeKey)) {
      throw new Error(`params entry "${key}" is set more than once`);
    }

    seen.add(dedupeKey);
  }
}

/**
 * Refuse a params list that reaches one parameter twice.
 *
 * `validateParamEntries` compares the text, so the same param written once by
 * id and once by name gets past it. Values are read back once after every write
 * in the call lands, keyed by the param, so both entries would report the last
 * write's value.
 *
 * Only entries that reach a parameter here are compared. A nested path, a
 * pseudo-param or an ambiguous name keeps whatever the write path does with it
 * — and resolving a nested path can create the chain it names, which a check
 * must not do.
 * @param device - The device the entries are looked up on
 * @param params - The params list as the caller sent it
 */
export function refuseDuplicateParams(
  device: LiveAPI,
  params: ParamEntry[],
): void {
  if (params.length < 2) {
    return;
  }

  // Read once for the whole list: every entry matches against these.
  const parameters = device.getChildren("parameters");
  const claimedBy = new Map<string, string>();

  for (const entry of params) {
    const key = entry.name.trim();
    const param = paramForEntry(parameters, device, key);

    if (param == null) {
      continue;
    }

    const first = claimedBy.get(param.id);

    // Both spellings, because neither one alone shows the caller that the two
    // entries are the same control.
    if (first != null) {
      throw new Error(
        `params entry "${key}" is set more than once — "${first}" names the same param (id ${param.id})`,
      );
    }

    claimedBy.set(param.id, key);
  }
}

/**
 * The parameter an entry reaches, by the lookups the write path uses that
 * change nothing.
 * @param parameters - The device's parameters
 * @param device - The device the entries are looked up on
 * @param key - The trimmed param name
 * @returns The parameter, or null when the key reaches none of this device's
 */
function paramForEntry(
  parameters: LiveAPI[],
  device: LiveAPI,
  key: string,
): LiveAPI | null {
  // A pseudo-param is dispatched ahead of the parameters, so a device property
  // wins the name even where a parameter shares it.
  if (isSpecializedParamKey(device, key)) {
    return null;
  }

  const matches = matchParamsByName(parameters, key);

  // An ambiguous name is warned about and written nowhere, so it claims none.
  if (matches.length > 1) {
    return null;
  }

  const named = matches[0];

  if (named?.exists()) {
    return named;
  }

  // An all-digit key is a Live object id, and the device's own parameters are
  // exactly the ids it owns — one belonging to another device is not written
  // here either.
  return /^\d+$/.test(key)
    ? (parameters.find((param) => param.id === key) ?? null)
    : null;
}
