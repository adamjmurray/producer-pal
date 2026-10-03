// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";

// A model writing the word instead of leaving the param out: "null" or
// "undefined" as a param's whole value. (A JSON null never gets this far — it
// is dropped before the schema coerces, over MCP and REST alike.)
const COERCED_NULLISH = new Set(["null", "undefined"]);

/**
 * Whether a param's value names something. Nullish, blank, and the words a
 * caller writes for nothing all mean "unset", so a caller that meant to send
 * nothing is never counted as having sent a value. Silent — use
 * {@link namedParam} to read a published param, which also says so.
 * @param value - Raw param value
 * @returns True when the value names something
 */
export function paramNamesSomething(value: unknown): boolean {
  if (value == null) {
    return false;
  }

  if (typeof value !== "string") {
    return true;
  }

  return value.trim() !== "" && !isCoercedNullish(value);
}

/**
 * Whether a param's whole value is only what a JSON null coerced into. Useful
 * where such a value would otherwise count as an entry the caller named.
 * @param value - Raw param value
 * @returns True when the value is "null" or "undefined"
 */
export function isCoercedNullish(value: string): boolean {
  return COERCED_NULLISH.has(value.trim());
}

/**
 * Reads a published param, dropping a value that names nothing. A blank reads
 * as omitted; a coerced null warns first, since the caller meant to send
 * nothing and the schema turned it into a value. Counting it as sent is how a
 * call gets refused, or a value paired with the wrong object.
 * @param value - Raw param value
 * @param label - Param name, for the warning
 * @returns The trimmed value, or undefined when it names nothing
 */
export function namedParam(
  value: string | null | undefined,
  label: string,
): string | undefined {
  const trimmed = value?.trim();

  if (trimmed == null || trimmed === "") {
    return undefined;
  }

  if (!isCoercedNullish(trimmed)) {
    return trimmed;
  }

  console.warn(`${label} "${trimmed}" names nothing`);

  return undefined;
}

/**
 * Reads a target from the canonical `id` param, falling back to a name the tool
 * still accepts (`clipId`, `ids`, ...). The alias only fills in for a caller
 * that did not send `id`. Both arriving names the target twice, so the call is
 * refused, whatever the values.
 * @param id - The `id` param
 * @param alias - The alias param
 * @param aliasLabel - The alias's name, for the refusal
 * @returns The trimmed value, or undefined when neither names anything
 * @throws Error when both name something
 */
export function namedIdParam(
  id: string | null | undefined,
  alias: string | null | undefined,
  aliasLabel: string,
): string | undefined {
  return namedAliasedParam(id, "id", alias, aliasLabel);
}

/**
 * Reads a target from the canonical `path` param, falling back to `paths`. Same
 * deal as {@link namedIdParam}: `path` already takes a comma-separated list, so
 * the plural is a guess, and one beside `path` is refused.
 * @param path - The `path` param
 * @param paths - The `paths` alias param
 * @returns The trimmed value, or undefined when neither names anything
 * @throws Error when both name something
 */
export function namedPathParam(
  path: string | null | undefined,
  paths: string | null | undefined,
): string | undefined {
  return namedAliasedParam(path, "path", paths, "paths");
}

/**
 * Folds an alias onto the param it stands in for.
 * @param value - The canonical param's value
 * @param canonical - The canonical param's name
 * @param alias - The alias param's value
 * @param aliasLabel - The alias param's name
 * @returns The trimmed value, or undefined when neither names anything
 * @throws Error when both name something
 */
function namedAliasedParam(
  value: string | null | undefined,
  canonical: string,
  alias: string | null | undefined,
  aliasLabel: string,
): string | undefined {
  const named = namedParam(value, canonical);
  const namedAlias = namedParam(alias, aliasLabel);

  if (named == null) {
    return namedAlias;
  }

  // A param and its alias are never sent together, whatever their values: no
  // caller has a reason to, and a pair that agrees today can drift apart.
  refuseNamedTwice({
    param: canonical,
    value: named,
    noun: "target",
    also: { [aliasLabel]: namedAlias },
  });

  return named;
}

/** The param that names the target, and the params sent beside it. */
interface NamedTwice {
  /** The param that names the target on its own ("path", "slot") */
  param: string;
  /** That param's value, as received */
  value: unknown;
  /** What it names, for the message ("scene", "destination") */
  noun: string;
  /** The params that name it again, by name, as received */
  also: Readonly<Record<string, unknown>>;
  /** A short note on the end, e.g. which spelling is deprecated */
  hint?: string;
}

/**
 * Refuses a call that names its target twice, through two params. The one
 * wording for every such refusal: `<param> names the <noun> on its own - don't
 * send <params> with it`. The conflict is in the args, so the refusal comes
 * before any work and nothing is changed.
 * @param args - The naming param, what it names, and the params to check
 * @param args.param - The param that names the target on its own
 * @param args.value - That param's value, as received
 * @param args.noun - What it names, for the message
 * @param args.also - The params that name it again, by name, as received
 * @param args.hint - A short note on the end, e.g. which spelling is deprecated
 * @throws Error naming the params that were sent beside it
 */
export function refuseNamedTwice({
  param,
  value,
  noun,
  also,
  hint,
}: NamedTwice): void {
  if (!paramNamesSomething(value)) {
    return;
  }

  const sent = Object.keys(also).filter((name) =>
    paramNamesSomething(also[name]),
  );

  if (sent.length > 0) {
    throw new Error(
      `${param} names the ${noun} on its own - don't send ${sent.join(" or ")} with it` +
        (hint == null ? "" : ` (${hint})`),
    );
  }
}
