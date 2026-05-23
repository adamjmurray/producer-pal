// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_TURN_DETECTION,
  loadTurnDetection,
  saveTurnDetection,
  TURN_DETECTION_SILENCE_MAX,
  TURN_DETECTION_SILENCE_MIN,
  TURN_DETECTION_THRESHOLD_MAX,
  TURN_DETECTION_THRESHOLD_MIN,
  type TurnDetectionSettings,
} from "#webui/hooks/settings/turn-detection-helpers";

const KEY = "producer_pal_turn_detection";

describe("turn-detection-helpers", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("loadTurnDetection", () => {
    it("returns defaults when nothing is stored", () => {
      expect(loadTurnDetection()).toStrictEqual(DEFAULT_TURN_DETECTION);
    });

    it("round-trips a valid settings object", () => {
      const settings: TurnDetectionSettings = {
        mode: "semantic_vad",
        threshold: 0.7,
        silenceDurationMs: 400,
        eagerness: "high",
      };

      saveTurnDetection(settings);
      expect(loadTurnDetection()).toStrictEqual(settings);
    });

    it("falls back to defaults on invalid JSON", () => {
      localStorage.setItem(KEY, "not-json{{{");
      expect(loadTurnDetection()).toStrictEqual(DEFAULT_TURN_DETECTION);
    });

    it("falls back to defaults for an unknown mode", () => {
      localStorage.setItem(KEY, JSON.stringify({ mode: "bogus_vad" }));
      expect(loadTurnDetection().mode).toBe(DEFAULT_TURN_DETECTION.mode);
    });

    it("falls back to defaults for an unknown eagerness", () => {
      localStorage.setItem(KEY, JSON.stringify({ eagerness: "extreme" }));
      expect(loadTurnDetection().eagerness).toBe(
        DEFAULT_TURN_DETECTION.eagerness,
      );
    });

    it("clamps a too-high threshold down to the max", () => {
      localStorage.setItem(KEY, JSON.stringify({ threshold: 5 }));
      expect(loadTurnDetection().threshold).toBe(TURN_DETECTION_THRESHOLD_MAX);
    });

    it("clamps a too-low threshold up to the min", () => {
      localStorage.setItem(KEY, JSON.stringify({ threshold: -1 }));
      expect(loadTurnDetection().threshold).toBe(TURN_DETECTION_THRESHOLD_MIN);
    });

    it("clamps the silence duration to its bounds", () => {
      localStorage.setItem(KEY, JSON.stringify({ silenceDurationMs: 99999 }));
      expect(loadTurnDetection().silenceDurationMs).toBe(
        TURN_DETECTION_SILENCE_MAX,
      );

      localStorage.setItem(KEY, JSON.stringify({ silenceDurationMs: 0 }));
      expect(loadTurnDetection().silenceDurationMs).toBe(
        TURN_DETECTION_SILENCE_MIN,
      );
    });

    it("falls back to default numbers for non-finite values", () => {
      localStorage.setItem(
        KEY,
        JSON.stringify({ threshold: "loud", silenceDurationMs: null }),
      );

      const loaded = loadTurnDetection();

      expect(loaded.threshold).toBe(DEFAULT_TURN_DETECTION.threshold);
      expect(loaded.silenceDurationMs).toBe(
        DEFAULT_TURN_DETECTION.silenceDurationMs,
      );
    });
  });
});
