import { describe, it, expect } from "vitest";
import { applyGeminiOverrides } from "./gemini-message-overrides";

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
      expect(result.thinkingConfig).toEqual({
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
});
