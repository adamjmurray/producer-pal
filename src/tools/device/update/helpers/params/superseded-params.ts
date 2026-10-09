// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  type ParamEntry,
  paramEntryKey,
} from "#src/tools/device/update/device-params-schema.ts";
import {
  type ParamOutcome,
  supersededParam,
} from "#src/tools/shared/device/helpers/param-reading.ts";
import { linkReplacer } from "#src/tools/shared/helpers/entry-details.ts";
import { isSpecializedParamKey } from "#src/tools/shared/device/specialized/specialized-device-registry.ts";
import { namedAgain } from "#src/tools/shared/validation/lists/named-targets.ts";
import { lastWins } from "#src/tools/shared/write-pipeline/plans/last-wins.ts";
import { matchParamsByName } from "./param-name-resolution.ts";

/** An entry a later one overrides: what it says, and the later entry. */
interface Overridden {
  detail: string;
  /** Position of the entry that overrides it */
  by: number;
  /** The overriding entry as the caller spelled it */
  label: string;
}

/**
 * One outcome per param entry, in order. An entry a later one overrides isn't
 * written: its outcome says which entry overrides it, and is linked to that
 * entry's outcome, so `refreshParamValues` can fail it if the later one landed
 * nothing. Every other entry's outcome comes from `outcomesFor`, which must
 * give it at least one.
 *
 * Entries match when their keys are the same text (any case), or when they
 * reach the same parameter on `device` (an id and a name, or a macro's two
 * names). Only writing the last one matters: values are read back once after
 * every write lands, so an earlier entry would report a value it never wrote.
 * @param device - The device the entries are looked up on; null compares the
 *   keys alone
 * @param params - The params list as the caller sent it
 * @param outcomesFor - Writes one entry that nothing overrides
 * @param applies - Whether an entry competes at all; one that doesn't is never
 *   overridden and overrides no one
 * @returns The outcomes, in the order the entries were named
 */
export function paramOutcomes(
  device: LiveAPI | null,
  params: ParamEntry[],
  outcomesFor: (entry: ParamEntry, index: number) => ParamOutcome[],
  applies: (entry: ParamEntry) => boolean = () => true,
): ParamOutcome[] {
  const overridden = overriddenParams(device, params, applies);
  const outcomes: ParamOutcome[] = [];
  // Where each entry's first outcome sits.
  const firstOutcome: number[] = [];

  for (const [index, entry] of params.entries()) {
    const skip = overridden.get(index);

    firstOutcome.push(outcomes.length);

    if (skip == null) {
      outcomes.push(...outcomesFor(entry, index));
      continue;
    }

    const { key, byId } = paramEntryKey(entry);

    outcomes.push(supersededParam(key, byId, skip.detail));
  }

  for (const [index, { by, label }] of overridden) {
    linkReplacer(outcomes[firstOutcome[index] as number] as ParamOutcome, {
      entry: outcomes[firstOutcome[by] as number] as ParamOutcome,
      by: label,
    });
  }

  return outcomes;
}

/**
 * @param device - The device the entries are looked up on, or null
 * @param params - The params list as the caller sent it
 * @param applies - Whether an entry competes at all
 * @returns For each overridden entry by position, what it says and who
 *   overrides it
 */
function overriddenParams(
  device: LiveAPI | null,
  params: ParamEntry[],
  applies: (entry: ParamEntry) => boolean,
): Map<number, Overridden> {
  if (params.length < 2) {
    return new Map();
  }

  // Read once for the whole list: every entry matches against these.
  const parameters = device?.getChildren("parameters") ?? [];
  const overriddenBy = lastWins(
    params.map((entry) =>
      applies(entry) ? entryClaims(parameters, device, entry) : [],
    ),
  );

  return new Map(
    [...overriddenBy].map(([index, by]) => {
      const { key, byId } = paramEntryKey(params[by] as ParamEntry);
      const label = byId ? `id ${key}` : `"${key}"`;

      return [index, { detail: namedAgain(label), by, label }];
    }),
  );
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
