// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
  checkHasApiKey,
  loadEnabledTools,
  loadProviderSettings,
  loadVoiceSpeed,
  loadVoiceVolume,
  saveVoiceSpeed,
  saveVoiceVolume,
  VOICE_SPEED_DEFAULT,
  VOICE_SPEED_MAX,
  VOICE_SPEED_MIN,
  VOICE_VOLUME_DEFAULT,
  VOICE_VOLUME_MAX,
  VOICE_VOLUME_MIN,
} from "#webui/hooks/settings/settings-helpers";

describe("settings-helpers", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe("loadProviderSettings", () => {
    it("migrates port to baseUrl when baseUrl is missing", () => {
      localStorage.setItem(
        "producer_pal_provider_lmstudio",
        JSON.stringify({ port: 5678 }),
      );

      const settings = loadProviderSettings("lmstudio");

      expect(settings.baseUrl).toBe("http://localhost:5678/v1");
    });

    it("does not overwrite existing baseUrl during port migration", () => {
      localStorage.setItem(
        "producer_pal_provider_lmstudio",
        JSON.stringify({ port: 5678, baseUrl: "http://custom:9999" }),
      );

      const settings = loadProviderSettings("lmstudio");

      expect(settings.baseUrl).toBe("http://custom:9999");
    });

    it("falls through to defaults on invalid JSON", () => {
      localStorage.setItem(
        "producer_pal_provider_anthropic",
        "not-valid-json{{{",
      );

      const settings = loadProviderSettings("anthropic");

      expect(settings.apiKey).toBe("");
      expect(settings.model).toBe("claude-sonnet-4-6");
    });
  });

  describe("checkHasApiKey", () => {
    it("returns false for invalid JSON in saved data", () => {
      localStorage.setItem("producer_pal_provider_anthropic", "bad-json{");

      expect(checkHasApiKey("anthropic")).toBe(false);
    });
  });

  describe("loadEnabledTools", () => {
    it("returns empty object for invalid JSON in saved data", () => {
      localStorage.setItem("producer_pal_enabled_tools", "not-json");

      expect(loadEnabledTools()).toStrictEqual({});
    });
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
});
