// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { extractWarnings } from "./tool-call-warning-helpers";

/**
 * Build a tool result string matching the MCP content array format.
 * @param data - The tool result object
 * @param warnings - Optional warning strings to append as extra content blocks
 * @returns Serialized result string
 */
function toolResult(data: object, ...warnings: string[]): string {
  const content = [
    { type: "text", text: JSON.stringify(data) },
    ...warnings.map((w) => ({ type: "text", text: w })),
  ];

  return JSON.stringify(content);
}

describe("extractWarnings", () => {
  it("extracts single warning from MCP content array", () => {
    const result = toolResult(
      { id: "44" },
      "WARNING: quantize parameter ignored for audio clip (id 44)",
    );

    expect(extractWarnings(result)).toStrictEqual([
      "quantize parameter ignored for audio clip (id 44)",
    ]);
  });

  it("extracts multiple warnings", () => {
    const result = toolResult(
      { id: "44" },
      "WARNING: quantize parameter ignored for audio clip (id 44)",
      "WARNING: Color #ZZZZZZ is not a valid hex color, skipping",
    );

    expect(extractWarnings(result)).toStrictEqual([
      "quantize parameter ignored for audio clip (id 44)",
      "Color #ZZZZZZ is not a valid hex color, skipping",
    ]);
  });

  it("handles case-insensitive Warning: prefix", () => {
    const result = toolResult(
      { view: "arrangement" },
      "Warning: ppal-select ignored unexpected argument(s): invalidParam",
    );

    expect(extractWarnings(result)).toStrictEqual([
      "ppal-select ignored unexpected argument(s): invalidParam",
    ]);
  });

  it("returns empty array for results with no warnings", () => {
    const result = toolResult({ id: "1", name: "Track" });

    expect(extractWarnings(result)).toStrictEqual([]);
  });

  it("returns empty array for malformed JSON", () => {
    expect(extractWarnings("[invalid json")).toStrictEqual([]);
  });

  it("returns empty array for non-array results", () => {
    expect(extractWarnings('{"id":"1"}')).toStrictEqual([]);
  });

  it("returns empty array for JSON-stringified string", () => {
    expect(extractWarnings('"some string"')).toStrictEqual([]);
  });
});
