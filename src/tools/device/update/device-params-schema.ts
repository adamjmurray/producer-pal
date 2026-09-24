// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";

/**
 * A single device parameter setting, addressed by `name` or by `id`. Exactly
 * one is required, but that is checked by `validateParamEntries`, not here:
 * the OpenAI models fill the field they don't use with `""` rather than
 * leaving it out, and `anyOf` is the one shape small models mis-fill. Every
 * field is coerced to a string (a numeric `value: 1` or `id: 3` arrives as
 * `"1"`/`"3"`): the setter pipeline interprets the value at write time, and
 * an all-digit `name` still resolves as an id for callers that predate `id`.
 * A null `name` or `id` counts as left out: a model may send null for the
 * field it doesn't use. A null `value` fails validation rather than becoming
 * the string "null" (so no z.coerce.string). A `preprocess` (input-side) is
 * used rather than a `.transform` so the schema stays representable as JSON
 * Schema for tools/list.
 */
export const paramEntrySchema = z.object({
  name: z.preprocess(coerceAddressToString, z.string().optional()),
  id: z.preprocess(coerceAddressToString, z.string().optional()),
  value: z.preprocess(coerceFieldToString, z.string()),
});

/**
 * Coerce a `name` or `id` to a string, reading null as left out.
 * @param value - The raw field value
 * @returns The value as a string, or undefined when nullish
 */
function coerceAddressToString(value: unknown): unknown {
  return value === null ? undefined : coerceFieldToString(value);
}

/**
 * Coerce a param field to a string, leaving nullish alone so it still fails
 * validation. An object or array can never name or value a param, but it must
 * still reach the setter as a string: the setter refuses one bad entry in its own
 * result, where a validation failure would reject the whole multi-param call.
 * JSON rather than String() so that entry names what arrived instead of reading
 * "[object Object]".
 * @param value - The raw field value
 * @returns The value as a string, or the value itself when nullish
 */
function coerceFieldToString(value: unknown): unknown {
  if (value == null || typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  // Safe: params arrive parsed from JSON-RPC, so there is no symbol, function
  // or circular value here for stringify to choke on.
  return JSON.stringify(value);
}

export type ParamEntry = z.infer<typeof paramEntrySchema>;

/**
 * How an entry addresses its param, once `validateParamEntries` has trimmed it
 * and dropped the blank field: by id when `id` is set, else by name.
 * @param entry - A validated param entry
 * @returns The id or name the entry was sent under, and which it is
 */
export function paramEntryKey(entry: ParamEntry): {
  key: string;
  byId: boolean;
} {
  return entry.id != null
    ? { key: entry.id, byId: true }
    : { key: entry.name ?? "", byId: false };
}

/**
 * Shared `params` input schema for ppal-create-device / ppal-update-device.
 *
 * Advertised to the model as a clean array of {name?, id?, value} (no anyOf
 * union — unions are the one shape small models mis-fill; the schema-compat
 * probe's `name-or-id-entries` variant shows small models fill this one). The `preprocess` step also
 * accepts a JSON-stringified array, absorbing the small-model habit of
 * stringifying structured args without exposing that fragility in the schema.
 * Callers add their own `.describe(...)` for tool-specific wording.
 */
export const paramsInputSchema = z
  .preprocess((value) => {
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    }

    return value;
  }, z.array(paramEntrySchema))
  .optional();
