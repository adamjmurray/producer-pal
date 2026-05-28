// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_GEMINI_VAD,
  DEFAULT_TURN_DETECTION,
  GEMINI_VAD_PREFIX_MAX,
  GEMINI_VAD_SILENCE_MAX,
  GEMINI_VAD_SILENCE_MIN,
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
        ...DEFAULT_TURN_DETECTION,
        mode: "semantic_vad",
        threshold: 0.7,
        silenceDurationMs: 400,
        eagerness: "high",
        interruptResponse: true,
      };

      saveTurnDetection(settings);
      expect(loadTurnDetection()).toStrictEqual(settings);
    });

    it("defaults barge-in off and ignores a non-boolean stored value", () => {
      expect(loadTurnDetection().interruptResponse).toBe(false);

      localStorage.setItem(KEY, JSON.stringify({ interruptResponse: "yes" }));
      expect(loadTurnDetection().interruptResponse).toBe(false);

      localStorage.setItem(KEY, JSON.stringify({ interruptResponse: true }));
      expect(loadTurnDetection().interruptResponse).toBe(true);
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

  describe("Gemini VAD", () => {
    it("defaults the gemini block when absent", () => {
      expect(loadTurnDetection().gemini).toStrictEqual(DEFAULT_GEMINI_VAD);
    });

    it("round-trips a valid gemini block", () => {
      const gemini = {
        startSensitivity: "high" as const,
        endSensitivity: "high" as const,
        silenceDurationMs: 500,
        prefixPaddingMs: 100,
        interruptResponse: false,
      };

      saveTurnDetection({ ...DEFAULT_TURN_DETECTION, gemini });
      expect(loadTurnDetection().gemini).toStrictEqual(gemini);
    });

    it("falls back to defaults for unknown sensitivity values", () => {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          gemini: { startSensitivity: "ludicrous", endSensitivity: 42 },
        }),
      );

      const { gemini } = loadTurnDetection();

      expect(gemini.startSensitivity).toBe(DEFAULT_GEMINI_VAD.startSensitivity);
      expect(gemini.endSensitivity).toBe(DEFAULT_GEMINI_VAD.endSensitivity);
    });

    it("defaults gemini barge-in on, ignoring a non-boolean stored value", () => {
      expect(loadTurnDetection().gemini.interruptResponse).toBe(true);

      localStorage.setItem(
        KEY,
        JSON.stringify({ gemini: { interruptResponse: "nope" } }),
      );
      expect(loadTurnDetection().gemini.interruptResponse).toBe(true);
    });

    it("clamps gemini silence and prefix padding to their bounds", () => {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          gemini: { silenceDurationMs: 99999, prefixPaddingMs: -5 },
        }),
      );

      const { gemini } = loadTurnDetection();

      expect(gemini.silenceDurationMs).toBe(GEMINI_VAD_SILENCE_MAX);
      expect(gemini.prefixPaddingMs).toBe(0);
    });

    it("clamps a too-low gemini silence up to the min", () => {
      localStorage.setItem(
        KEY,
        JSON.stringify({
          gemini: { silenceDurationMs: -1, prefixPaddingMs: 99999 },
        }),
      );

      const { gemini } = loadTurnDetection();

      expect(gemini.silenceDurationMs).toBe(GEMINI_VAD_SILENCE_MIN);
      expect(gemini.prefixPaddingMs).toBe(GEMINI_VAD_PREFIX_MAX);
    });
  });
});
