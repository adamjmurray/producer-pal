// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Tests for output configuration
 */

import { describe, expect, it, beforeEach } from "vitest";
import { setQuietMode, isQuietMode } from "./output-config.ts";

describe("output-config", () => {
  beforeEach(() => {
    // Reset to default state
    setQuietMode(false);
  });

  describe("setQuietMode", () => {
    it("enables quiet mode when set to true", () => {
      setQuietMode(true);

      expect(isQuietMode()).toBe(true);
    });

    it("disables quiet mode when set to false", () => {
      setQuietMode(true);
      setQuietMode(false);

      expect(isQuietMode()).toBe(false);
    });
  });

  describe("isQuietMode", () => {
    it("returns false by default", () => {
      expect(isQuietMode()).toBe(false);
    });

    it("returns the current quiet mode state", () => {
      expect(isQuietMode()).toBe(false);
      setQuietMode(true);
      expect(isQuietMode()).toBe(true);
    });
  });
});
