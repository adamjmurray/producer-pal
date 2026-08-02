// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Read a recorded tool-call arg (or tool-result field) as text. These arrive
 * as `unknown`, so anything that isn't a scalar or an array of them reads as
 * the fallback rather than "[object Object]".
 *
 * @param value - The raw arg or result field
 * @param fallback - Text to use when the value can't be read as text
 * @returns The value's text
 */
export function argText(value: unknown, fallback = ""): string {
  if (typeof value === "string") return value;

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) return value.map((v) => argText(v)).join(",");

  return fallback;
}
