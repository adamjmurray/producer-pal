// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Converts object to compact JavaScript literal syntax with unquoted keys
 * - Unquoted keys (where valid JS identifiers)
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

        // assume key doesn't need to be quoted
        // to generate valid JS we might need to be stricter here, but since we're using
        // this to send text to an LLM, it should be fine (and all our keys should be valid unquoted anyway)
        pairs.push(key + ":" + converted);
      }

      return "{" + pairs.join(",") + "}";
    }

    return JSON.stringify(val);
  }

  const result = convert(obj);

  return result ?? "";
}
