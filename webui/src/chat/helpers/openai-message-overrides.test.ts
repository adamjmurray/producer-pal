import { describe, it, expect } from "vitest";
import { calculateEffectiveSettings } from "./openai-message-overrides";

describe("calculateEffectiveSettings", () => {
  // gpt-5.2 supports full reasoning_effort options including none and xhigh
  const gpt5Config = {
    model: "gpt-5.2",
    temperature: 0.7,
    reasoningEffort: "medium" as const,
    excludeReasoning: false,
  };

  // o1-preview only supports low/medium/high (no none or xhigh)
  const o1Config = {
    model: "o1-preview",
    temperature: 0.7,
    reasoningEffort: "medium" as const,
    excludeReasoning: false,
  };

  describe("no overrides", () => {
    it("returns config values when overrides is undefined", () => {
      const result = calculateEffectiveSettings(undefined, gpt5Config);

      expect(result.temperature).toBe(0.7);
      expect(result.reasoningEffort).toBe("medium");
      expect(result.excludeReasoning).toBe(false);
    });
  });

  describe("temperature overrides", () => {
    it("uses override temperature when provided", () => {
      const result = calculateEffectiveSettings(
        { temperature: 1.2 },
        gpt5Config,
      );

      expect(result.temperature).toBe(1.2);
    });

    it("uses config temperature when override is undefined", () => {
      const result = calculateEffectiveSettings({}, gpt5Config);

      expect(result.temperature).toBe(0.7);
    });
  });

  describe("thinking overrides for gpt-5.x", () => {
    it("maps Off to none reasoning effort", () => {
      const result = calculateEffectiveSettings(
        { thinking: "Off" },
        gpt5Config,
      );

      expect(result.reasoningEffort).toBe("none");
    });

    it("maps Low to low reasoning effort", () => {
      const result = calculateEffectiveSettings(
        { thinking: "Low" },
        gpt5Config,
      );

      expect(result.reasoningEffort).toBe("low");
    });

    it("maps Ultra to xhigh reasoning effort", () => {
      const result = calculateEffectiveSettings(
        { thinking: "Ultra" },
        gpt5Config,
      );

      expect(result.reasoningEffort).toBe("xhigh");
    });
  });

  describe("thinking overrides for o1/o3 models", () => {
    it("maps Off to low for o1 (minimum supported)", () => {
      const result = calculateEffectiveSettings({ thinking: "Off" }, o1Config);

      expect(result.reasoningEffort).toBe("low");
    });

    it("maps Ultra to high for o1 (maximum supported)", () => {
      const result = calculateEffectiveSettings(
        { thinking: "Ultra" },
        o1Config,
      );

      expect(result.reasoningEffort).toBe("high");
    });
  });

  describe("thinking overrides for OpenRouter", () => {
    const openRouterConfig = {
      ...gpt5Config,
      baseUrl: "https://openrouter.ai/api/v1",
    };

    it("maps Off to none and sets excludeReasoning true", () => {
      const result = calculateEffectiveSettings(
        { thinking: "Off" },
        openRouterConfig,
      );

      expect(result.reasoningEffort).toBe("none");
      expect(result.excludeReasoning).toBe(true);
    });

    it("maps Low and sets excludeReasoning false", () => {
      const result = calculateEffectiveSettings(
        { thinking: "Low" },
        openRouterConfig,
      );

      expect(result.reasoningEffort).toBe("low");
      expect(result.excludeReasoning).toBe(false);
    });

    it("sets excludeReasoning based on showThoughts override", () => {
      const result = calculateEffectiveSettings(
        { showThoughts: true },
        openRouterConfig,
      );

      expect(result.excludeReasoning).toBe(false);
    });

    it("hides reasoning when showThoughts is false", () => {
      const result = calculateEffectiveSettings(
        { showThoughts: false },
        openRouterConfig,
      );

      expect(result.excludeReasoning).toBe(true);
    });
  });

  describe("showThoughts for non-OpenRouter", () => {
    it("ignores showThoughts override for non-OpenRouter providers", () => {
      const result = calculateEffectiveSettings(
        { showThoughts: false },
        gpt5Config,
      );

      // excludeReasoning should remain as config value (false)
      expect(result.excludeReasoning).toBe(false);
    });
  });
});
