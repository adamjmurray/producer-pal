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
 * track 0 instead of refusing. Dropping those values before coercion keeps the
 * check honest, and a bounded param stops rejecting the whole call. The
 * published JSON Schema is unchanged: the param is just optional.
 * @param schema - The numeric schema, with its coercion and bounds
 * @returns The schema, reading a null or blank value as unset
 */
export function optionalNumber(
  schema: z.ZodType<number>,
): z.ZodType<number | undefined> {
  return z.preprocess(
    (value) =>
      value == null || (typeof value === "string" && value.trim() === "")
        ? undefined
        : value,
    // A schema with a .default() already handles undefined; wrapping it in
    // .optional() would short-circuit before the default could fire.
    schema.safeParse(undefined).success ? schema : schema.optional(),
  );
}
