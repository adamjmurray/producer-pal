// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { describe, it, expect } from "vitest";
import {
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
