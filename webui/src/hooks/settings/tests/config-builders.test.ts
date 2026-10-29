// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";
import {
  getGeminiOffThinkingConfig,
  mapThinkingToOllamaEffort,
  mapThinkingToRealtimeEffort,
  mapTurnDetectionToConfig,
} from "#webui/hooks/settings/config-builders";
import {
  DEFAULT_TURN_DETECTION,
  type TurnDetectionSettings,
} from "#webui/hooks/settings/helpers/turn-detection-settings";

describe("config-builders", () => {
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
