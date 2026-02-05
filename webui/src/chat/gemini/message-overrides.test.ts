// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import { applyGeminiOverrides } from "./message-overrides";

describe("applyGeminiOverrides", () => {
  describe("temperature overrides", () => {
    it("returns config temperature when no override", () => {
      const result = applyGeminiOverrides({}, { temperature: 0.5 });

      expect(result.temperature).toBe(0.5);
    });

    it("uses override temperature when provided", () => {
      const result = applyGeminiOverrides(
        { temperature: 0.8 },
        { temperature: 0.5 },
      );

      expect(result.temperature).toBe(0.8);
    });
  });

  describe("thinking overrides", () => {
    it("returns config thinkingConfig when no override", () => {
      const config = {
        thinkingConfig: { thinkingBudget: 4096, includeThoughts: true },
      };
      const result = applyGeminiOverrides({}, config);

      expect(result.thinkingConfig).toStrictEqual({
        thinkingBudget: 4096,
        includeThoughts: true,
      });
    });

    it("sets thinkingConfig to undefined when thinking is Off", () => {
      const config = {
        thinkingConfig: { thinkingBudget: 4096, includeThoughts: true },
      };
      const result = applyGeminiOverrides({ thinking: "Off" }, config);

      expect(result.thinkingConfig).toBeUndefined();
    });

    it("sets thinkingConfig to undefined when thinking is Minimal", () => {
      const config = {
        thinkingConfig: { thinkingBudget: 4096, includeThoughts: true },
      };
      const result = applyGeminiOverrides({ thinking: "Minimal" }, config);

      expect(result.thinkingConfig).toBeUndefined();
    });

    it("updates thinkingBudget based on thinking level", () => {
      const config = {
        thinkingConfig: { thinkingBudget: 1000, includeThoughts: true },
      };
      const result = applyGeminiOverrides({ thinking: "High" }, config);

      expect(result.thinkingConfig?.thinkingBudget).toBe(8192);
      expect(result.thinkingConfig?.includeThoughts).toBe(true);
    });

    it("preserves includeThoughts from original config", () => {
      const config = {
        thinkingConfig: { thinkingBudget: 1000, includeThoughts: false },
      };
      const result = applyGeminiOverrides({ thinking: "Medium" }, config);

      expect(result.thinkingConfig?.includeThoughts).toBe(false);
    });

    it("defaults includeThoughts to true when no original config", () => {
      const result = applyGeminiOverrides({ thinking: "Low" }, {});

      expect(result.thinkingConfig?.includeThoughts).toBe(true);
    });
  });

  describe("showThoughts overrides", () => {
    it("overrides includeThoughts when showThoughts is false", () => {
      const config = {
        thinkingConfig: { thinkingBudget: 4096, includeThoughts: true },
      };
      const result = applyGeminiOverrides({ showThoughts: false }, config);

      expect(result.thinkingConfig?.includeThoughts).toBe(false);
    });

    it("overrides includeThoughts when showThoughts is true", () => {
      const config = {
        thinkingConfig: { thinkingBudget: 4096, includeThoughts: false },
      };
      const result = applyGeminiOverrides({ showThoughts: true }, config);

      expect(result.thinkingConfig?.includeThoughts).toBe(true);
    });

    it("does not override when thinkingConfig is undefined", () => {
      const result = applyGeminiOverrides({ showThoughts: false }, {});

      expect(result.thinkingConfig).toBeUndefined();
    });

    it("applies showThoughts when thinking is also overridden", () => {
      const config = {
        thinkingConfig: { thinkingBudget: 4096, includeThoughts: true },
      };
      const result = applyGeminiOverrides(
        { thinking: "High", showThoughts: false },
        config,
      );

      expect(result.thinkingConfig?.thinkingBudget).toBe(8192);
      expect(result.thinkingConfig?.includeThoughts).toBe(false);
    });
  });
});
