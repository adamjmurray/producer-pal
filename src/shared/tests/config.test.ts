// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  MIN_LIVE_VERSION,
  SAME_TIME_EPSILON,
  VERSION,
} from "#src/shared/config.ts";

describe("config constants", () => {
  it("VERSION is a semver-shaped string", () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it("MIN_LIVE_VERSION is a 3-part version with no 'v' prefix", () => {
    // Consumed by the Live-version gate; an empty or malformed value would
    // silently break the "your Live is too old" check.
    expect(MIN_LIVE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("SAME_TIME_EPSILON is a small positive position tolerance", () => {
    expect(SAME_TIME_EPSILON).toBeGreaterThan(0);
    expect(SAME_TIME_EPSILON).toBeLessThan(0.01);
  });
});
