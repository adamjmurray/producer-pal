// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";

/**
 * A single device parameter setting. Both fields are coerced to strings (a
 * numeric `value: 1` or `name: 3` arrives as `"1"`/`"3"`): the setter pipeline
 * interprets the value as a number, note name, enum, or unit-suffixed value at
 * write time, and resolves an all-digit name as a param id. Coercing `name`
 * keeps a small model that emits a numeric param index from hard-failing the
 * whole call at schema validation. The nullish guard (rather than
 * z.coerce.string) makes a missing or null field fail validation with a clear
 * error instead of silently becoming the literal string "undefined"/"null". A
 * `preprocess` (input-side) is used rather than a `.transform` so the schema
 * stays representable as JSON Schema for tools/list.
 */
export const paramEntrySchema = z.object({
  name: z.preprocess(coerceFieldToString, z.string()),
  value: z.preprocess(coerceFieldToString, z.string()),
});

/**
 * Coerce a param field to a string, leaving nullish alone so it still fails
 * validation. An object or array can never name or value a param, but it must
 * still reach the setter as a string: the setter warns and skips one bad entry,
 * where a validation failure would reject the whole multi-param call. JSON
 * rather than String() so that warning names what arrived instead of reading
 * "[object Object]".
 * @param value - The raw field value
 * @returns The value as a string, or the value itself when nullish
 */
function coerceFieldToString(value: unknown): unknown {
  if (value == null || typeof value === "string") return value;

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  // Safe: params arrive parsed from JSON-RPC, so there is no symbol, function
  // or circular value here for stringify to choke on.
  return JSON.stringify(value);
}

export type ParamEntry = z.infer<typeof paramEntrySchema>;

/**
 * Shared `params` input schema for ppal-create-device / ppal-update-device.
 *
 * Advertised to the model as a clean array of {name, value} (no anyOf union —
 * unions are the one shape small models mis-fill). The `preprocess` step also
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
