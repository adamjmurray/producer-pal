// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// A published param and the deprecated one it replaced both naming something
// has no reading the tool can act on: honoring either would use a target or a
// destination the caller didn't ask for. So the call never picks.
//
// Reading both through the presence helpers is half the guard. A value the
// schema coerced from a JSON null ("null" as the whole value, or an all-empty
// list) names nothing, and counting it as sent refuses a call that had no
// conflict — a bug that has been fixed once per param until this became one
// function.

import { namedParam } from "#src/tools/shared/helpers/param-presence.ts";
import { namedHiddenPath } from "#src/tools/shared/validation/helpers/object-paths.ts";

/** The two spellings of one thing, as the tool received them. */
export interface DoubledSpellingArgs {
  /** The published param's name ("path", "toPath") */
  param: string;
  /** The published param's value, as received */
  value: string | null | undefined;
  /** The deprecated param's name ("slot", "toSlot") */
  alias: string;
  /** The deprecated param's value, as received */
  aliasValue: string | null | undefined;
  /** What the two both name, for the message ("a clip", "a destination") */
  noun: string;
}

/** What each spelling named, undefined where it named nothing. */
export interface NamedSpelling {
  value: string | undefined;
  aliasValue: string | undefined;
}

/**
 * Reads the pair, refusing a call that spelled it both ways. The conflict is in
 * the args, so it is known before anything runs: refusing is atomic and the
 * caller retries with one spelling. Warning instead would return a
 * success-shaped result for the rest of a call we couldn't read (ADR-0035).
 * @param args - The two params as the tool received them
 * @returns What each spelling named
 */
export function refuseDoubledSpelling(
  args: DoubledSpellingArgs,
): NamedSpelling {
  const named = readSpellings(args);

  if (named.value != null && named.aliasValue != null) {
    throw new Error(
      `${args.param} and ${args.alias} both name ${args.noun}; ` +
        `use ${args.param} alone (${args.alias} is deprecated)`,
    );
  }

  return named;
}

// --- Helpers below main exports ---

/**
 * Reads both params, dropping a value that names nothing.
 * @param args - The two params as the tool received them
 * @returns What each spelling named
 */
function readSpellings(args: DoubledSpellingArgs): NamedSpelling {
  return {
    value: namedParam(args.value, args.param),
    aliasValue: namedHiddenPath(args.aliasValue ?? undefined, args.alias),
  };
}
