// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";
import {
  extractGptVersion,
  getThinkingOffType,
  isAlwaysOnThinkingModel,
  getGeminiOffThinkingConfig,
  isOpenAIReasoningModel,
  isLegacyNonThinkingModel,
  isLegacyThinkingModel,
  mapThinkingToOllamaEffort,
  mapThinkingToOpenRouterEffort,
  mapThinkingToReasoningEffort,
  mapThinkingToRealtimeEffort,
  mapTurnDetectionToConfig,
} from "#webui/hooks/settings/config-builders";
import {
  DEFAULT_TURN_DETECTION,
  type TurnDetectionSettings,
} from "#webui/hooks/settings/helpers/turn-detection-settings";

describe("config-builders", () => {
  describe("getThinkingOffType", () => {
    it.each([
      ["claude-sonnet-5-5", "between_tools"],
      ["claude-sonnet-5.5", "between_tools"],
      ["claude-haiku-5-5", "disabled"],
      ["claude-sonnet-4-6", "disabled"],
      ["claude-opus-5-5", undefined],
      ["claude-opus-5.5", undefined],
      ["claude-fable-5-1", undefined],
      ["claude-mythos-5", undefined],
      ["claude-haiku-4-5", undefined],
      ["claude-3-5-sonnet-20241022", undefined],
    ])("for %s is %s", (model, expected) => {
      expect(getThinkingOffType(model)).toBe(expected);
    });
  });

  describe("isAlwaysOnThinkingModel", () => {
    it("is true for Opus 5.5 under either id spelling", () => {
      expect(isAlwaysOnThinkingModel("claude-opus-5-5")).toBe(true);
      expect(isAlwaysOnThinkingModel("claude-opus-5.5")).toBe(true);
    });

    it("is true for Fable and Mythos models", () => {
      expect(isAlwaysOnThinkingModel("claude-fable-5-1")).toBe(true);
      expect(isAlwaysOnThinkingModel("claude-mythos-5")).toBe(true);
    });

    it("is false for other models", () => {
      expect(isAlwaysOnThinkingModel("claude-sonnet-5-5")).toBe(false);
      expect(isAlwaysOnThinkingModel("claude-haiku-4-5")).toBe(false);
    });
  });

  describe("isLegacyThinkingModel", () => {
    it("is true for Haiku 4.5 ids", () => {
      expect(isLegacyThinkingModel("claude-haiku-4-5")).toBe(true);
      expect(isLegacyThinkingModel("claude-haiku-4-5-20251001")).toBe(true);
      expect(isLegacyThinkingModel("anthropic/claude-haiku-4.5")).toBe(true);
    });

    it("is false for Haiku 5.5, which rejects budget thinking", () => {
      expect(isLegacyThinkingModel("claude-haiku-5-5")).toBe(false);
      expect(isLegacyThinkingModel("anthropic/claude-haiku-5.5")).toBe(false);
    });
  });

  describe("isLegacyNonThinkingModel", () => {
    it("is true for Claude 3.0 / 3.5 and Claude 2 / instant ids", () => {
      expect(isLegacyNonThinkingModel("claude-3-opus-20240229")).toBe(true);
      expect(isLegacyNonThinkingModel("claude-3-sonnet-20240229")).toBe(true);
      expect(isLegacyNonThinkingModel("claude-3-5-sonnet-20241022")).toBe(true);
      expect(isLegacyNonThinkingModel("claude-3.5-sonnet")).toBe(true);
      expect(isLegacyNonThinkingModel("claude-2.1")).toBe(true);
      expect(isLegacyNonThinkingModel("claude-instant-1.2")).toBe(true);
    });

    it("is false for 3.7+ and modern named-tier ids (they support thinking)", () => {
      expect(isLegacyNonThinkingModel("claude-3-7-sonnet")).toBe(false);
      expect(isLegacyNonThinkingModel("claude-sonnet-5-5")).toBe(false);
      expect(isLegacyNonThinkingModel("claude-opus-5-5")).toBe(false);
      expect(isLegacyNonThinkingModel("claude-haiku-4-5")).toBe(false);
    });
  });

  describe("mapTurnDetectionToConfig", () => {
    const base: TurnDetectionSettings = {
      ...DEFAULT_TURN_DETECTION,
      mode: "server_vad",
      threshold: 0.6,
      silenceDurationMs: 300,
      eagerness: "high",
      interruptResponse: true,
    };

    it("maps server_vad to threshold + silence + interrupt_response", () => {
      expect(mapTurnDetectionToConfig(base)).toStrictEqual({
        type: "server_vad",
        threshold: 0.6,
        silence_duration_ms: 300,
        interrupt_response: true,
      });
    });

    it("maps semantic_vad to eagerness + interrupt_response", () => {
      expect(
        mapTurnDetectionToConfig({ ...base, mode: "semantic_vad" }),
      ).toStrictEqual({
        type: "semantic_vad",
        eagerness: "high",
        interrupt_response: true,
      });
    });

    it("passes interrupt_response: false through (barge-in off)", () => {
      expect(
        mapTurnDetectionToConfig({ ...base, interruptResponse: false })
          .interrupt_response,
      ).toBe(false);
    });
  });

  describe("extractGptVersion", () => {
    it("should extract version from gpt-5.2 models", () => {
      expect(extractGptVersion("gpt-5.2-2025-12-11")).toBe(5.2);
      expect(extractGptVersion("gpt-5.2-turbo")).toBe(5.2);
    });

    it("should extract version from gpt-5.1 models", () => {
      expect(extractGptVersion("gpt-5.1-2025-01-01")).toBe(5.1);
      expect(extractGptVersion("gpt-5.1-codex-max")).toBe(5.1);
    });

    it("should extract whole-number versions", () => {
      expect(extractGptVersion("gpt-5-2025-08-07")).toBe(5);
      expect(extractGptVersion("gpt-5-mini-2025-08-07")).toBe(5);
      expect(extractGptVersion("gpt-6.1-sol")).toBe(6.1);
    });

    it("should return null for non-gpt models", () => {
      expect(extractGptVersion("o1-preview")).toBeNull();
      expect(extractGptVersion("claude-3")).toBeNull();
    });
  });

  describe("mapThinkingToReasoningEffort", () => {
    it("should return undefined for unsupported models", () => {
      expect(mapThinkingToReasoningEffort("Max", "gpt-4")).toBeUndefined();
    });

    it("should return undefined for gpt-5 without decimal", () => {
      expect(
        mapThinkingToReasoningEffort("Max", "gpt-5-2025-08-07"),
      ).toBeUndefined();
    });

    describe("o1/o3 models", () => {
      it("should map Max to high", () => {
        expect(mapThinkingToReasoningEffort("Max", "o1")).toBe("high");
      });

      it("should map Default to medium", () => {
        expect(mapThinkingToReasoningEffort("Default", "o1")).toBe("medium");
      });

      it("should return undefined for Off", () => {
        expect(mapThinkingToReasoningEffort("Off", "o1")).toBeUndefined();
      });
    });

    describe("gpt-5.1 models", () => {
      it("should map Max to high (capped for 5.1)", () => {
        expect(mapThinkingToReasoningEffort("Max", "gpt-5.1-2025-01-01")).toBe(
          "high",
        );
      });

      it("should allow xhigh for gpt-5.1-codex-max", () => {
        expect(mapThinkingToReasoningEffort("Max", "gpt-5.1-codex-max")).toBe(
          "xhigh",
        );
      });

      it("should map Default to medium", () => {
        expect(
          mapThinkingToReasoningEffort("Default", "gpt-5.1-2025-01-01"),
        ).toBe("medium");
      });

      it("should map Off to undefined", () => {
        expect(
          mapThinkingToReasoningEffort("Off", "gpt-5.1-2025-01-01"),
        ).toBeUndefined();
      });
    });

    describe("gpt-6 models", () => {
      it("should map Max to max", () => {
        expect(mapThinkingToReasoningEffort("Max", "gpt-6.1-sol")).toBe("max");
      });

      it("should map Off to none", () => {
        expect(mapThinkingToReasoningEffort("Off", "gpt-6-luna")).toBe("none");
      });

      it("should map Off to low for GPT-6 models that reject none", () => {
        expect(mapThinkingToReasoningEffort("Off", "gpt-6-astra")).toBe("low");
        expect(mapThinkingToReasoningEffort("Off", "gpt-6.1-sol")).toBe("low");
      });

      it("should keep none for dated ids of the models that accept it", () => {
        expect(
          mapThinkingToReasoningEffort("Off", "gpt-6-luna-2026-09-01"),
        ).toBe("none");
        expect(mapThinkingToReasoningEffort("Off", "gpt-6-sol")).toBe("none");
      });

      it("should map Default to medium", () => {
        expect(mapThinkingToReasoningEffort("Default", "gpt-6-luna")).toBe(
          "medium",
        );
      });
    });

    describe("gpt-5.2+ models", () => {
      it("should map Max to xhigh", () => {
        expect(mapThinkingToReasoningEffort("Max", "gpt-5.2-2025-12-11")).toBe(
          "xhigh",
        );
      });

      it("should map Default to medium", () => {
        expect(
          mapThinkingToReasoningEffort("Default", "gpt-5.2-2025-12-11"),
        ).toBe("medium");
      });
    });
  });

  describe("isOpenAIReasoningModel", () => {
    it("should detect GPT-5+ and o-series models", () => {
      expect(isOpenAIReasoningModel("gpt-5-mini")).toBe(true);
      expect(isOpenAIReasoningModel("gpt-5.2-2025-12-11")).toBe(true);
      expect(isOpenAIReasoningModel("gpt-6-astra")).toBe(true);
      expect(isOpenAIReasoningModel("o3-mini")).toBe(true);
    });

    it("should reject older and unversioned models", () => {
      expect(isOpenAIReasoningModel("gpt-4.1")).toBe(false);
      expect(isOpenAIReasoningModel("gpt-realtime")).toBe(false);
    });
  });

  describe("mapThinkingToOpenRouterEffort", () => {
    it("should map Max to xhigh", () => {
      expect(mapThinkingToOpenRouterEffort("Max")).toBe("xhigh");
    });

    it("should map Default to medium", () => {
      expect(mapThinkingToOpenRouterEffort("Default")).toBe("medium");
    });

    it("should map Off to none", () => {
      expect(mapThinkingToOpenRouterEffort("Off")).toBe("none");
    });
  });

  describe("mapThinkingToOllamaEffort", () => {
    it("should return undefined for Default", () => {
      expect(mapThinkingToOllamaEffort("Default")).toBeUndefined();
    });

    it("should map Off to none", () => {
      expect(mapThinkingToOllamaEffort("Off")).toBe("none");
    });

    it("should send nothing for Max", () => {
      expect(mapThinkingToOllamaEffort("Max")).toBeUndefined();
    });

    it("should return undefined for unknown thinking level", () => {
      expect(mapThinkingToOllamaEffort("UnknownLevel")).toBeUndefined();
    });
  });

  describe("getGeminiOffThinkingConfig", () => {
    it.each(["gemini-3.8-flash", "gemini-4-argon", "gemini-3.5-flash-lite"])(
      "uses the low thinking level for Gemini 3+ (%s)",
      (model) => {
        expect(getGeminiOffThinkingConfig(model)).toStrictEqual({
          thinkingLevel: "low",
        });
      },
    );

    it.each(["gemini-2.5-flash", "gemini-2.5-flash-lite"])(
      "uses a zero budget for Gemini 2.5 (%s)",
      (model) => {
        expect(getGeminiOffThinkingConfig(model)).toStrictEqual({
          thinkingBudget: 0,
        });
      },
    );

    it.each(["gemini-2.5-pro", "gemini-2.0-flash", "gemini-pro", "gemma-4"])(
      "sends nothing for models that can't turn thinking off (%s)",
      (model) => {
        expect(getGeminiOffThinkingConfig(model)).toBeUndefined();
      },
    );
  });

  describe("mapThinkingToRealtimeEffort", () => {
    it("maps Off to minimal", () => {
      expect(mapThinkingToRealtimeEffort("Off")).toBe("minimal");
    });

    it("maps Max to high", () => {
      expect(mapThinkingToRealtimeEffort("Max")).toBe("high");
    });

    it("returns undefined for Default so the API picks its own tier", () => {
      expect(mapThinkingToRealtimeEffort("Default")).toBeUndefined();
    });

    it("returns undefined for unknown levels", () => {
      expect(mapThinkingToRealtimeEffort("Whatever")).toBeUndefined();
      expect(mapThinkingToRealtimeEffort("")).toBeUndefined();
    });
  });
});
