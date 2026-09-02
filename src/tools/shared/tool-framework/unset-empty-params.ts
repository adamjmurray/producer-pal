// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z, type ZodType } from "zod";

/**
 * Drops the args a caller sent as null, and refuses a blank one on a param
 * that has no blank value.
 *
 * Clients fill the params they have no value for with null, and the schema
 * turns that into something the caller never sent: `z.coerce.number()` makes it
 * 0, a real index; `z.coerce.string()` makes it "null", a real name; a boolean,
 * enum or array rejects it and takes the whole call down. Dropping the arg
 * first keeps an `x == null` check honest and lets a defaulted param fall back
 * to its default.
 *
 * A blank string is different: a number, boolean, enum or array has no empty
 * value, so a blank one is a mistake whichever way you read it. Dropping it
 * silently is how `bpm: ""` used to become a call that set no tempo and said
 * nothing. It survives on a text param, where clearing a name or a clip's notes
 * is a real request.
 *
 * Runs on the args, not the schema, so what the model is published stays
 * exactly what each param declares.
 * @param args - The raw args, as the caller sent them
 * @param schema - The tool's params, keyed by name
 * @returns The args, minus the ones that named nothing
 * @throws Error when a param with no blank value was sent a blank string
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
    if (param == null) {
      kept[name] = value;
      continue;
    }

    if (value == null) continue;

    if (isBlankString(value) && !blankIsAValue(param)) {
      throw new Error(blankParamMessage(name));
    }

    kept[name] = value;
  }

  return kept;
}

/**
 * The message a blank on a param with no blank value gets. Says to leave the
 * param out rather than to send null: a client that had a value would have sent
 * it, and null is what the ones that fill every param already send.
 * @param name - The param name
 * @returns The error message
 */
export function blankParamMessage(name: string): string {
  return (
    `${name}: a blank string is not a value for this param. ` +
    `Leave it out instead.`
  );
}

/**
 * Gives every param in a nested schema's shape the same reading of an empty
 * value as {@link unsetEmptyParams}: a null is unset, and a blank on a param
 * with no blank value is refused. Only for a shape the args-level pass cannot
 * reach, a level down from the args.
 * @param shape - The params, keyed by name
 * @returns The same params, each reading an empty value the same way
 */
export function optionalParams<T extends Record<string, ZodType>>(shape: T): T {
  return Object.fromEntries(
    Object.entries(shape).map(([name, schema]) => [
      name,
      z.preprocess((value) => emptyParamValue(name, value, schema), schema),
    ]),
    // A preprocess parses to what it wraps, so the shape's types are unchanged.
  ) as unknown as T;
}

/**
 * One nested param's value, with a null read as unset and a blank refused where
 * the param has no blank value.
 * @param name - The param name, for the error message
 * @param value - The value the caller sent
 * @param schema - The param's schema
 * @returns The value, or undefined when it reads as unset
 * @throws Error when a param with no blank value was sent a blank string
 */
function emptyParamValue(
  name: string,
  value: unknown,
  schema: ZodType,
): unknown {
  if (value == null) return undefined;

  if (isBlankString(value) && !blankIsAValue(schema)) {
    throw new Error(blankParamMessage(name));
  }

  return value;
}

/**
 * @param value - The value the caller sent
 * @returns True when the value is a string with nothing in it
 */
function isBlankString(value: unknown): boolean {
  return typeof value === "string" && value.trim() === "";
}

/**
 * Whether a blank string is a value this param can hold — true for a text
 * param, where clearing a name or a clip's notes is a real request.
 * @param schema - The param's schema
 * @returns True when blank parses to blank
 */
function blankIsAValue(schema: ZodType): boolean {
  return schema.safeParse("").data === "";
}
