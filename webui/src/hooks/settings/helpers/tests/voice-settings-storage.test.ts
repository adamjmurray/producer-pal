// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  loadRealtimeVoice,
  loadVoiceLanguage,
  loadVoiceSpeed,
  loadVoiceVolume,
  saveRealtimeVoice,
  saveVoiceLanguage,
  saveVoiceSpeed,
  saveVoiceVolume,
  VOICE_SPEED_DEFAULT,
  VOICE_SPEED_MAX,
  VOICE_SPEED_MIN,
  VOICE_VOLUME_DEFAULT,
  VOICE_VOLUME_MAX,
  VOICE_VOLUME_MIN,
} from "#webui/hooks/settings/helpers/voice-settings-storage";
import { DEFAULT_REALTIME_VOICE } from "#webui/lib/constants/models";

describe("voice-settings-storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("voice speed persistence", () => {
    it("returns the default speed when no value is stored", () => {
      expect(loadVoiceSpeed()).toBe(VOICE_SPEED_DEFAULT);
    });

    it("round-trips through localStorage", () => {
      saveVoiceSpeed(1.25);
      expect(loadVoiceSpeed()).toBe(1.25);
    });

    it("clamps stored values above the max down to the max", () => {
      saveVoiceSpeed(99);
      expect(loadVoiceSpeed()).toBe(VOICE_SPEED_MAX);
    });

    it("clamps stored values below the min up to the min", () => {
      saveVoiceSpeed(0.1);
      expect(loadVoiceSpeed()).toBe(VOICE_SPEED_MIN);
    });

    it("falls back to default on unparseable values", () => {
      localStorage.setItem("producer_pal_voice_speed", "not-a-number");
      expect(loadVoiceSpeed()).toBe(VOICE_SPEED_DEFAULT);
    });
  });

  describe("voice volume persistence", () => {
    it("returns unity when no value is stored (existing users default)", () => {
      expect(loadVoiceVolume()).toBe(VOICE_VOLUME_DEFAULT);
    });

    it("round-trips through localStorage", () => {
      saveVoiceVolume(0.5);
      expect(loadVoiceVolume()).toBe(0.5);
    });

    it("clamps stored values above the max down to the max", () => {
      saveVoiceVolume(5);
      expect(loadVoiceVolume()).toBe(VOICE_VOLUME_MAX);
    });

    it("clamps stored values below the min up to the min", () => {
      saveVoiceVolume(-1);
      expect(loadVoiceVolume()).toBe(VOICE_VOLUME_MIN);
    });

    it("falls back to default on unparseable values", () => {
      localStorage.setItem("producer_pal_voice_volume", "not-a-number");
      expect(loadVoiceVolume()).toBe(VOICE_VOLUME_DEFAULT);
    });
  });

  // The two providers share one stored field, so a Gemini voice has to survive
  // a reload even though it is not an OpenAI voice id.
  describe("realtime voice persistence", () => {
    it("returns the default when nothing is stored", () => {
      expect(loadRealtimeVoice()).toBe(DEFAULT_REALTIME_VOICE);
    });

    it("round-trips an OpenAI voice", () => {
      saveRealtimeVoice("marin");
      expect(loadRealtimeVoice()).toBe("marin");
    });

    it("round-trips a Gemini voice", () => {
      saveRealtimeVoice("Puck");
      expect(loadRealtimeVoice()).toBe("Puck");
    });

    it("falls back to the default for an unknown stored voice", () => {
      saveRealtimeVoice("not-a-voice");
      expect(loadRealtimeVoice()).toBe(DEFAULT_REALTIME_VOICE);
    });
  });

  describe("voice language persistence", () => {
    it("returns English when no value is stored", () => {
      expect(loadVoiceLanguage()).toBe("en");
    });

    it("round-trips a valid language through localStorage", () => {
      saveVoiceLanguage("es");
      expect(loadVoiceLanguage()).toBe("es");
    });

    it("falls back to English for an unknown stored code", () => {
      localStorage.setItem("producer_pal_voice_language", "xx");
      expect(loadVoiceLanguage()).toBe("en");
    });
  });
});
