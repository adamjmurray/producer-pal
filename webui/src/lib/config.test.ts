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

    it("returns display name for gemini-3-flash-preview", () => {
      expect(getModelName("gemini-3-flash-preview")).toBe("Gemini 3 Flash");
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

    it("returns 16384 for Max level", () => {
      expect(getThinkingBudget("Max")).toBe(16384);
    });

    it("returns -1 for Default level", () => {
      expect(getThinkingBudget("Default")).toBe(-1);
    });

    it("returns -1 for unknown levels", () => {
      expect(getThinkingBudget("Unknown")).toBe(-1);
      expect(getThinkingBudget("High")).toBe(-1);
    });
  });
});
