// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type ParamEntry,
  paramEntryKey,
} from "#src/tools/device/update/device-params-schema.ts";
import { isSpecializedParamKey } from "#src/tools/shared/device/specialized/specialized-device-registry.ts";
import { matchParamsByName } from "./param-name-resolution.ts";

/**
 * Refuse a params list with an entry the setter can't read, and return the
 * list with each entry addressed by exactly one of `name` and `id`.
 *
 * An entry with neither a name nor an id, both, no value, or nothing after its
 * last "/" names no one parameter, so there is nothing to write. A blank
 * `name` or `id` counts as absent: the OpenAI models fill the field they don't
 * use with `""` rather than leaving it out. This is the shape a hole in a
 * comma-separated list already gets refused for — and refusing here, before
 * any device is touched, means the caller can fix the list and send it again
 * with nothing to clean up.
 *
 * A key repeated in the same list is refused too: values are read back once
 * after every write in the call lands, keyed by the param it resolved to, so
 * an earlier write to the same param is never observable — its result entry
 * would report a value that write never produced.
 * @param params - The params list as the caller sent it
 * @returns The same entries, trimmed, with the blank addressing field dropped
 */
export function validateParamEntries(
  params: ParamEntry[] | undefined,
): ParamEntry[] | undefined {
  const seen = new Set<string>();

  return params?.map((entry, index) => {
    const name = blankToUndefined(entry.name);
    const id = blankToUndefined(entry.id);
    const value = entry.value.trim();
    const key = id ?? name;

    if (key == null) {
      throw new Error(`params entry ${index + 1} has neither a name nor an id`);
    }

    if (name != null && id != null) {
      throw new Error(
        `params entry ${index + 1} has both a name ("${name}") and an id (${id}) — send one`,
      );
    }

    if (value === "") {
      throw new Error(`params entry "${key}" has an empty value`);
    }

    if (
      key.includes("/") &&
      key.slice(key.lastIndexOf("/") + 1).trim() === ""
    ) {
      throw new Error(`params entry "${key}" has an empty name after "/"`);
    }

    const dedupeKey = `${id == null ? "name" : "id"}:${key.toLowerCase()}`;

    if (seen.has(dedupeKey)) {
      throw new Error(`params entry "${key}" is set more than once`);
    }

    seen.add(dedupeKey);

    return id == null ? { name: key, value } : { id, value };
  });
}

/**
 * @param field - A `name` or `id` as the caller sent it
 * @returns The trimmed field, or undefined when it was missing or blank
 */
function blankToUndefined(field: string | undefined): string | undefined {
  const trimmed = field?.trim();

  return trimmed == null || trimmed === "" ? undefined : trimmed;
}

/** An entry that reaches a parameter an earlier entry already reached. */
interface ParamClash {
  index: number;
  key: string;
  firstIndex: number;
  firstKey: string;
  paramId: string;
}

/**
 * Refuse a params list that reaches one parameter twice.
 *
 * `validateParamEntries` compares the text, so the same param written once by
 * id and once by name gets past it. Values are read back once after every write
 * in the call lands, keyed by the param, so both entries would report the last
 * write's value.
 * @param device - The device the entries are looked up on
 * @param params - The params list as the caller sent it
 */
export function refuseDuplicateParams(
  device: LiveAPI,
  params: ParamEntry[],
): void {
  const [clash] = paramClashes(device, params);

  // Both spellings, because neither one alone shows the caller that the two
  // entries are the same control.
  if (clash != null) {
    throw new Error(
      `params entry "${clash.key}" is set more than once — "${clash.firstKey}" names the same param (id ${clash.paramId})`,
    );
  }
}

/**
 * Why each entry that shares a parameter with another is skipped, keyed by its
 * position in the list. For where a refusal comes too late: create-device can
 * only look once the device exists. Every entry reaching the shared param is
 * skipped, since nothing says which value the caller meant.
 * @param device - The device the entries are looked up on
 * @param params - The params list as the caller sent it
 * @returns The skip reason for each clashing entry
 */
export function duplicateParamReasons(
  device: LiveAPI,
  params: ParamEntry[],
): Map<number, string> {
  const reasons = new Map<number, string>();

  for (const clash of paramClashes(device, params)) {
    reasons.set(clash.index, sameParamReason(clash.firstKey, clash.paramId));

    if (!reasons.has(clash.firstIndex)) {
      reasons.set(clash.firstIndex, sameParamReason(clash.key, clash.paramId));
    }
  }

  return reasons;
}

/**
 * @param other - Another entry's key that reaches the same param
 * @param paramId - The param both reach
 * @returns Why this entry was skipped
 */
function sameParamReason(other: string, paramId: string): string {
  return `"${other}" names the same param (id ${paramId}), so nothing was written to it — send one`;
}

/**
 * Every entry that reaches a parameter an earlier entry already reached.
 *
 * Only entries that reach a parameter here are compared. A nested path, a
 * pseudo-param or an ambiguous name keeps whatever the write path does with it
 * — and resolving a nested path can create the chain it names, which a check
 * must not do.
 * @param device - The device the entries are looked up on
 * @param params - The params list as the caller sent it
 * @returns The clashes, in list order
 */
function paramClashes(device: LiveAPI, params: ParamEntry[]): ParamClash[] {
  if (params.length < 2) {
    return [];
  }

  // Read once for the whole list: every entry matches against these.
  const parameters = device.getChildren("parameters");
  const claimedBy = new Map<string, { index: number; key: string }>();
  const clashes: ParamClash[] = [];

  for (const [index, entry] of params.entries()) {
    const { key, byId } = paramEntryKey(entry);
    const param = byId
      ? (parameters.find((candidate) => candidate.id === key) ?? null)
      : paramForEntry(parameters, device, key);

    if (param == null) {
      continue;
    }

    const first = claimedBy.get(param.id);

    if (first == null) {
      claimedBy.set(param.id, { index, key });
      continue;
    }

    clashes.push({
      index,
      key,
      firstIndex: first.index,
      firstKey: first.key,
      paramId: param.id,
    });
  }

  return clashes;
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
