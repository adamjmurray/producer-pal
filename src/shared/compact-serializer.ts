// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Matches JS identifiers and integer literals — both legal as unquoted object
// keys. Anything else (spaces, hyphens, leading dash, decimals) gets quoted.
const UNQUOTED_KEY_RE = /^(?:[$A-Z_a-z][\w$]*|\d+)$/;

/**
 * Converts object to compact JavaScript literal syntax with unquoted keys
 * - Unquoted keys where valid JS identifiers; otherwise JSON-quoted
 * - No whitespace
 * - Skips undefined values in objects/arrays
 * - Top-level undefined returns empty string
 *
 * @param obj - Object to convert
 * @returns Compact JS literal string
 */
export function toCompactJSLiteral(obj: unknown): string {
  /**
   * Convert a value to compact JS literal syntax
   * @param val - Value to convert
   * @returns Converted value or undefined
   */
  function convert(val: unknown): string | undefined {
    // Primitives that need special treatment other than JSON.stringify() below
    if (val === null) {
      return "null";
    }

    if (Array.isArray(val)) {
      const items = val.map(convert).filter((v) => v !== undefined);

      return "[" + items.join(",") + "]";
    }

    if (typeof val === "object") {
      const pairs: string[] = [];

      for (const [key, value] of Object.entries(val)) {
        const converted = convert(value);

        if (converted === undefined) {
          continue;
        } // Skip undefined values

        const keyStr = UNQUOTED_KEY_RE.test(key) ? key : JSON.stringify(key);

        pairs.push(keyStr + ":" + converted);
      }

      return "{" + pairs.join(",") + "}";
    }

    return JSON.stringify(val);
  }

  const result = convert(obj);

  return result ?? "";
}
