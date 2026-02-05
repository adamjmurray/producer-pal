// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { formatTimestamp } from "./format-timestamp";

describe("formatTimestamp", () => {
  it("returns a formatted string for a valid timestamp", () => {
    const timestamp = 1703721600000; // 2023-12-28 00:00:00 UTC

    const result = formatTimestamp(timestamp);

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("formats current time", () => {
    const now = Date.now();

    const result = formatTimestamp(now);

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("handles Unix epoch (zero)", () => {
    const result = formatTimestamp(0);

    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
    // Verify it matches expected locale string for epoch (timezone-agnostic)
    expect(result).toBe(new Date(0).toLocaleString());
  });

  it("handles timestamps in the past", () => {
    const timestamp = 946684800000; // 2000-01-01 00:00:00 UTC

    const result = formatTimestamp(timestamp);

    expect(typeof result).toBe("string");
    expect(result).toBe(new Date(timestamp).toLocaleString());
  });

  it("handles timestamps in the future", () => {
    const timestamp = 1893456000000; // 2030-01-01 00:00:00 UTC

    const result = formatTimestamp(timestamp);

    expect(typeof result).toBe("string");
    expect(result).toBe(new Date(timestamp).toLocaleString());
  });

  it("returns 'Invalid Date' for NaN input", () => {
    const result = formatTimestamp(Number.NaN);

    expect(result).toBe("Invalid Date");
  });

  it("returns 'Invalid Date' for Infinity", () => {
    const result = formatTimestamp(Infinity);

    expect(result).toBe("Invalid Date");
  });
});
