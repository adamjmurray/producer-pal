// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import { SYSTEM_INSTRUCTION, getModelName, getThinkingBudget } from "./config";

describe("config", () => {
  describe("SYSTEM_INSTRUCTION", () => {
    it("is a non-empty string", () => {
      expect(typeof SYSTEM_INSTRUCTION).toBe("string");
      expect(SYSTEM_INSTRUCTION.length).toBeGreaterThan(0);
    });

    it("contains key concepts", () => {
      expect(SYSTEM_INSTRUCTION).toContain("Producer Pal");
      expect(SYSTEM_INSTRUCTION).toContain("Ableton Live");
    });
  });

  describe("getModelName", () => {
    it("returns display name for gemini-2.5-pro", () => {
      expect(getModelName("gemini-2.5-pro")).toBe("Gemini 2.5 Pro");
    });

    it("returns display name for gemini-2.5-flash", () => {
      expect(getModelName("gemini-2.5-flash")).toBe("Gemini 2.5 Flash");
    });

    it("returns display name for gemini-2.5-flash-lite", () => {
      expect(getModelName("gemini-2.5-flash-lite")).toBe(
        "Gemini 2.5 Flash-Lite",
      );
    });

    it("returns the modelId unchanged for unknown models", () => {
      expect(getModelName("unknown-model")).toBe("unknown-model");
      expect(getModelName("gemini-1.5-pro")).toBe("gemini-1.5-pro");
    });
  });

  describe("getThinkingBudget", () => {
    it("returns 0 for Off level", () => {
      expect(getThinkingBudget("Off")).toBe(0);
    });

    it("returns 2048 for Low level", () => {
      expect(getThinkingBudget("Low")).toBe(2048);
    });

    it("returns 4096 for Medium level", () => {
      expect(getThinkingBudget("Medium")).toBe(4096);
    });

    it("returns 8192 for High level", () => {
      expect(getThinkingBudget("High")).toBe(8192);
    });

    it("returns 16384 for Ultra level", () => {
      expect(getThinkingBudget("Ultra")).toBe(16384);
    });

    it("returns -1 for Auto level", () => {
      expect(getThinkingBudget("Default")).toBe(-1);
    });

    it("returns -1 (Auto) for unknown levels", () => {
      expect(getThinkingBudget("Unknown")).toBe(-1);
      expect(getThinkingBudget("VeryHigh")).toBe(-1);
    });
  });
});
