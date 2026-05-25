// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * @vitest-environment happy-dom
 */
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it } from "vitest";
import { isEncrypted } from "#webui/lib/api-key-crypto";
import {
  checkHasApiKey,
  loadEnabledTools,
  loadProviderSettings,
  loadProviderSettingsAsync,
  loadVoiceSpeed,
  loadVoiceVolume,
  saveProviderSettings,
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

  describe("apiKey encryption at rest", () => {
    it("save writes an encrypted (not cleartext) apiKey to localStorage", async () => {
      await saveProviderSettings("anthropic", {
        apiKey: "sk-ant-secret",
        model: "claude-sonnet-4-6",
        thinking: "Default",
        temperature: 1.0,
        showThoughts: true,
      });

      const raw = JSON.parse(
        localStorage.getItem("producer_pal_provider_anthropic") ?? "{}",
      );

      expect(raw.apiKey).not.toBe("sk-ant-secret");
      expect(isEncrypted(raw.apiKey)).toBe(true);
    });

    it("load decrypts a saved apiKey back to cleartext", async () => {
      await saveProviderSettings("anthropic", {
        apiKey: "sk-ant-secret",
        model: "claude-sonnet-4-6",
        thinking: "Default",
        temperature: 1.0,
        showThoughts: true,
      });

      const loaded = await loadProviderSettingsAsync("anthropic");

      expect(loaded.apiKey).toBe("sk-ant-secret");
    });

    it("synchronous load blanks the apiKey (placeholder)", async () => {
      await saveProviderSettings("anthropic", {
        apiKey: "sk-ant-secret",
        model: "claude-sonnet-4-6",
        thinking: "Default",
        temperature: 1.0,
        showThoughts: true,
      });

      // The synchronous loader must not surface ciphertext; it returns "".
      expect(loadProviderSettings("anthropic").apiKey).toBe("");
    });

    it("loads a legacy cleartext apiKey unchanged (migration passthrough)", async () => {
      localStorage.setItem(
        "producer_pal_provider_openai",
        JSON.stringify({ apiKey: "sk-legacy-cleartext", model: "gpt-5.5" }),
      );

      const loaded = await loadProviderSettingsAsync("openai");

      expect(loaded.apiKey).toBe("sk-legacy-cleartext");
    });

    it("save with empty apiKey stores empty (nothing to encrypt)", async () => {
      await saveProviderSettings("openai", {
        apiKey: "",
        model: "gpt-5.5",
        thinking: "Default",
        temperature: 1.0,
        showThoughts: true,
      });

      const raw = JSON.parse(
        localStorage.getItem("producer_pal_provider_openai") ?? "{}",
      );

      expect(raw.apiKey).toBe("");
    });
  });

  describe("checkHasApiKey presence detection", () => {
    it("detects presence for an encrypted apiKey (without decrypting)", async () => {
      await saveProviderSettings("anthropic", {
        apiKey: "sk-ant-secret",
        model: "claude-sonnet-4-6",
        thinking: "Default",
        temperature: 1.0,
        showThoughts: true,
      });

      expect(checkHasApiKey("anthropic")).toBe(true);
    });

    it("detects presence for a legacy cleartext apiKey", () => {
      localStorage.setItem(
        "producer_pal_provider_openai",
        JSON.stringify({ apiKey: "sk-legacy-cleartext" }),
      );

      expect(checkHasApiKey("openai")).toBe(true);
    });

    it("returns false when no apiKey is stored", () => {
      expect(checkHasApiKey("anthropic")).toBe(false);
    });
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
