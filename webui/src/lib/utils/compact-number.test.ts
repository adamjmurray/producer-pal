// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { compactNumber } from "./compact-number";

describe("compactNumber", () => {
  it("formats small numbers without suffix", () => {
    expect(compactNumber(0)).toBe("0");
    expect(compactNumber(500)).toBe("500");
  });

  it("formats thousands with K suffix", () => {
    expect(compactNumber(1000)).toBe("1K");
    expect(compactNumber(17123)).toBe("17.1K");
  });

  it("formats millions with M suffix", () => {
    expect(compactNumber(1500000)).toBe("1.5M");
  });
});
