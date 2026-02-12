// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Codex (OpenAI)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Recursively removes "path" properties from objects so tests can assert
 * semantic output without coupling to path formatting details.
 * @param value - Value to sanitize
 * @returns Value without nested "path" properties
 */
export function stripPathProperties(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stripPathProperties(item));
  }

  if (value != null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => key !== "path")
        .map(([key, nested]) => [key, stripPathProperties(nested)]),
    );
  }

  return value;
}
