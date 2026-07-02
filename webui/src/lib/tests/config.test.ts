// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from "vitest";
import {
  SYSTEM_INSTRUCTION,
  getModelName,
  getThinkingBudget,
  resolveSystemInstruction,
} from "#webui/lib/config";

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

  describe("resolveSystemInstruction", () => {
    it("falls back to the built-in for blank/absent overrides", () => {
      expect(resolveSystemInstruction()).toBe(SYSTEM_INSTRUCTION);
      expect(resolveSystemInstruction("")).toBe(SYSTEM_INSTRUCTION);
      expect(resolveSystemInstruction("   \n ")).toBe(SYSTEM_INSTRUCTION);
      expect(resolveSystemInstruction(null)).toBe(SYSTEM_INSTRUCTION);
    });

    it("uses a non-blank override verbatim", () => {
      expect(resolveSystemInstruction("My custom prompt")).toBe(
        "My custom prompt",
      );
    });
  });

  describe("getModelName", () => {
    it("returns display name for gemini-3.5-flash", () => {
      expect(getModelName("gemini-3.5-flash")).toBe("Gemini 3.5 Flash");
    });

    it("returns display name for gemini-3.1-flash-lite", () => {
      expect(getModelName("gemini-3.1-flash-lite")).toBe(
        "Gemini 3.1 Flash-Lite",
      );
    });

    it("returns display name for Anthropic models", () => {
      // ANTHROPIC_MODELS was missing from ALL_MODELS, so Anthropic ids rendered
      // as the raw id (e.g. in the chat header and LockedSettingsNotice).
      expect(getModelName("claude-opus-4-8")).toBe("Claude Opus 4.8");
      expect(getModelName("claude-sonnet-5")).toBe("Claude Sonnet 5");
    });

    it("strips [Paid] tag from OpenRouter model labels", () => {
      expect(getModelName("google/gemini-3.5-flash")).toBe(
        "Google Gemini 3.5 Flash",
      );
    });

    it("strips [Free] tag from OpenRouter model labels", () => {
      expect(getModelName("google/gemma-4-26b-a4b-it:free")).toBe(
        "Google Gemma 4 26B",
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
