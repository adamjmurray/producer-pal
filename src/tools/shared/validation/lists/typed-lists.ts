// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Schemas for a boolean or number param that pairs one entry per target.
//
// `z.boolean()` and `z.coerce.number()` refuse "true,false" before the handler
// runs, so these params declare a coerced string and check each entry here.
// The coercion is what keeps a single typed value working: a model that sends
// `true` or `-6` gets "true" / "-6" before the entries are read. A blank is
// refused, which is also how unset-empty-params tells these apart from a text
// param that can be cleared.

import { z, type ZodType } from "zod";
import { type ListEntries, valueForIndex } from "./list-pairing.ts";

/** What a number list allows in each entry. */
export interface NumberListOptions {
  /** The lowest value an entry may name. */
  min?: number;
  /** The highest value an entry may name. */
  max?: number;
  /** Refuse an entry with a fractional part. */
  int?: boolean;
}

/**
 * A param whose entries are each `true` or `false`, in any case and with
 * spaces around them. One value still covers every target.
 * @returns A coerced string schema, `type: "string"` in the published schema
 */
export function booleanList(): ZodType<string> {
  return entryList(isBooleanEntry, "each entry must be true or false");
}

/**
 * A param whose entries are each a number in range.
 * @param options - The range each entry is held to
 * @returns A coerced string schema, `type: "string"` in the published schema
 */
export function numberList(options: NumberListOptions = {}): ZodType<string> {
  const schema = entryList(
    (entry) => inRange(entry, options),
    rangeMessage(options),
  );

  if (options.int !== true) {
    return schema;
  }

  // Entries that aren't numbers at all already failed above, and this skips
  // them, so a bad entry gets one complaint rather than two.
  return schema.refine(
    (value) =>
      listEntries(value).every((entry) => {
        const parsed = entryNumber(entry);

        return parsed == null || Number.isInteger(parsed);
      }),
    { message: "each entry must be a whole number" },
  );
}

/**
 * One target's boolean: the whole value when the call named one target, else
 * the entry in that position. Mirrors {@link valueForIndex}.
 * @param value - The raw param, as the caller sent it
 * @param index - The target's position in the call
 * @param parsed - The split entries, or null when the value covers every target
 * @returns The boolean, or undefined when nothing pairs with this target
 */
export function booleanForIndex(
  value: string | undefined,
  index: number,
  parsed: ListEntries | null,
): boolean | undefined {
  const entry = valueForIndex(value, index, parsed);

  return entry == null ? undefined : entry.trim().toLowerCase() === "true";
}

/**
 * One target's number, the same way {@link booleanForIndex} reads a boolean.
 * @param value - The raw param, as the caller sent it
 * @param index - The target's position in the call
 * @param parsed - The split entries, or null when the value covers every target
 * @returns The number, or undefined when nothing pairs with this target
 */
export function numberForIndex(
  value: string | undefined,
  index: number,
  parsed: ListEntries | null,
): number | undefined {
  const entry = valueForIndex(value, index, parsed);

  // An entry that names no number reads as unset rather than as NaN, so a
  // value the schema somehow let through can't reach the Live API.
  return entry == null ? undefined : (entryNumber(entry) ?? undefined);
}

/**
 * A coerced string whose every entry passes a per-entry test.
 * @param isValid - What each entry has to be
 * @param message - What the caller is told when one isn't
 * @returns The schema
 */
function entryList(
  isValid: (entry: string) => boolean,
  message: string,
): ZodType<string> {
  return z.coerce.string().refine(
    (value) => {
      const entries = listEntries(value);

      return entries.length > 0 && entries.every(isValid);
    },
    { message },
  );
}

/**
 * The entries of a comma-separated value, reading one trailing comma as a typo
 * rather than an entry — the same way the splitters do. A blank value names no
 * entries, which is how it gets refused.
 * @param value - The raw param value
 * @returns The entries, untrimmed
 */
function listEntries(value: string): string[] {
  const entries = value.split(",");

  if (entries.at(-1)?.trim() === "") {
    entries.pop();
  }

  return entries;
}

/**
 * @param entry - One entry of the list
 * @returns True when the entry spells a boolean
 */
function isBooleanEntry(entry: string): boolean {
  const spelling = entry.trim().toLowerCase();

  return spelling === "true" || spelling === "false";
}

/**
 * @param entry - One entry of the list
 * @returns The number it names, or null when it names none
 */
function entryNumber(entry: string): number | null {
  const trimmed = entry.trim();
  const parsed = Number(trimmed);

  // Number("") is 0 and Number(" ") is 0, so an empty entry has to go first.
  return trimmed === "" || !Number.isFinite(parsed) ? null : parsed;
}

/**
 * @param entry - One entry of the list
 * @param options - The range each entry is held to
 * @returns True when the entry names a number inside the range
 */
function inRange(entry: string, options: NumberListOptions): boolean {
  const parsed = entryNumber(entry);

  return (
    parsed != null &&
    (options.min == null || parsed >= options.min) &&
    (options.max == null || parsed <= options.max)
  );
}

/**
 * @param options - The range each entry is held to
 * @returns What the caller is told when an entry is out of it
 */
function rangeMessage(options: NumberListOptions): string {
  const { min, max } = options;
  const head = "each entry must be a number";

  if (min != null && max != null) {
    return `${head} from ${min} to ${max}`;
  }

  if (min != null) {
    return `${head} ${min} or greater`;
  }

  return max == null ? head : `${head} ${max} or less`;
}
