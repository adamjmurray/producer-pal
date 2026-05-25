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
  name: z.preprocess((v) => (v == null ? v : String(v)), z.string()),
  value: z.preprocess((v) => (v == null ? v : String(v)), z.string()),
});

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
