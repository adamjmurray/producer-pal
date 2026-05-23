// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";

/**
 * A single device parameter setting. `value` is a coerced string (a numeric
 * `value: 1` arrives as `"1"`); the setter pipeline interprets it as a number,
 * note name, enum, or unit-suffixed value at write time.
 */
export const paramEntrySchema = z.object({
  name: z.string(),
  value: z.coerce.string(),
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
