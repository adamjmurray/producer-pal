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
 * Skip reasons for entries a later entry overrides, keyed by position. When
 * entries reach one param, the last one wins.
 *
 * Entries match when their keys are the same text (any case), or when they
 * reach the same parameter on `device` (an id and a name, or a macro's two
 * names). Only writing the last one matters: values are read back once after
 * every write lands, so an earlier entry would report a value it never wrote.
 * @param device - The device the entries are looked up on; null compares the
 *   keys alone
 * @param params - The params list as the caller sent it
 * @returns The skip reason for each overridden entry
 */
export function supersededParamReasons(
  device: LiveAPI | null,
  params: ParamEntry[],
): Map<number, string> {
  const reasons = new Map<number, string>();

  if (params.length < 2) {
    return reasons;
  }

  // Read once for the whole list: every entry matches against these.
  const parameters = device?.getChildren("parameters") ?? [];
  // What each claimed key or param is set by, as the reason names it.
  const setBy = new Map<string, string>();

  // Walk back from the end, so the entry that claims a param is the last one.
  for (const [index, entry] of [...params.entries()].toReversed()) {
    const claims = entryClaims(parameters, device, entry);
    const winner = claims
      .map((claim) => setBy.get(claim))
      .find((label) => label != null);

    if (winner != null) {
      reasons.set(index, `set again by ${winner} later in the list`);
      continue;
    }

    const { key, byId } = paramEntryKey(entry);
    const label = byId ? `id ${key}` : `"${key}"`;

    for (const claim of claims) {
      setBy.set(claim, label);
    }
  }

  return reasons;
}

/**
 * @param parameters - The device's parameters
 * @param device - The device the entries are looked up on, or null
 * @param entry - One validated param entry
 * @returns The entry's key, plus the param it reaches when it reaches one
 */
function entryClaims(
  parameters: LiveAPI[],
  device: LiveAPI | null,
  entry: ParamEntry,
): string[] {
  const { key, byId } = paramEntryKey(entry);
  const claims = [`${byId ? "id" : "name"}:${key.toLowerCase()}`];

  if (device == null) {
    return claims;
  }

  const param = byId
    ? (parameters.find((candidate) => candidate.id === key) ?? null)
    : paramForEntry(parameters, device, key);

  if (param != null) {
    claims.push(`param:${param.id}`);
  }

  return claims;
}

/**
 * The parameter an entry reaches, by the lookups the write path uses that
 * change nothing. A nested path isn't resolved here: resolving one can create
 * the chain it names.
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

  // An ambiguous name is written nowhere, so it reaches no one param.
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
