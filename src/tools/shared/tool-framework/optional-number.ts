// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { z } from "zod";

/**
 * An optional numeric param where "unset" stays unset.
 *
 * `z.coerce.number()` runs `Number()`, and `Number(null)` and `Number("")` are
 * both 0 — a real index the caller never sent. A tool that checks `x == null`
 * to decide whether it was given a location then silently reads or writes
 * track 0 instead of refusing. Nulling those values before coercion keeps the
 * check honest. The published JSON Schema only gains `null`.
 * @param schema - The numeric schema, with its coercion and bounds
 * @returns The schema, reading a null or blank value as null
 */
export function optionalNumber(
  schema: z.ZodType<number>,
): z.ZodOptional<z.ZodType<number | null>> {
  return z
    .preprocess(
      (value) =>
        typeof value === "string" && value.trim() === "" ? null : value,
      schema.nullable(),
    )
    .optional();
}
