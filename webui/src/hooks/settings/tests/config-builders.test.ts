// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, it, expect } from "vitest";
import {
  extractGptVersion,
  isAlwaysOnThinkingModel,
  isLegacyNonThinkingModel,
  mapThinkingToOllamaThink,
  mapThinkingToOpenRouterEffort,
  mapThinkingToReasoningEffort,
  mapThinkingToRealtimeEffort,
  mapTurnDetectionToConfig,
} from "#webui/hooks/settings/config-builders";
import {
  DEFAULT_TURN_DETECTION,
  type TurnDetectionSettings,
} from "#webui/hooks/settings/turn-detection-helpers";

describe("config-builders", () => {
  describe("isAlwaysOnThinkingModel", () => {
    it("is true for Fable and Mythos models", () => {
      expect(isAlwaysOnThinkingModel("claude-fable-5-1")).toBe(true);
      expect(isAlwaysOnThinkingModel("claude-mythos-5")).toBe(true);
    });

    it("is false for other models", () => {
      expect(isAlwaysOnThinkingModel("claude-sonnet-5")).toBe(false);
      expect(isAlwaysOnThinkingModel("claude-haiku-4-5")).toBe(false);
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
      expect(isLegacyNonThinkingModel("claude-sonnet-5")).toBe(false);
      expect(isLegacyNonThinkingModel("claude-opus-5")).toBe(false);
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

    it("should return null for gpt-5 without decimal", () => {
      expect(extractGptVersion("gpt-5-2025-08-07")).toBeNull();
      expect(extractGptVersion("gpt-5-mini-2025-08-07")).toBeNull();
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

  describe("mapThinkingToOpenRouterEffort", () => {
    it("should map Max to xhigh", () => {
      expect(mapThinkingToOpenRouterEffort("Max")).toBe("xhigh");
    });

    it("should map Default to medium", () => {
      expect(mapThinkingToOpenRouterEffort("Default")).toBe("medium");
    });

    it("should return undefined for Off", () => {
      expect(mapThinkingToOpenRouterEffort("Off")).toBeUndefined();
    });
  });

  describe("mapThinkingToOllamaThink", () => {
    it("should return undefined for Default", () => {
      expect(mapThinkingToOllamaThink("Default", "qwen3.6")).toBeUndefined();
    });

    it("should return false for Off", () => {
      expect(mapThinkingToOllamaThink("Off", "qwen3.6")).toBe(false);
      expect(mapThinkingToOllamaThink("Off", "gpt-oss")).toBe(false);
    });

    it("should return true for Max on non-GPT-OSS", () => {
      expect(mapThinkingToOllamaThink("Max", "qwen3.6")).toBe(true);
    });

    it("should return high string for Max on GPT-OSS", () => {
      expect(mapThinkingToOllamaThink("Max", "gpt-oss")).toBe("high");
    });

    it("should return undefined for unknown thinking level", () => {
      expect(
        mapThinkingToOllamaThink("UnknownLevel", "qwen3.6"),
      ).toBeUndefined();
    });
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
