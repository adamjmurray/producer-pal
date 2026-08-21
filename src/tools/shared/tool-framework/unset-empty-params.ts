// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z, type ZodType } from "zod";

/**
 * Drops the args a caller sent as empty, so they read as params never sent.
 *
 * Clients fill the params they have no value for with null, and the schema
 * turns that into something the caller never sent: `z.coerce.number()` makes it
 * 0, a real index; `z.coerce.string()` makes it "null", a real name; a boolean,
 * enum or array rejects it and takes the whole call down. Dropping the arg
 * first keeps an `x == null` check honest and lets a defaulted param fall back
 * to its default.
 *
 * Runs on the args, not the schema, so what the model is published stays
 * exactly what each param declares.
 * @param args - The raw args, as the caller sent them
 * @param schema - The tool's params, keyed by name
 * @returns The args, minus the ones that named nothing
 */
export function unsetEmptyParams(
  args: Record<string, unknown>,
  schema: Record<string, ZodType>,
): Record<string, unknown> {
  const kept: Record<string, unknown> = {};

  for (const [name, value] of Object.entries(args)) {
    const param = schema[name];

    // An arg the tool doesn't declare is left for the unexpected-argument
    // warning to report.
    if (param == null || !isEmptyParamValue(value, param)) kept[name] = value;
  }

  return kept;
}

/**
 * Reads every param in a nested schema's shape sent as empty as unset. Only for
 * a shape {@link unsetEmptyParams} cannot reach, a level down from the args.
 * @param shape - The params, keyed by name
 * @returns The same params, each reading an empty value as unset
 */
export function optionalParams<T extends Record<string, ZodType>>(shape: T): T {
  return Object.fromEntries(
    Object.entries(shape).map(([name, schema]) => [
      name,
      z.preprocess(
        (value) => (isEmptyParamValue(value, schema) ? undefined : value),
        schema,
      ),
    ]),
    // A preprocess parses to what it wraps, so the shape's types are unchanged.
  ) as unknown as T;
}

/**
 * Whether a value names nothing: a null, or a blank string where blank is not
 * a value of its own. A blank survives on a text param, where clearing a name
 * or a clip's notes is a real request.
 * @param value - The value the caller sent
 * @param schema - The param's schema
 * @returns True when the param should read as unset
 */
function isEmptyParamValue(value: unknown, schema: ZodType): boolean {
  if (value == null) return true;

  if (typeof value !== "string" || value.trim() !== "") return false;

  return schema.safeParse("").data !== "";
}
